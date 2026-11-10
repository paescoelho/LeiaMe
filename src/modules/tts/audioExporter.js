// LeiaMe — exporta a leitura em voz alta para um arquivo MP3.
//
// Usa a mesma voz e a mesma velocidade da reprodução. As frases são geradas na
// ordem do documento e enviadas a um worker que codifica em MP3 (lamejs), para
// a tela não travar. Funciona offline quando a voz já foi baixada.
import { cooperativeYield, formatTextToSpeech, getWebsiteRoot, hasUsableSpeechText } from "../utils/helpers.js";
import { ServerTtsClient } from "./serverTtsClient.js";

const MP3_KBPS = 64;
const SENTENCE_GAP_SEC = 0.3;
const SECTION_GAP_SEC = 0.9;
const PARALLEL_SYNTH = 2;

function abortError() {
    const error = new Error("Exportação cancelada");
    error.name = "AbortError";
    return error;
}

/** Lê um WAV PCM (8/16/24/32 bits ou float) e devolve amostras mono em Float32. */
export function parseWav(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const tag = (offset) => String.fromCharCode(...new Uint8Array(arrayBuffer, offset, 4));
    if (arrayBuffer.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
    let offset = 12;
    let format = null;
    while (offset + 8 <= arrayBuffer.byteLength) {
        const id = tag(offset);
        let size = view.getUint32(offset + 4, true);
        const body = offset + 8;
        if (id === "fmt ") {
            format = {
                audioFormat: view.getUint16(body, true),
                channels: view.getUint16(body + 2, true),
                sampleRate: view.getUint32(body + 4, true),
                bitsPerSample: view.getUint16(body + 14, true),
            };
        } else if (id === "data" && format) {
            // Alguns geradores gravam tamanho 0/inválido no streaming: usa o resto do arquivo.
            if (!size || body + size > arrayBuffer.byteLength) size = arrayBuffer.byteLength - body;
            const { channels, bitsPerSample, audioFormat, sampleRate } = format;
            const bytes = bitsPerSample / 8;
            const frames = Math.floor(size / (bytes * channels));
            const out = new Float32Array(frames);
            for (let i = 0; i < frames; i++) {
                let sum = 0;
                for (let c = 0; c < channels; c++) {
                    const p = body + (i * channels + c) * bytes;
                    let v;
                    if (audioFormat === 3 && bitsPerSample === 32) v = view.getFloat32(p, true);
                    else if (bitsPerSample === 16) v = view.getInt16(p, true) / 32768;
                    else if (bitsPerSample === 8) v = (view.getUint8(p) - 128) / 128;
                    else if (bitsPerSample === 24) {
                        const raw = view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getInt8(p + 2) << 16);
                        v = raw / 8388608;
                    } else if (bitsPerSample === 32) v = view.getInt32(p, true) / 2147483648;
                    else return null;
                    sum += v;
                }
                out[i] = sum / channels;
            }
            return { samples: out, sampleRate };
        }
        offset = body + size + (size % 2);
    }
    return null;
}

/** Reamostragem linear simples (só usada se vozes diferentes tiverem taxas diferentes). */
export function resampleLinear(samples, fromRate, toRate) {
    if (fromRate === toRate) return samples;
    const ratio = fromRate / toRate;
    const length = Math.max(1, Math.round(samples.length / ratio));
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        const pos = i * ratio;
        const i0 = Math.floor(pos);
        const i1 = Math.min(i0 + 1, samples.length - 1);
        const t = pos - i0;
        out[i] = samples[i0] * (1 - t) + samples[i1] * t;
    }
    return out;
}

