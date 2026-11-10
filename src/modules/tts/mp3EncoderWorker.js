/* LeiaMe — codificador MP3 em segundo plano (usa LAME/lamejs, LGPL). */
/* global lamejs */
self.importScripts("../../../thirdparty/lame/lame.min.js");

const FRAME = 1152;
let encoder = null;
let parts = [];
let pending = new Int16Array(0);

function toInt16(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
}

function encodeFrames(samples, flushAll) {
    let joined = samples;
    if (pending.length) {
        joined = new Int16Array(pending.length + samples.length);
        joined.set(pending, 0);
        joined.set(samples, pending.length);
    }
    let offset = 0;
    while (joined.length - offset >= FRAME) {
        const mp3 = encoder.encodeBuffer(joined.subarray(offset, offset + FRAME));
        if (mp3.length) parts.push(new Uint8Array(mp3));
        offset += FRAME;
    }
    pending = joined.slice(offset);
    if (flushAll && pending.length) {
        const mp3 = encoder.encodeBuffer(pending);
        if (mp3.length) parts.push(new Uint8Array(mp3));
        pending = new Int16Array(0);
    }
}

self.onmessage = (event) => {
    const { type } = event.data || {};
    try {
        if (type === "init") {
            const { sampleRate, kbps = 64 } = event.data;
            encoder = new lamejs.Mp3Encoder(1, sampleRate, kbps);
            parts = [];
            pending = new Int16Array(0);
            self.postMessage({ type: "ready" });
        } else if (type === "chunk") {
            if (!encoder) throw new Error("Codificador não iniciado");
            encodeFrames(toInt16(event.data.samples), false);
            self.postMessage({ type: "ack", id: event.data.id });
        } else if (type === "end") {
            if (!encoder) throw new Error("Codificador não iniciado");
            encodeFrames(new Int16Array(0), true);
            const tail = encoder.flush();
            if (tail.length) parts.push(new Uint8Array(tail));
            const blob = new Blob(parts, { type: "audio/mpeg" });
            parts = [];
            encoder = null;
            self.postMessage({ type: "done", blob });
        }
    } catch (error) {
        self.postMessage({ type: "error", message: String(error?.message || error) });
    }
};
