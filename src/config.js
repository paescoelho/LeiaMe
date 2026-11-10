import { CURRENT_PHRASE_SPLIT_VERSION, PHRASE_SPLIT_HISTORY } from "./modules/phrases/phraseSplitVersions.js";

export const INFERENCE_BACKENDS = Object.freeze({
    WASM: "wasm",
    WEBGPU: "webgpu",
});

/**
 * Keep backend choice validation at the application boundary.
 *
 * Both inference workers ultimately accept strings, so allowing arbitrary values
 * would defer a configuration typo until an expensive model load. Callers use
 * this helper before creating a worker/session; workers still validate their
 * messages independently because a worker is a separate runtime boundary.
 */
export function normalizeInferenceBackend(value, fallback = INFERENCE_BACKENDS.WASM) {
    if (value === INFERENCE_BACKENDS.WEBGPU) return INFERENCE_BACKENDS.WEBGPU;
    if (value === INFERENCE_BACKENDS.WASM) return INFERENCE_BACKENDS.WASM;
    return fallback === INFERENCE_BACKENDS.WEBGPU ? INFERENCE_BACKENDS.WEBGPU : INFERENCE_BACKENDS.WASM;
}

//╭─────────────────────────────────────╮
//│      Centralized configuration      │
//│  constants extracted from original  │
//│              render.js              │
//╰─────────────────────────────────────╯
export const CONFIG = {
    VERSION_MAJOR: 1,
    VERSION_MINOR: 2,
    VERSION_PATCH: 0,
    VERSION_BUILD: 0,

    // Rendering
    ENABLE_WORD_HIGHLIGHT: true,
    ENABLE_LIVE_WORD_REGION: true,
    LIVE_WORD_REGION_ID: "live-word",
    LIVE_STATUS_REGION_ID: "live-status",
    DEFAULT_VIEW_MODE: "full", // render entire pdf file

    // Audio
    MAKE_WAV_COPY: false,
    STORE_DECODED_ONLY: true,
    FADE_IN_SEC: 0.03,
    FADE_OUT_SEC: 0.08,
    MIN_GAIN: 0.001,
    AUDIO_CONTEXT_OPTIONS: { latencyHint: "playback" },

    // Sentence processing
    PHRASE_SPLIT_VERSION: CURRENT_PHRASE_SPLIT_VERSION,
    PHRASE_SPLIT_HISTORY,
    // Treat detected PDF layout blocks as phrase boundaries, independently of punctuation.
    SPLIT_PDF_SENTENCES_ON_LAYOUT_BLOCKS: true,
    // Retain block-aware audio timing/highlighting for sentences created before layout
    // processing and for any document where a sentence still overlaps multiple blocks.
    SPLIT_PDF_AUDIO_ON_LAYOUT_BLOCKS: true,
    PDF_AUDIO_LAYOUT_BLOCK_PAUSE_SEC: 0.18,
    BREAK_ON_LINE: false,
    SPLIT_ON_LINE_GAP: false,
    SPLIT_ON_WORD_GAP: false,
    LINE_GAP_THRESHOLD: 2,
    // Optional fallback for splitting on unusually large word gaps.
    WORD_GAP_THRESHOLD_EM: 2.5,
    SENTENCE_END: [".", ":", ";", "?", "!", '."', ':"', ';"'],

    // TTS
    // Inference backends must be either "wasm" or "webgpu". Runtime device
    // detection can change TTS_BACKEND, while layout keeps this configured value.
    TTS_BACKEND: INFERENCE_BACKENDS.WASM,
    LAYOUT_DETECTION_BACKEND: INFERENCE_BACKENDS.WASM,
    PREFETCH_AHEAD: 10,
    // Keep three readable PDF phrases synthesized ahead of playback, including
    // across page boundaries, to avoid a pause when auto-advancing pages.
    PDF_PREFETCH_PHRASES: 3,
    // Do not begin a new reading until this many readable phrases have audio.
    // Near the document end, use the number of phrases actually remaining.
    TTS_START_BUFFER_PHRASES: 2,
    // Maximums for the adaptive shared inference budget. High-core computers
    // can use four threads per Piper lane; iPad remains fixed at one thread.
    PDF_LAYOUT_MAX_THREADS: 4,
    // Initialize two Piper lanes up front and render the startup buffer in parallel.
    MAX_CONCURRENT_SYNTH: 2,
    PIPER_WORKERS: 2,
    PIPER_MAX_THREADS: 4,
    WORD_BOUNDARY_CHUNK_SIZE: 40,
    YIELD_AFTER_MS: 32,
    PIPER_VOICES: [
        "pt_BR-faber-medium",
        "en_US-lessac-medium",
        "en_GB-cori-medium",
        "en_US-lessac-high",
    ],
    DEFAULT_PIPER_VOICE: "pt_BR-faber-medium",

    // Responsive
    MOBILE_BREAKPOINT: 680,
    HORIZONTAL_MOBILE_MARGIN: 32,
    SCROLL_MARGIN: 120,

    // Storage
    VIEW_MODE_STORAGE_KEY: "pdfViewMode",
    PROGRESS_STORAGE_KEY: "leiame/progressMap",
    HIGHLIGHTS_STORAGE_KEY: "leiame/highlightsMap",
    // ID OAuth público do Google (substitua pelo seu próprio para usar o Google Drive).
    // See assets/GOOGLE_DRIVE_SETUP.md. Never place a client secret here.
    GOOGLE_DRIVE_CLIENT_ID: "529564700634-tajs7foa2f241jhil10r3phq3e96smi9.apps.googleusercontent.com",

    // Export
    // 0..1 (lower = more transparent). Helps keep highlighted text readable in exported PDFs.
    EXPORT_HIGHLIGHT_OPACITY: 0.35,

    // UI dynamic computed
    BASE_WIDTH_CSS: () => Math.max(360, Math.min(window.innerWidth, 1400)),
    VIEWPORT_HEIGHT_CSS: () => Math.max(260, window.innerHeight * 0.82),
    MARGIN_TOP: () => (window.innerWidth < 700 ? 50 : 100),

    MS_ON_FOCUS_TO_RENDER: 150,

    // Header detection
    TOLERANCE: 50, // pixels around detection boxes to tolerate small misalignments

};
