"""Server-side reading summary emails.

The scheduler deliberately reads persisted reward snapshots rather than browser
events, so a closed tab cannot generate or prevent a scheduled digest.
"""

from __future__ import annotations

import json
import logging
import math
import re
import threading
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from html import escape
from pathlib import Path
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


logger = logging.getLogger("localreader.reading_digest")


def _load_tree_catalog() -> dict[str, dict]:
    catalog_path = Path(__file__).resolve().parent / "assets" / "rewards" / "trees" / "catalog.json"
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        logger.exception("Unable to load tree catalog for reading digest")
        return {}
    return {
        str(definition.get("id")): definition
        for definition in catalog.get("trees", [])
        if isinstance(definition, dict) and definition.get("id") and definition.get("image")
    }


TREE_CATALOG = _load_tree_catalog()


@dataclass(frozen=True)
class DigestWindow:
    digest_type: str
    period_key: str
    start_date: date
    end_date: date


def resolve_timezone(timezone_name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(str(timezone_name or "UTC"))
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning("Unknown digest timezone %r; using UTC", timezone_name)
        return ZoneInfo("UTC")


def scheduled_digest_windows(
    now_utc: datetime,
    timezone_name: str,
    *,
    weekly_hour: int = 18,
    monthly_hour: int = 9,
    yearly_hour: int = 18,
) -> list[DigestWindow]:
    """Return digest periods due at the supplied instant in the user's timezone."""
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    local_now = now_utc.astimezone(resolve_timezone(timezone_name))
    current = local_now.date()
    due: list[DigestWindow] = []

    # Python weekday: Monday=0, Saturday=5.
    if local_now.weekday() == 5 and local_now.hour >= weekly_hour:
        start = current - timedelta(days=local_now.weekday())
        due.append(DigestWindow("weekly", current.isoformat(), start, current))

    if current.day == 1 and local_now.hour >= monthly_hour:
        previous_end = current - timedelta(days=1)
        previous_start = previous_end.replace(day=1)
        due.append(
            DigestWindow(
                "monthly",
                previous_start.strftime("%Y-%m"),
                previous_start,
                previous_end,
            )
        )

    if current.month == 12 and current.day == 31 and local_now.hour >= yearly_hour:
        due.append(DigestWindow("yearly", str(current.year), current.replace(month=1, day=1), current))

    return due


def summarize_reward_snapshot(snapshot: dict | None, window: DigestWindow, timezone_name: str) -> dict:
    """Aggregate active time, reading days, completed trees, and points."""
    snapshot = snapshot if isinstance(snapshot, dict) else {}
    active_by_day = snapshot.get("activeTimeByDay")
    active_by_day = active_by_day if isinstance(active_by_day, dict) else {}

    total_ms = 0.0
    reading_days = 0
    for day_key, raw_ms in active_by_day.items():
        try:
            day = date.fromisoformat(str(day_key))
            milliseconds = max(0.0, float(raw_ms))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(milliseconds):
            continue
        if window.start_date <= day <= window.end_date:
            total_ms += milliseconds
            if milliseconds > 0:
                reading_days += 1

    zone = resolve_timezone(timezone_name)
    reflections = snapshot.get("reflections") if isinstance(snapshot.get("reflections"), list) else []
    reflection_by_id = {
        str(reflection.get("id")): reflection
        for reflection in reflections
        if isinstance(reflection, dict) and reflection.get("id")
    }
    reflection_by_session = {
        str(reflection.get("sessionId")): reflection
        for reflection in reflections
        if isinstance(reflection, dict) and reflection.get("sessionId")
    }
    sessions = snapshot.get("sessions") if isinstance(snapshot.get("sessions"), list) else []
    session_by_id = {
        str(session.get("id")): session
        for session in sessions
        if isinstance(session, dict) and session.get("id")
    }
    period_plants = []
    for plant in snapshot.get("plants") if isinstance(snapshot.get("plants"), list) else []:
        if not isinstance(plant, dict) or plant.get("stage") != "mature":
            continue
        raw_timestamp = plant.get("completedAt") or plant.get("plantedAt")
        try:
            completed = datetime.fromtimestamp(float(raw_timestamp) / 1000, timezone.utc).astimezone(zone).date()
        except (TypeError, ValueError, OSError, OverflowError):
            continue
        if window.start_date <= completed <= window.end_date:
            session_id = str(plant.get("sessionId") or "")
            reflection_id = str(plant.get("reflectionId") or "")
            reflection = reflection_by_id.get(reflection_id) or reflection_by_session.get(session_id) or {}
            session = session_by_id.get(session_id) or {}
            document = session.get("document") if isinstance(session.get("document"), dict) else {}
            period_plants.append({
                "speciesId": str(plant.get("speciesId") or "tree"),
                "stage": "mature",
                "cell": plant.get("cell") if isinstance(plant.get("cell"), dict) else None,
                "completedAt": raw_timestamp,
                "reflectionText": str(reflection.get("text") or "").strip(),
                "documentTitle": _display_document_title(document.get("title")),
            })

    points = 0
    ledger = snapshot.get("rewardLedger")
    for transaction in ledger if isinstance(ledger, list) else []:
        if not isinstance(transaction, dict):
            continue
        try:
            transaction_date = date.fromisoformat(str(transaction.get("localDate")))
            transaction_points = int(transaction.get("points") or 0)
        except (TypeError, ValueError):
            continue
        if window.start_date <= transaction_date <= window.end_date:
            points += transaction_points

    return {
        "activeReadingMs": total_ms,
        "readingDays": reading_days,
        "matureTrees": len(period_plants),
        "growthPoints": points,
        "periodPlants": period_plants,
    }


def format_reading_duration(milliseconds: float) -> str:
    minutes = max(0, math.floor(float(milliseconds or 0) / 60000))
    if minutes == 0:
        return "menos de um minuto" if milliseconds > 0 else "0 minutos"
    hours, remainder = divmod(minutes, 60)
    if not hours:
        return f"{minutes} minuto{'s' if minutes != 1 else ''}"
    if not remainder:
        return f"{hours} hora{'s' if hours != 1 else ''}"
    return (
        f"{hours} hora{'s' if hours != 1 else ''} e "
        f"{remainder} minuto{'s' if remainder != 1 else ''}"
    )


def _compact_text(value, limit: int) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[: max(1, limit - 1)].rstrip() + "…"


def _display_document_title(value) -> str:
    return re.sub(r"\.pdf$", "", str(value or "").strip(), flags=re.IGNORECASE).strip()


def build_digest_email(
    app_name: str,
    window: DigestWindow,
    summary: dict,
    public_app_url: str = "",
) -> tuple[str, str]:
    period_name = {
        "weekly": "semanal",
        "monthly": "mensal",
        "yearly": "anual",
    }[window.digest_type]
    duration = format_reading_duration(summary["activeReadingMs"])
    days = int(summary["readingDays"])
    trees = int(summary["matureTrees"])
    points = int(summary["growthPoints"])
    subject = f"{app_name}: seu resumo {period_name} de leitura"
    body = (
        f"Seu resumo {period_name} de leitura\n\n"
        f"{window.start_date.strftime('%d/%m/%Y')} a {window.end_date.strftime('%d/%m/%Y')}\n\n"
        f"Você leu por {duration} em {days} dia{'s' if days != 1 else ''} de leitura.\n"
        f"Você plantou {trees} árvore{'s' if trees != 1 else ''} e ganhou {points} ponto"
        f"{'s' if points != 1 else ''} de crescimento.\n\n"
        "Continue lendo no seu ritmo — o seu jardim nunca murcha."
    )
    planted = summary.get("periodPlants") if isinstance(summary.get("periodPlants"), list) else []
    reflected = [plant for plant in planted if str(plant.get("reflectionText") or "").strip()]
    if reflected:
        body += "\n\nAnotações das árvores que você plantou"
        for plant in reflected:
            comment = _compact_text(plant.get("reflectionText"), 420)
            title = _compact_text(plant.get("documentTitle"), 100)
            body += f'\n\n“{comment}”'
            if title:
                body += f"\n— {title}"
    if public_app_url:
        body += f"\n\n{public_app_url.rstrip('/')}/"
    body += "\n\nVocê pode desativar os e-mails de resumo em Configurações."
    body += "\n\n—\nLeiaMe · Rodrigo Paes Coelho Santana · paescoelho@gmail.com"
    return subject, body


def _normalized_app_url(public_app_url: str) -> str:
    value = str(public_app_url or "").strip()
    if value and not urlparse(value).scheme:
        value = "https://" + value
    return value.rstrip("/") + "/" if value else ""


def _tree_html(plant: dict, app_url: str) -> str:
    definition = TREE_CATALOG.get(str(plant.get("speciesId") or ""))
    if not definition:
        return ""
    asset_path = str(definition["image"]).removeprefix("./")
    source = urljoin(app_url, asset_path) if app_url else asset_path
    stage = str(plant.get("stage") or "seed")
    sizes = {"seed": 25, "sprout": 31, "young": 39, "flowering": 47, "mature": 56}
    size = sizes.get(stage, 56)
    opacity = "0.68" if stage == "seed" else "0.82" if stage == "sprout" else "1"
    return (
        f'<img src="{escape(source, quote=True)}" width="{size}" alt="{escape(str(definition.get("name") or "Árvore"), quote=True)}" '
        f'style="display:block;width:{size}px;height:auto;max-height:66px;margin:0 auto;opacity:{opacity};border:0">'
    )


def _garden_html(summary: dict, app_url: str) -> str:
    plants = summary.get("periodPlants")
    plants = plants if isinstance(plants, list) else []
    mature_count = len(plants)
    def cell_coordinate(plant: dict, axis: str) -> int:
        try:
            return int((plant.get("cell") or {}).get(axis, 999))
        except (TypeError, ValueError):
            return 999

    visible = sorted(
        plants,
        key=lambda plant: (
            cell_coordinate(plant, "y"),
            cell_coordinate(plant, "x"),
        ),
    )[-18:]
    trees = [_tree_html(item, app_url) for item in visible]
    trees = [tree for tree in trees if tree]
    rows = []
    for offset in range(0, len(trees), 6):
        cells = "".join(
            '<td align="center" valign="bottom" style="width:16.66%;height:54px;'
            'padding:2px">'
            f'{tree}</td>'
            for tree in trees[offset:offset + 6]
        )
        cells += '<td style="width:16.66%"></td>' * (6 - len(trees[offset:offset + 6]))
        rows.append(f"<tr>{cells}</tr>")
    if not rows:
        rows.append(
            '<tr><td align="center" style="height:72px;font:14px Inter,Arial,sans-serif;color:#7e7466">'
            'Sua próxima árvore vai aparecer aqui.</td></tr>'
        )
    tree_label = f"{mature_count} árvore{'s' if mature_count != 1 else ''} plantada{'s' if mature_count != 1 else ''} no período"
    return (
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
        'style="background-color:#faf8f4;border-radius:12px;border:1px solid #e7e0d4;padding:16px 14px 0">'
        '<tr><td align="center" style="color:#2f6f66;font:700 12px Inter,Arial,sans-serif;letter-spacing:.08em;'
        f'text-transform:uppercase;padding-bottom:12px">Suas novas árvores · {escape(tree_label)}</td></tr>'
        '<tr><td style="background-color:#dff6e8;background-image:linear-gradient(180deg,#dff6e8 0%,#edf8d7 64%,#b9d98b 65%,#8ebc6d 100%);'
        'border-radius:10px 10px 0 0;padding:13px 8px 9px">'
        f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0">{"".join(rows)}</table>'
        '</td></tr></table>'
    )


def build_digest_html(
    app_name: str,
    window: DigestWindow,
    summary: dict,
    public_app_url: str = "",
) -> str:
    """Build a conservative, inline-styled HTML email for broad client support."""
    period_name = {"weekly": "semanal", "monthly": "mensal", "yearly": "anual"}[window.digest_type]
    period_word = {"weekly": "nesta semana", "monthly": "neste mês", "yearly": "neste ano"}[window.digest_type]
    duration = format_reading_duration(summary["activeReadingMs"])
    days = int(summary["readingDays"])
    trees = int(summary["matureTrees"])
    points = int(summary["growthPoints"])
    app_url = _normalized_app_url(public_app_url)
    brand_icon = (
        f'<img src="{escape(urljoin(app_url, "assets/icons/icon-192.png"), quote=True)}" width="46" height="46" '
        f'alt="{escape(app_name, quote=True)}" style="display:block;width:46px;height:46px;border:0;border-radius:11px">'
        if app_url else ""
    )
    button = (
        f'<a href="{escape(app_url, quote=True)}" style="display:inline-block;background:#2f6f66;color:#fff;'
        'font:700 15px Inter,Arial,sans-serif;text-decoration:none;padding:13px 22px;border-radius:9px">'
        'Voltar à sua biblioteca&nbsp; →</a>'
        if app_url else ""
    )
    reflection_cards = []
    planted = summary.get("periodPlants") if isinstance(summary.get("periodPlants"), list) else []
    for plant in planted:
        comment = escape(_compact_text(plant.get("reflectionText"), 420))
        title = escape(_compact_text(plant.get("documentTitle"), 100))
        if not comment:
            continue
        tree = _tree_html(plant, app_url)
        source = f'<div style="margin-top:9px;font:600 12px Inter,Arial,sans-serif;color:#2f6f66">{title}</div>' if title else ""
        reflection_cards.append(
            '<td style="padding:0 0 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
            'style="background:#faf8f4;border:1px solid #e7e0d4;border-left:4px solid #2f6f66;border-radius:10px"><tr>'
            f'<td width="76" align="center" valign="middle" style="padding:14px 5px 14px 14px">{tree}</td>'
            '<td valign="middle" style="padding:15px 16px 15px 8px">'
            f'<div style="font:15px/1.55 Inter,Arial,sans-serif;color:#3a332c">“{comment}”</div>{source}'
            '</td></tr></table></td>'
        )
    reflections_html = ""
    if reflection_cards:
        reflections_html = (
            '<tr><td style="padding:28px 32px 0"><div style="font:700 19px Inter,Arial,sans-serif;color:#2a2520;'
            'margin-bottom:12px">Anotações das árvores que você plantou</div>'
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>'
            + '</tr><tr>'.join(reflection_cards) + '</tr></table></td></tr>'
        )
    return f'''<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>{escape(app_name)} — resumo de leitura</title></head>
<body style="margin:0;background:#f4efe6;padding:24px 10px;color:#2a2520;font-family:Inter,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">{escape(duration)} de leitura e {trees} árvore{'s' if trees != 1 else ''} nova{'s' if trees != 1 else ''} plantada{'s' if trees != 1 else ''}.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e7e0d4;border-radius:16px;overflow:hidden;box-shadow:0 10px 28px rgba(28,24,20,.08)">
<tr><td height="5" style="height:5px;background:#2f6f66;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 27px;background:#1a1816;color:#fff">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="58" valign="middle">{brand_icon}</td><td valign="middle"><div style="font:700 14px Inter,Arial,sans-serif;letter-spacing:.08em;color:#d5ccbd">{escape(app_name)}</div><div style="font:12px Inter,Arial,sans-serif;color:#a99f90;margin-top:3px">Seu espaço pessoal de leitura</div></td></tr></table>
<h1 style="margin:24px 0 8px;font:700 29px/1.2 Inter,Arial,sans-serif;letter-spacing:-.02em">Sua história de leitura {period_name}</h1>
<div style="font:14px Inter,Arial,sans-serif;color:#d5ccbd">{window.start_date.strftime('%d/%m/%Y')} – {window.end_date.strftime('%d/%m/%Y')}</div>
</td></tr>
<tr><td style="padding:26px 32px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
<td width="31%" align="center" style="padding:14px 6px;background:#faf8f4;border:1px solid #e7e0d4;border-radius:10px"><div style="font:700 21px Inter,Arial,sans-serif;color:#2f6f66">{escape(duration)}</div><div style="font:700 11px Inter,Arial,sans-serif;color:#7e7466;margin-top:5px;letter-spacing:.06em">LEITURA</div></td>
<td width="3%"></td>
<td width="31%" align="center" style="padding:14px 6px;background:#faf8f4;border:1px solid #e7e0d4;border-radius:10px"><div style="font:700 21px Inter,Arial,sans-serif;color:#2f6f66">{days}</div><div style="font:700 11px Inter,Arial,sans-serif;color:#7e7466;margin-top:5px;letter-spacing:.06em">DIA{'S' if days != 1 else ''} DE LEITURA</div></td>
<td width="3%"></td>
<td width="31%" align="center" style="padding:14px 6px;background:#faf8f4;border:1px solid #e7e0d4;border-radius:10px"><div style="font:700 21px Inter,Arial,sans-serif;color:#2f6f66">+{points}</div><div style="font:700 11px Inter,Arial,sans-serif;color:#7e7466;margin-top:5px;letter-spacing:.06em">PONTOS DE CRESCIMENTO</div></td>
</tr></table></td></tr>
<tr><td style="padding:27px 32px 0">{_garden_html(summary, app_url)}</td></tr>
<tr><td style="padding:17px 35px 0;text-align:center;font:14px/1.6 Inter,Arial,sans-serif;color:#7e7466">Você plantou <b style="color:#3a332c">{trees} árvore{'s' if trees != 1 else ''} nova{'s' if trees != 1 else ''}</b> {period_word}. Continue lendo no seu ritmo — o seu jardim nunca murcha.</td></tr>
{reflections_html}
<tr><td align="center" style="padding:27px 32px 31px">{button}</td></tr>
<tr><td align="center" style="padding:18px 24px;background:#faf8f4;border-top:1px solid #e7e0d4;font:12px/1.5 Inter,Arial,sans-serif;color:#a99f90">Você pode desativar os e-mails de resumo em Configurações.<br>LeiaMe · Rodrigo Paes Coelho Santana · <a href="mailto:paescoelho@gmail.com" style="color:#2f6f66">paescoelho@gmail.com</a></td></tr>
</table></td></tr></table></body></html>'''


class ReadingDigestService:
    """Polls persisted accounts and sends each period at most once."""

    def __init__(
        self,
        *,
        repository,
        send_email,
        app_name: str = "LeiaMe",
        public_app_url: str = "",
        poll_interval_seconds: int = 900,
        weekly_hour: int = 18,
        monthly_hour: int = 9,
        yearly_hour: int = 18,
        now=lambda: datetime.now(timezone.utc),
    ):
        self.repository = repository
        self.send_email = send_email
        self.app_name = app_name
        self.public_app_url = public_app_url
        self.poll_interval_seconds = max(60, int(poll_interval_seconds))
        self.weekly_hour = max(0, min(23, int(weekly_hour)))
        self.monthly_hour = max(0, min(23, int(monthly_hour)))
        self.yearly_hour = max(0, min(23, int(yearly_hour)))
        self.now = now
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def run_once(self) -> int:
        sent = 0
        current = self.now()
        for recipient in self.repository.list_email_digest_recipients():
            if not recipient.get("enabled"):
                continue
            email = str(recipient.get("email") or "").strip().lower()
            timezone_name = str(recipient.get("timezone") or "UTC")
            if not email:
                continue
            windows = scheduled_digest_windows(
                current,
                timezone_name,
                weekly_hour=self.weekly_hour,
                monthly_hour=self.monthly_hour,
                yearly_hour=self.yearly_hour,
            )
            for window in windows:
                if not self.repository.claim_email_digest_delivery(
                    email,
                    window.digest_type,
                    window.period_key,
                ):
                    continue
                try:
                    snapshot = self.repository.get_reward_state(email)
                    summary = summarize_reward_snapshot(snapshot, window, timezone_name)
                    subject, body = build_digest_email(
                        self.app_name,
                        window,
                        summary,
                        self.public_app_url,
                    )
                    html_body = build_digest_html(
                        self.app_name,
                        window,
                        summary,
                        self.public_app_url,
                    )
                    self.send_email(email, subject, body, html_body)
                    self.repository.complete_email_digest_delivery(
                        email,
                        window.digest_type,
                        window.period_key,
                    )
                    sent += 1
                except Exception:
                    self.repository.release_email_digest_delivery(
                        email,
                        window.digest_type,
                        window.period_key,
                    )
                    logger.exception(
                        "Reading digest failed: email=%s type=%s period=%s",
                        email,
                        window.digest_type,
                        window.period_key,
                    )
        return sent

    def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                self.run_once()
            except Exception:
                logger.exception("Reading digest scheduler pass failed")
            self._stop_event.wait(self.poll_interval_seconds)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name="reading-digest", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        self._thread = None
