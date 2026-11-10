"""Daily, opt-in reminders using persisted reading activity and SMTP."""

import logging
from datetime import timezone

from reading_digest_service import ReadingDigestService, resolve_timezone

logger = logging.getLogger("localreader.reading_reminder")


class ReadingReminderService(ReadingDigestService):
    """Reuse the email scheduler lifecycle and atomic delivery ledger."""

    def run_once(self):
        sent = 0
        current = self.now()
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        for recipient in self.repository.list_reading_reminder_recipients():
            email = recipient["email"]
            try:
                local = current.astimezone(resolve_timezone(recipient["timezone"]))
                if local.strftime("%H:%M") < recipient["time"]:
                    continue
                day = local.date().isoformat()
                snapshot = self.repository.get_reward_state(email) or {}
                activity = snapshot.get("activeTimeByDay") or {}
                if float(activity.get(day, 0) or 0) > 0:
                    continue
                if not self.repository.claim_email_digest_delivery(email, "reminder", day):
                    continue
                body = "Alguns minutos com um livro podem ser uma ótima pausa. Que tal ler hoje?\n"
                if self.public_app_url:
                    body += f"\nAbra sua biblioteca: {self.public_app_url}\n"
                body += "\nMude o horário ou desative os lembretes em Configurações → Lembretes de leitura."
                body += "\n\n—\nLeiaMe · Rodrigo Paes Coelho Santana · paescoelho@gmail.com"
                try:
                    self.send_email(email, f"{self.app_name}: hora de ler", body)
                except Exception:
                    self.repository.release_email_digest_delivery(email, "reminder", day)
                    raise
                # Keep the claim if recording success fails: SMTP already accepted the email.
                self.repository.complete_email_digest_delivery(email, "reminder", day)
                sent += 1
            except Exception:
                logger.exception("Reading reminder failed for %s", email)
        return sent