function safeFileName(name) {
    return String(name || "LeiaMe")
        .replace(/\.(pdf|epub)$/i, "")
        .replace(/[\\/:*?"<>|]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120) || "LeiaMe";
}

function formatDuration(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min ${String(s).padStart(2, "0")}s`;
}

class Mp3Encoder {
    constructor() {
        this.worker = new Worker(`${getWebsiteRoot()}src/modules/tts/mp3EncoderWorker.js`);
        this.sampleRate = null;
        this._waiters = new Map();
        this._seq = 0;
        this._done = null;
        this._error = null;
        this.worker.onmessage = (event) => {
            const msg = event.data || {};
            if (msg.type === "ack") {
                this._waiters.get(msg.id)?.();
                this._waiters.delete(msg.id);
            } else if (msg.type === "ready") {
                this._ready?.();
            } else if (msg.type === "done") {
                this._done?.resolve(msg.blob);
            } else if (msg.type === "error") {
                this._error = new Error(msg.message);
                this._done?.reject(this._error);
                for (const resolve of this._waiters.values()) resolve();
                this._waiters.clear();
            }
        };
        this.worker.onerror = (event) => {
            this._error = new Error(event.message || "Falha no codificador MP3");
            this._done?.reject(this._error);
        };
    }

    async init(sampleRate) {
        this.sampleRate = sampleRate;
        await new Promise((resolve) => {
            this._ready = resolve;
            this.worker.postMessage({ type: "init", sampleRate, kbps: MP3_KBPS });
        });
    }

    async push(samples) {
        if (this._error) throw this._error;
        if (!samples.length) return;
        const id = ++this._seq;
        const copy = samples.slice();
        await new Promise((resolve) => {
            this._waiters.set(id, resolve);
            this.worker.postMessage({ type: "chunk", id, samples: copy }, [copy.buffer]);
        });
        if (this._error) throw this._error;
    }

    finish() {
        return new Promise((resolve, reject) => {
            this._done = { resolve, reject };
            this.worker.postMessage({ type: "end" });
        });
    }

    dispose() {
        this.worker.terminate();
    }
}

export class AudioExporter {
    constructor(app) {
        this.app = app;
        this.overlay = null;
        this.controller = null;
        this.lastUrl = null;
    }

    // ---------------------------------------------------------------- documento
    _isEpub() {
        return this.app.state.currentDocumentType === "epub";
    }

    _hasDocument() {
        const { state } = this.app;
        return this._isEpub() ? (state.sentences?.length || 0) > 0 : !!state.pdf;
    }

    _unitLabel(plural = false) {
        if (this._isEpub()) return plural ? "capítulos" : "capítulo";
        return plural ? "páginas" : "página";
    }

    _totalUnits() {
        const { state } = this.app;
        if (!this._isEpub()) return state.pdf?.numPages || 1;
        let max = 1;
        for (const sentence of state.sentences || []) max = Math.max(max, Number(sentence?.pageNumber) || 1);
        return max;
    }

    _currentUnit() {
        const { state } = this.app;
        const sentence = state.sentences?.[state.currentSentenceIndex];
        return Math.min(Math.max(Number(sentence?.pageNumber) || 1, 1), this._totalUnits());
    }

    _documentName() {
        const { state } = this.app;
        const title = state.epubMetadata?.title;
        const titleText = typeof title === "string" ? title : (title && Object.values(title)[0]) || "";
        return safeFileName(titleText || state.currentPdfDescriptor?.name || state.currentPdfDescriptor?.fileObject?.name);
    }

    _voiceId() {
        const { config } = this.app;
        const engine = this.app.ttsEngine;
        const selected = document.getElementById("voice-select")?.value || engine?.preferredVoiceId || config.DEFAULT_PIPER_VOICE;
        return engine?._getActiveVoiceId ? engine._getActiveVoiceId(selected) : selected;
    }

    async _sentencesForUnit(unit, signal) {
        const { app } = this;
        const { state } = app;
        if (!this._isEpub()) {
            await app.pdfLoader?.ensurePageParsed?.(unit);
            if (signal.aborted) throw abortError();
            const pending = (state.sentences || []).filter((s) => s?.pageNumber === unit && !s.layoutProcessed);
            if (pending.length) {
                await app.pdfRenderer?.ensureFullPageRendered?.(unit);
                if (signal.aborted) throw abortError();
                await app.getPdfHeaderFooterDetector?.()?.ensureReadabilityForPage?.(unit);
                if (signal.aborted) throw abortError();
            }
        }
        const list = [];
        (state.sentences || []).forEach((sentence, index) => {
            if (sentence?.pageNumber !== unit) return;
            if (sentence.layoutProcessed === false || sentence.isTextToRead === false) return;
            const base = (sentence.readableText || sentence.text || "").trim();
            if (hasUsableSpeechText(base)) list.push({ sentence, index, base });
        });
        return list;
    }

    // ---------------------------------------------------------------- voz
    async _speechText(entry) {
        if (!this.app.isReadTranslationEnabled?.()) return entry.base;
        return (await this.app.getSentenceSpeechText?.(entry.index, entry.base)) || entry.base;
    }

    async _synthesize(text, voiceId, speed, signal) {
        const engine = this.app.ttsEngine;
        let client = await engine.ensurePiper(voiceId);
        if (signal.aborted) throw abortError();
        const cleaned = formatTextToSpeech(text);
        let result;
        try {
            result = await client.synthesize(cleaned, speed, undefined, { createBlob: false, signal });
        } catch (error) {
            if (signal.aborted) throw abortError();
            if (!(client instanceof ServerTtsClient) || !engine._fallbackToLocal) throw error;
            client = await engine._fallbackToLocal(voiceId, engine._lifetime);
            result = await client.synthesize(cleaned, speed, undefined, { createBlob: false, signal });
        }
        if (signal.aborted) throw abortError();
        let buffer = result.encodedBuffer || result.wavBuffer;
        if (!buffer && result.blob?.arrayBuffer) buffer = await result.blob.arrayBuffer();
        if (ArrayBuffer.isView(buffer)) buffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        if (!(buffer instanceof ArrayBuffer)) throw new Error("A voz não devolveu áudio");
        const parsed = parseWav(buffer);
        if (parsed) return parsed;
        // Formato não-WAV (ex.: servidor): decodifica pelo navegador.
        await engine.ensureAudioContext();
        const decoded = await engine.safeDecodeAudioData(buffer.slice(0));
        return { samples: decoded.getChannelData(0).slice(), sampleRate: decoded.sampleRate };
    }

    // ---------------------------------------------------------------- exportação
    async export({ from, to }, onProgress) {
        const { app } = this;
        const { state } = app;
        if (this.controller) throw new Error("Já existe uma exportação em andamento");
        const controller = new AbortController();
        this.controller = controller;
        const { signal } = controller;
        const voiceId = this._voiceId();
        const speed = state.CURRENT_SPEED || 1;
        const encoder = new Mp3Encoder();
        const started = performance.now();
        let seconds = 0;
        let doneSentences = 0;
        let totalSentences = 0;

        try {
            if (state.isPlaying || state.autoAdvanceActive) await app.audioManager?.stopPlayback?.(false);
            onProgress?.({ phase: "voice", message: "Carregando a voz…" });
            await app.ttsEngine.ensurePiper(voiceId);

            const silence = (sec) => new Float32Array(Math.round(sec * (encoder.sampleRate || 22050)));
            let firstChunk = true;

            for (let unit = from; unit <= to; unit++) {
                if (signal.aborted) throw abortError();
                onProgress?.({ phase: "prepare", unit, from, to, doneSentences, totalSentences, seconds });
                const entries = await this._sentencesForUnit(unit, signal);
                totalSentences += entries.length;

                // Gera em pequenos lotes paralelos, mantendo a ordem.
                for (let i = 0; i < entries.length; i += PARALLEL_SYNTH) {
                    if (signal.aborted) throw abortError();
                    const batch = entries.slice(i, i + PARALLEL_SYNTH);
                    const audios = await Promise.all(batch.map(async (entry) => {
                        const text = await this._speechText(entry);
                        if (!hasUsableSpeechText(text)) return null;
                        return this._synthesize(text, voiceId, speed, signal);
                    }));
                    for (const audio of audios) {
                        if (!audio) continue;
                        if (firstChunk) {
                            await encoder.init(audio.sampleRate);
                            firstChunk = false;
                        }
                        const samples = resampleLinear(audio.samples, audio.sampleRate, encoder.sampleRate);
                        await encoder.push(samples);
                        await encoder.push(silence(SENTENCE_GAP_SEC));
                        seconds += samples.length / encoder.sampleRate + SENTENCE_GAP_SEC;
                    }
                    doneSentences += batch.length;
                    const elapsed = (performance.now() - started) / 1000;
                    onProgress?.({ phase: "synth", unit, from, to, doneSentences, totalSentences, seconds, elapsed });
                    await cooperativeYield();
                }
                if (!firstChunk && unit < to) {
                    await encoder.push(silence(SECTION_GAP_SEC));
                    seconds += SECTION_GAP_SEC;
                }
            }

            if (firstChunk) throw new Error(`Nenhum texto para ler nesse intervalo de ${this._unitLabel(true)}.`);
            onProgress?.({ phase: "encode", message: "Finalizando o MP3…", seconds });
            const blob = await encoder.finish();
            const range = from === to ? `${this._unitLabel()} ${from}` : `${this._unitLabel(true)} ${from}-${to}`;
            const fileName = `${this._documentName()} - ${range}.mp3`;
            return { blob, fileName, seconds };
        } finally {
            encoder.dispose();
            if (this.controller === controller) this.controller = null;
        }
    }

    cancel() {
        this.controller?.abort();
    }

    _download(blob, fileName) {
        if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
        this.lastUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = this.lastUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return this.lastUrl;
    }

    // ---------------------------------------------------------------- interface
    open() {
        if (!this._hasDocument()) {
            this.app.ui?.showInfo?.("Abra um documento primeiro");
            return;
        }
        this.close();
        const total = this._totalUnits();
        const current = this._currentUnit();
        const unit = this._unitLabel();
        const units = this._unitLabel(true);

        const overlay = document.createElement("div");
        overlay.className = "audio-export-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4";
        overlay.innerHTML = `
            <div class="audio-export w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-background-light dark:bg-background-dark text-slate-800 dark:text-slate-100 shadow-2xl"
                 role="dialog" aria-modal="true" aria-labelledby="audio-export-title">
                <header class="flex items-center gap-3 px-5 pt-5">
                    <span class="material-symbols-outlined text-primary">audio_file</span>
                    <h2 id="audio-export-title" class="flex-1 text-lg font-bold">Exportar áudio em MP3</h2>
                    <button type="button" data-close class="rounded-full p-1 hover:bg-primary/10" aria-label="Fechar">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </header>
                <form data-form class="grid gap-4 px-5 pb-5 pt-3">
                    <p class="text-sm text-slate-500 dark:text-slate-400">
                        Usa a voz e a velocidade escolhidas nas configurações. O arquivo é gerado neste aparelho.
                    </p>
                    <fieldset class="grid gap-2">
                        <legend class="mb-1 text-sm font-semibold">O que exportar</legend>
                        <label class="audio-export__option"><input type="radio" name="scope" value="current" checked>
                            <span>${unit[0].toUpperCase() + unit.slice(1)} atual (${current})</span></label>
                        <label class="audio-export__option"><input type="radio" name="scope" value="range">
                            <span>Intervalo de ${units}</span></label>
                        <div data-range class="grid grid-cols-2 gap-3 pl-7" hidden>
                            <label class="grid gap-1 text-xs text-slate-500 dark:text-slate-400">De
                                <input data-from type="number" min="1" max="${total}" value="${current}" class="audio-export__number"></label>
                            <label class="grid gap-1 text-xs text-slate-500 dark:text-slate-400">Até
                                <input data-to type="number" min="1" max="${total}" value="${Math.min(total, current + 4)}" class="audio-export__number"></label>
                        </div>
                        <label class="audio-export__option"><input type="radio" name="scope" value="all">
                            <span>Documento inteiro (${total} ${total === 1 ? unit : units})</span></label>
                    </fieldset>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                        Documentos longos podem levar vários minutos. Mantenha esta aba aberta durante a exportação.
                    </p>
                    <div data-progress class="grid gap-2" hidden>
                        <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div data-bar class="h-full w-0 rounded-full bg-primary transition-[width] duration-300"></div>
                        </div>
                        <p data-status class="text-sm" aria-live="polite"></p>
                    </div>
                    <div class="flex justify-end gap-2">
                        <button type="button" data-cancel class="rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary/10">Cancelar</button>
                        <button type="submit" data-start class="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90">
                            Gerar MP3
                        </button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(overlay);
        this.overlay = overlay;

        const $ = (sel) => overlay.querySelector(sel);
        const form = $("[data-form]");
        const rangeBox = $("[data-range]");
        const fromInput = $("[data-from]");
        const toInput = $("[data-to]");
        const progress = $("[data-progress]");
        const bar = $("[data-bar]");
        const status = $("[data-status]");
        const startBtn = $("[data-start]");
        const cancelBtn = $("[data-cancel]");
        let running = false;
        let result = null;

        form.addEventListener("change", () => {
            rangeBox.hidden = form.scope.value !== "range";
        });
        const closeOrCancel = () => {
            if (running) this.cancel();
            else this.close();
        };
        $("[data-close]").addEventListener("click", closeOrCancel);
        cancelBtn.addEventListener("click", closeOrCancel);
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay && !running) this.close();
        });
        overlay.addEventListener("keydown", (event) => {
            if (event.key === "Escape") closeOrCancel();
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (result) {
                this._download(result.blob, result.fileName);
                return;
            }
            let from = current;
            let to = current;
            if (form.scope.value === "all") {
                from = 1;
                to = total;
            } else if (form.scope.value === "range") {
                from = Math.min(Math.max(parseInt(fromInput.value, 10) || 1, 1), total);
                to = Math.min(Math.max(parseInt(toInput.value, 10) || from, 1), total);
                if (to < from) [from, to] = [to, from];
            }
            running = true;
            form.querySelectorAll("input").forEach((input) => { input.disabled = true; });
            startBtn.disabled = true;
            startBtn.textContent = "Gerando…";
            cancelBtn.textContent = "Cancelar exportação";
            progress.hidden = false;
            const span = to - from + 1;

            try {
                result = await this.export({ from, to }, (p) => {
                    if (p.message) status.textContent = p.message;
                    if (p.phase === "prepare" || p.phase === "synth") {
                        const unitPos = (p.unit - from) / span;
                        const inUnit = p.totalSentences ? Math.min(1, p.doneSentences / p.totalSentences) : 0;
                        const fraction = span === 1 ? inUnit : Math.min(1, unitPos + inUnit / span);
                        bar.style.width = `${Math.max(2, Math.round(fraction * 100))}%`;
                        const where = span === 1 ? `${unit} ${p.unit}` : `${unit} ${p.unit} de ${to}`;
                        status.textContent = p.phase === "prepare"
                            ? `Preparando ${where}…`
                            : `Gerando ${where} · ${formatDuration(p.seconds)} de áudio`;
                    }
                    if (p.phase === "encode") bar.style.width = "100%";
                });
                this._download(result.blob, result.fileName);
                const bytes = result.blob.size;
                const size = bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
                status.textContent = `Pronto: ${formatDuration(result.seconds)} de áudio · ${size}. O download começou.`;
                startBtn.textContent = "Baixar de novo";
                startBtn.disabled = false;
                cancelBtn.textContent = "Fechar";
            } catch (error) {
                bar.style.width = "0%";
                status.textContent = error?.name === "AbortError"
                    ? "Exportação cancelada."
                    : `Não foi possível exportar: ${error?.message || error}`;
                startBtn.textContent = "Gerar MP3";
                startBtn.disabled = false;
                cancelBtn.textContent = "Fechar";
                form.querySelectorAll("input").forEach((input) => { input.disabled = false; });
            } finally {
                running = false;
            }
        });

        startBtn.focus();
    }

    close() {
        if (this.controller) return;
        this.overlay?.remove();
        this.overlay = null;
    }
}
