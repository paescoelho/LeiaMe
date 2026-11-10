// Helper UI functions (info/status) separated for reuse
const AMOLED_TEXT_COLORS = [
    "#f5f5f5",
    "#dddddd",
    "#c6c6c6",
    "#adadad",
    "#949494",
    "#7c7c7c",
    "#646464",
    "#4d4d4d",
    "#383838",
    "#282828",
];

export class UIService {
    constructor(app) {
        this.app = app;
        this.infoBox = document.getElementById("info-box");
        this.fatalErrorBox = document.getElementById("fatal-error");
        this.hideMessageTimeout = null;
        this.playbackPreparationActive = false;
        this.hideErrorTimeout = null;
        this.playBarIcon = document.querySelector("#play-toggle span.material-symbols-outlined");
        this.bookLoadingOverlay = document.getElementById("book-loading-overlay");
        this.bookLoadingStatus = document.getElementById("book-loading-status");
        this.bookLoadingActive = false;

        this._translatePopupEl = null;
        this._translatePopupCleanup = null;

        this._commentPopupEl = null;
        this._commentPopupCleanup = null;

        this._highlightPopupEl = null;
        this._highlightPopupCleanup = null;

        this._translationSetupPromptEl = null;
        this._translationSetupPromptCleanup = null;

        window.addEventListener("amoled-mode-change", () => this._applyTranslatePopupAmoledColor(), {
            passive: true,
        });
    }

    _isAmoledModeEnabled() {
        try {
            return (
                document.documentElement.classList.contains("amoled-mode") ||
                localStorage.getItem("config.amoledMode") === "1"
            );
        } catch {
            return document.documentElement.classList.contains("amoled-mode");
        }
    }

    _getAmoledTextColor() {
        try {
            const level = Number.parseInt(localStorage.getItem("config.amoledTextLevel") || "0", 10);
            if (Number.isFinite(level) && level >= 0 && level < AMOLED_TEXT_COLORS.length) {
                return AMOLED_TEXT_COLORS[level];
            }
        } catch {
            // fall through to default
        }
        return AMOLED_TEXT_COLORS[0];
    }

    _applyTranslatePopupAmoledColor() {
        if (!this._translatePopupEl) return;
        const color = this._isAmoledModeEnabled() ? this._getAmoledTextColor() : "";
        if (color) {
            document.documentElement.style.setProperty("--amoled-reader-fg", color);
            this._translatePopupEl.style.setProperty("color", color, "important");
        } else {
            this._translatePopupEl.style.removeProperty("color");
        }
        this._translatePopupEl.querySelectorAll("*").forEach((el) => {
            if (color) {
                el.style.setProperty("color", color, "important");
            } else {
                el.style.removeProperty("color");
            }
        });
    }

    _hideTranslatePopup() {
        if (this._translatePopupEl) {
            this._translatePopupEl.remove();
            this._translatePopupEl = null;
        }
        if (typeof this._translatePopupCleanup === "function") {
            this._translatePopupCleanup();
            this._translatePopupCleanup = null;
        }
    }

    _hideCommentPopup() {
        if (this._commentPopupEl) {
            this._commentPopupEl.remove();
            this._commentPopupEl = null;
        }
        if (typeof this._commentPopupCleanup === "function") {
            this._commentPopupCleanup();
            this._commentPopupCleanup = null;
        }
    }

    _hideHighlightPopup() {
        if (this._highlightPopupEl) {
            this._highlightPopupEl.remove();
            this._highlightPopupEl = null;
        }
        if (typeof this._highlightPopupCleanup === "function") {
            this._highlightPopupCleanup();
            this._highlightPopupCleanup = null;
        }
    }

    _hideTranslationSetupPrompt() {
        if (this._translationSetupPromptEl) {
            this._translationSetupPromptEl.remove();
            this._translationSetupPromptEl = null;
        }
        if (typeof this._translationSetupPromptCleanup === "function") {
            this._translationSetupPromptCleanup();
            this._translationSetupPromptCleanup = null;
        }
    }

    _shouldKeepTranslatePopupForTarget(target) {
        if (!target?.closest) return false;
        return !!target.closest(
            [
                "[data-keep-translate-popup='true']",
                ".epub-active-phrase-actions",
                ".pdf-active-phrase-actions",
                "#save-highlight",
                ".highlight-color-option",
            ].join(","),
        );
    }

    async showTranslationSetupPrompt({
        title = "Configurar leitura",
        subtitle = "Escolha como este documento será lido",
        initialOriginalLanguage = "en",
        initialTarget = "pt",
        initialMode = "off",
        initialSpeed = 1,
        translationAvailable = true,
        configured = false,
    } = {}) {
        this._hideTranslationSetupPrompt();

        return await new Promise((resolve) => {
            const canTranslate = translationAvailable !== false;
            const closeWith = (result = null) => {
                this._hideTranslationSetupPrompt();
                resolve(result);
            };

            const backdrop = document.createElement("div");
            backdrop.className =
                "fixed inset-0 z-50 bg-slate-900/40 dark:bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-3";

            const panel = document.createElement("div");
            panel.className =
                "translation-setup-prompt w-[94vw] max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl " +
                "border border-slate-200 dark:border-slate-700 bg-background-light dark:bg-background-dark shadow-2xl";
            panel.setAttribute("role", "dialog");
            panel.setAttribute("aria-modal", "true");
            panel.setAttribute("aria-labelledby", "reading-setup-title");
            panel.setAttribute("aria-describedby", "reading-setup-subtitle");

            const header = document.createElement("div");
            header.className =
                "flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700";

            const titleWrap = document.createElement("div");

            const titleEl = document.createElement("div");
            titleEl.id = "reading-setup-title";
            titleEl.className = "text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100";
            titleEl.textContent = title;

            const subtitleEl = document.createElement("div");
            subtitleEl.id = "reading-setup-subtitle";
            subtitleEl.className = "mt-1 text-xs text-slate-600 dark:text-slate-300";
            subtitleEl.textContent = subtitle;

            titleWrap.appendChild(titleEl);
            titleWrap.appendChild(subtitleEl);

            const closeBtn = document.createElement("button");
            closeBtn.type = "button";
            closeBtn.setAttribute("aria-label", "Fechar configuração de leitura");
            closeBtn.className =
                "p-1 rounded-full text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary";
            const closeIcon = document.createElement("span");
            closeIcon.className = "material-symbols-outlined";
            closeIcon.textContent = "close";
            closeBtn.appendChild(closeIcon);
            closeBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeWith(null);
            });

            header.appendChild(titleWrap);
            header.appendChild(closeBtn);

            const languageOptions = [
                { value: "pt", label: "🇧🇷 Português" },
                { value: "en", label: "🇺🇸 Inglês" },
                { value: "es", label: "🇪🇸 Espanhol" },
                { value: "fr", label: "🇫🇷 Francês" },
                { value: "de", label: "🇩🇪 Alemão" },
                { value: "zh-CN", label: "🇨🇳 Chinês (simplificado)" },
            ];

            const normalizeLanguage = (value, fallback) => String(value || fallback).trim() || fallback;
            const normalizedOriginal = normalizeLanguage(initialOriginalLanguage, "pt");
            const normalizedTarget = normalizeLanguage(initialTarget, "pt");
            let selectedMode = canTranslate && ["read", "show", "off"].includes(initialMode)
                ? initialMode
                : "off";

            const languageName = (value) =>
                languageOptions.find((entry) => entry.value === value)?.label || value || "Não selecionado";

            const buildLanguageSelect = (value, ariaLabel) => {
                const select = document.createElement("select");
                select.setAttribute("aria-label", ariaLabel);
                select.className =
                    "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-black/20 " +
                    "text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary";
                for (const optionDef of languageOptions) {
                    const option = document.createElement("option");
                    option.value = optionDef.value;
                    option.textContent = optionDef.label;
                    select.appendChild(option);
                }
                if (!languageOptions.some((entry) => entry.value === value) && value) {
                    const custom = document.createElement("option");
                    custom.value = value;
                    custom.textContent = value;
                    select.appendChild(custom);
                }
                select.value = value;
                return select;
            };

            const setupBody = document.createElement("div");
            setupBody.className = "px-5 py-5 space-y-6";

            const languageSection = document.createElement("section");
            languageSection.className = "space-y-3";
            languageSection.innerHTML = `
                <div>
                    <h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Idioma</h3>
                    <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Informe o idioma do documento e o idioma em que você quer ouvir.</p>
                </div>
            `;

            const languageGrid = document.createElement("div");
            languageGrid.className = "grid grid-cols-1 sm:grid-cols-2 gap-3";

            const originalWrap = document.createElement("label");
            originalWrap.className = "block space-y-1.5";
            const originalLabel = document.createElement("span");
            originalLabel.className = "block text-xs font-medium text-slate-700 dark:text-slate-200";
            originalLabel.textContent = "Idioma original do documento";
            const originalSelect = buildLanguageSelect(normalizedOriginal, "Idioma original do documento");
            originalWrap.append(originalLabel, originalSelect);

            const targetWrap = document.createElement("label");
            targetWrap.className = "block space-y-1.5 transition-opacity";
            const targetLabel = document.createElement("span");
            targetLabel.className = "block text-xs font-medium text-slate-700 dark:text-slate-200";
            targetLabel.textContent = "Traduzir para";
            const targetSelect = buildLanguageSelect(normalizedTarget, "Traduzir para");
            targetWrap.append(targetLabel, targetSelect);
            languageGrid.append(originalWrap, targetWrap);

            const finalLanguage = document.createElement("div");
            finalLanguage.className =
                "rounded-lg border border-primary/25 bg-primary/5 dark:bg-primary/10 px-3 py-2.5 " +
                "text-sm font-medium text-slate-900 dark:text-slate-100";

            languageSection.append(languageGrid, finalLanguage);

            const speedSection = document.createElement("section");
            speedSection.className = "space-y-3";

            const speedLabel = document.createElement("div");
            speedLabel.innerHTML = `
                <h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Velocidade de leitura</h3>
                <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Ajuste a velocidade da leitura em voz alta.</p>
            `;

            const speedRow = document.createElement("div");
            speedRow.className = "flex items-center gap-3";

            const speedDecreaseBtn = document.createElement("button");
            speedDecreaseBtn.type = "button";
            speedDecreaseBtn.setAttribute("aria-label", "Diminuir velocidade de leitura");
            speedDecreaseBtn.className =
                "w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 " +
                "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5";
            const speedDecreaseIcon = document.createElement("span");
            speedDecreaseIcon.className = "material-symbols-outlined text-lg";
            speedDecreaseIcon.textContent = "remove";
            speedDecreaseBtn.appendChild(speedDecreaseIcon);

            const speedInput = document.createElement("input");
            speedInput.type = "range";
            speedInput.min = "0.5";
            speedInput.max = "2";
            speedInput.step = "0.1";
            speedInput.className = "translation-speed-slider w-full";

            const normalizedSpeed = Number.isFinite(Number(initialSpeed))
                ? Math.min(2, Math.max(0.5, Number(initialSpeed)))
                : 1;
            speedInput.value = String(normalizedSpeed);

            const speedIncreaseBtn = document.createElement("button");
            speedIncreaseBtn.type = "button";
            speedIncreaseBtn.setAttribute("aria-label", "Aumentar velocidade de leitura");
            speedIncreaseBtn.className =
                "w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 " +
                "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5";
            const speedIncreaseIcon = document.createElement("span");
            speedIncreaseIcon.className = "material-symbols-outlined text-lg";
            speedIncreaseIcon.textContent = "add";
            speedIncreaseBtn.appendChild(speedIncreaseIcon);

            speedRow.appendChild(speedDecreaseBtn);
            speedRow.appendChild(speedInput);
            speedRow.appendChild(speedIncreaseBtn);

            const speedValue = document.createElement("div");
            speedValue.className = "min-w-11 text-right text-sm font-semibold text-primary";
            speedValue.textContent = `${normalizedSpeed.toFixed(1)}x`;

            speedInput.addEventListener("input", () => {
                const next = Number.parseFloat(speedInput.value);
                if (!Number.isFinite(next)) return;
                speedValue.textContent = `${next.toFixed(1)}x`;
            });

            const adjustPopupSpeed = (delta) => {
                const min = Number.parseFloat(speedInput.min || "0.5");
                const max = Number.parseFloat(speedInput.max || "2");
                const step = Number.parseFloat(speedInput.step || "0.1");
                const current = Number.parseFloat(speedInput.value || "1");
                const next = Math.min(max, Math.max(min, current + delta * step));
                speedInput.value = next.toFixed(1);
                speedInput.dispatchEvent(new Event("input", { bubbles: true }));
            };

            speedDecreaseBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                adjustPopupSpeed(-1);
            });
            speedIncreaseBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                adjustPopupSpeed(1);
            });

            speedRow.appendChild(speedValue);
            speedSection.append(speedLabel, speedRow);

            const offlineNotice = document.createElement("div");
            offlineNotice.className =
                "rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 " +
                "px-3 py-2 text-sm text-amber-900 dark:text-amber-100";
            offlineNotice.textContent =
                "Modo offline: a tradução não está disponível. Escolha o idioma original e leia o texto original.";

            const modeSection = document.createElement("section");
            modeSection.className = "space-y-3";
            modeSection.innerHTML = `
                <div>
                    <h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Modo de leitura</h3>
                    <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Escolha se o documento será traduzido.</p>
                </div>
            `;
            const optionsWrap = document.createElement("div");
            optionsWrap.className = "grid grid-cols-1 sm:grid-cols-3 gap-3";
            const modeCards = new Map();

            const buildModeCard = ({ mode, label, helper, disabled = false }) => {
                const card = document.createElement("label");
                card.className =
                    "relative flex min-h-24 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3.5 " +
                    "transition-colors focus-within:ring-2 focus-within:ring-primary";
                if (disabled) card.classList.add("opacity-45", "cursor-not-allowed");

                const radio = document.createElement("input");
                radio.type = "radio";
                radio.name = "reading-setup-mode";
                radio.value = mode;
                radio.disabled = disabled;
                radio.checked = selectedMode === mode;
                radio.className = "mt-0.5 h-4 w-4 shrink-0 accent-primary";

                const copy = document.createElement("span");
                copy.innerHTML = `
                    <span class="block text-sm font-semibold text-slate-900 dark:text-slate-100">${label}</span>
                    <span class="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">${helper}</span>
                `;
                card.append(radio, copy);
                modeCards.set(mode, card);
                radio.addEventListener("change", () => {
                    if (!radio.checked) return;
                    selectedMode = mode;
                    updateModePresentation();
                });
                return card;
            };

            optionsWrap.append(
                buildModeCard({
                    mode: "off",
                    label: "Ler o original",
                    helper: "Sem tradução. Lê o documento no idioma original.",
                }),
                buildModeCard({
                    mode: "read",
                    label: "Ler a tradução",
                    helper: canTranslate ? "Traduz o texto e lê no idioma escolhido." : "Indisponível offline.",
                    disabled: !canTranslate,
                }),
                buildModeCard({
                    mode: "show",
                    label: "Mostrar tradução",
                    helper: canTranslate ? "Lê o original e mostra as frases traduzidas." : "Indisponível offline.",
                    disabled: !canTranslate,
                }),
            );
            modeSection.appendChild(optionsWrap);

            const updateModePresentation = () => {
                modeCards.forEach((card, mode) => {
                    const selected = mode === selectedMode;
                    card.classList.toggle("border-primary", selected);
                    card.classList.toggle("bg-primary/5", selected);
                    card.classList.toggle("dark:bg-primary/10", selected);
                    card.classList.toggle("border-slate-200", !selected);
                    card.classList.toggle("dark:border-slate-700", !selected);
                });
                const usesTranslation = selectedMode !== "off";
                targetSelect.disabled = !usesTranslation || !canTranslate;
                targetWrap.classList.toggle("opacity-45", !usesTranslation || !canTranslate);
                const finalValue = selectedMode === "read" ? targetSelect.value : originalSelect.value;
                const prefix = selectedMode === "show" ? "Idioma falado" : "Idioma da leitura";
                finalLanguage.textContent = `${prefix}: ${languageName(finalValue)}`;
            };
            originalSelect.addEventListener("change", updateModePresentation);
            targetSelect.addEventListener("change", updateModePresentation);

            setupBody.append(languageSection);
            if (!canTranslate) {
                setupBody.appendChild(offlineNotice);
            }
            setupBody.append(modeSection, speedSection);

            const setupFooter = document.createElement("div");
            setupFooter.className = "px-5 pb-5 flex justify-end";
            const startBtn = document.createElement("button");
            startBtn.type = "button";
            startBtn.className =
                "w-full sm:w-auto rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white " +
                "shadow-sm hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2";
            startBtn.textContent = "Começar a ler";
            startBtn.addEventListener("click", (event) => {
                event.preventDefault();
                closeWith({
                    action: "start",
                    originalLanguage: originalSelect.value,
                    target: targetSelect.value,
                    mode: selectedMode,
                    speed: Number.parseFloat(speedInput.value || "1") || 1,
                });
            });
            setupFooter.appendChild(startBtn);

            const confirmBody = document.createElement("div");
            confirmBody.className = "px-5 py-5 space-y-4";
            const summary = document.createElement("div");
            summary.className =
                "rounded-xl border border-primary/25 bg-primary/5 dark:bg-primary/10 px-4 py-4 space-y-3";
            const modeLabels = {
                off: "Ler o original — sem tradução",
                read: "Traduzir e ler em voz alta",
                show: "Ler o original e mostrar a tradução",
            };
            const languageSummary = selectedMode === "off"
                ? languageName(normalizedOriginal)
                : `${languageName(normalizedOriginal)} → ${languageName(normalizedTarget)}`;
            summary.innerHTML = `
                <div>
                    <div class="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Idioma</div>
                    <div data-summary-language class="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100"></div>
                </div>
                <div class="grid grid-cols-2 gap-3 border-t border-primary/15 pt-3">
                    <div>
                        <div class="text-xs text-slate-500 dark:text-slate-400">Modo de leitura</div>
                        <div data-summary-mode class="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-100"></div>
                    </div>
                    <div>
                        <div class="text-xs text-slate-500 dark:text-slate-400">Velocidade</div>
                        <div data-summary-speed class="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-100"></div>
                    </div>
                </div>
            `;
            summary.querySelector("[data-summary-language]").textContent = languageSummary;
            summary.querySelector("[data-summary-mode]").textContent = modeLabels[selectedMode];
            summary.querySelector("[data-summary-speed]").textContent = `${normalizedSpeed.toFixed(1)}x`;
            const confirmHint = document.createElement("p");
            confirmHint.className = "text-sm text-slate-600 dark:text-slate-300";
            confirmHint.textContent = "Este documento já tem uma configuração de leitura. Continue com ela ou faça mudanças.";
            confirmBody.append(confirmHint, summary);

            const confirmFooter = document.createElement("div");
            confirmFooter.className = "px-5 pb-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2";
            const reconfigureBtn = document.createElement("button");
            reconfigureBtn.type = "button";
            reconfigureBtn.className =
                "rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium " +
                "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5";
            reconfigureBtn.textContent = "Reconfigurar";
            const keepBtn = document.createElement("button");
            keepBtn.type = "button";
            keepBtn.className =
                "rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm " +
                "hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2";
            keepBtn.textContent = "Manter e ler";
            keepBtn.addEventListener("click", () => {
                closeWith({
                    action: "keep",
                    originalLanguage: normalizedOriginal,
                    target: normalizedTarget,
                    mode: selectedMode,
                    speed: normalizedSpeed,
                });
            });
            reconfigureBtn.addEventListener("click", () => {
                confirmBody.classList.add("hidden");
                confirmFooter.classList.add("hidden");
                setupBody.classList.remove("hidden");
                setupFooter.classList.remove("hidden");
                subtitleEl.textContent = "Altere como este documento será lido";
                originalSelect.focus();
            });
            confirmFooter.append(reconfigureBtn, keepBtn);

            updateModePresentation();
            if (configured) {
                setupBody.classList.add("hidden");
                setupFooter.classList.add("hidden");
            } else {
                confirmBody.classList.add("hidden");
                confirmFooter.classList.add("hidden");
            }

            panel.appendChild(header);
            panel.append(setupBody, setupFooter, confirmBody, confirmFooter);
            backdrop.appendChild(panel);
            document.body.appendChild(backdrop);

            this._translationSetupPromptEl = backdrop;

            const onKey = (e) => {
                if (e.key === "Escape") closeWith(null);
            };
            const onDown = (e) => {
                if (!this._translationSetupPromptEl) return;
                if (e.target === panel || panel.contains(e.target)) return;
                closeWith(null);
            };

            window.addEventListener("keydown", onKey, { passive: true });
            window.addEventListener("mousedown", onDown, { capture: true });
            this._translationSetupPromptCleanup = () => {
                window.removeEventListener("keydown", onKey);
                window.removeEventListener("mousedown", onDown, { capture: true });
            };
        });
    }

    async showPdfTranslationPrompt(options = {}) {
        return await this.showTranslationSetupPrompt(options);
    }

    showHighlightPopup() {
        this._hideHighlightPopup();

        const { app } = this;
        const { state } = app;
        if (!state?.sentences?.length) {
            this.showInfo?.("Abra um documento primeiro");
            return;
        }

        const getActiveIndex = () =>
            typeof state.playingSentenceIndex === "number" && state.playingSentenceIndex >= 0
                ? state.playingSentenceIndex
                : state.currentSentenceIndex;

        const idx = getActiveIndex();
        if (!Number.isFinite(idx) || idx < 0 || idx >= state.sentences.length) return;

        const getCurrent = () => (state.savedHighlights?.get?.(idx) ? state.savedHighlights.get(idx) : null);
        const hasHighlight = () => !!getCurrent()?.color;
        const currentComment = () => {
            const c = getCurrent()?.comment;
            return typeof c === "string" ? c : "";
        };

        const persistAndRefresh = ({ allowEmpty = true } = {}) => {
            try {
                app.highlightsStorage?.saveHighlightsForPdf?.({ allowEmpty });
            } catch {}
            try {
                if (state.currentDocumentType === "epub") {
                    app.epubRenderer?.updateHighlightDisplay?.();
                } else {
                    app.pdfRenderer?.updateHighlightFullDoc?.();
                }
            } catch {}
        };

        const wrap = document.createElement("div");
        wrap.className =
            "fixed z-50 bottom-20 left-1/2 -translate-x-1/2 w-[92vw] max-w-md rounded-lg " +
            "bg-background-light dark:bg-background-dark bg-opacity-100 " +
            "px-3 py-2 shadow-lg border border-slate-200 dark:border-slate-700";
        wrap.dataset.keepTranslatePopup = "true";
        wrap.style.zIndex = "10000";

        const header = document.createElement("div");
        header.className = "flex items-center justify-between gap-2 mb-2";

        const left = document.createElement("div");
        left.className = "flex items-center gap-2 min-w-0";

        const hiIcon = document.createElement("span");
        hiIcon.className = "material-symbols-outlined";
        hiIcon.textContent = "format_ink_highlighter";
        hiIcon.style.color = state.selectedHighlightColor || getCurrent()?.color || "#ffda76";

        const title = document.createElement("div");
        title.className = "text-sm font-semibold text-slate-800 dark:text-slate-100 truncate";
        title.textContent = `Destaque · Frase ${idx + 1}`;

        left.appendChild(hiIcon);
        left.appendChild(title);

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className =
            "p-1 rounded-full text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary";
        const closeIcon = document.createElement("span");
        closeIcon.className = "material-symbols-outlined";
        closeIcon.textContent = "close";
        closeBtn.appendChild(closeIcon);

        header.appendChild(left);
        header.appendChild(closeBtn);

        const body = document.createElement("div");
        body.className = "space-y-2";

        const colorRow = document.createElement("div");
        colorRow.className = "flex items-center justify-between gap-2";

        const presets = ["#ffda76", "#F44336", "#81C784", "#4FC3F7"];
        const presetWrap = document.createElement("div");
        presetWrap.className = "flex items-center gap-2";

        const setColor = (color) => {
            const c = String(color || "").trim();
            if (!c) return;

            // Update selected color (and icon tint)
            try {
                app.highlightManager?.setSelectedHighlightColor?.(c);
            } catch {
                state.selectedHighlightColor = c;
            }
            hiIcon.style.color = c;

            // If already highlighted, also recolor the existing highlight
            const cur = getCurrent();
            if (cur?.color) {
                state.savedHighlights.set(idx, { ...cur, color: c });
                persistAndRefresh();
            }
        };

        for (const p of presets) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "h-6 w-6 rounded-full border border-slate-300 dark:border-slate-600";
            b.style.backgroundColor = p;
            b.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                setColor(p);
                colorPicker.value = p;
            });
            presetWrap.appendChild(b);
        }

        const colorPicker = document.createElement("input");
        colorPicker.type = "color";
        colorPicker.className = "h-8 w-10 bg-transparent";
        colorPicker.value = state.selectedHighlightColor || getCurrent()?.color || "#ffda76";
        colorPicker.addEventListener("input", () => setColor(colorPicker.value));

        colorRow.appendChild(presetWrap);
        colorRow.appendChild(colorPicker);

        const actions = document.createElement("div");
        actions.className = "flex items-center justify-between gap-2";

        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className =
            "rounded-md px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 " +
            "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5";

        const status = document.createElement("div");
        status.className = "text-xs text-slate-500 dark:text-slate-400";

        const syncUI = () => {
            const on = hasHighlight();
            toggleBtn.textContent = on ? "Remover destaque" : "Destacar";
            status.textContent = on ? "Destacado" : "Sem destaque";

            const c = currentComment().trim();
            commentArea.value = c;
            removeCommentBtn.disabled = !c;
        };

        toggleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const sentenceText = state.sentences[idx]?.text || "";
            const cur = getCurrent() || {};
            if (hasHighlight()) {
                state.savedHighlights.delete(idx);
                persistAndRefresh({ allowEmpty: true });
            } else {
                const color = state.selectedHighlightColor || colorPicker.value || "#ffda76";
                state.savedHighlights.set(idx, {
                    ...cur,
                    color,
                    timestamp: cur.timestamp || Date.now(),
                    text: cur.text || sentenceText,
                    sentenceText: cur.sentenceText || sentenceText,
                    comment: typeof cur.comment === "string" ? cur.comment : undefined,
                });
                persistAndRefresh();
            }
            syncUI();
        });

        actions.appendChild(toggleBtn);
        actions.appendChild(status);

        const commentArea = document.createElement("textarea");
        commentArea.className =
            "w-full min-h-[64px] rounded-md border border-slate-200 dark:border-slate-700 " +
            "bg-white/80 dark:bg-black/20 text-slate-900 dark:text-slate-100 " +
            "px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary";
        commentArea.placeholder = "Comentário (opcional)…";

        const commentActions = document.createElement("div");
        commentActions.className = "flex items-center justify-between gap-2";

        const removeCommentBtn = document.createElement("button");
        removeCommentBtn.type = "button";
        removeCommentBtn.className =
            "rounded-md px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 " +
            "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5";
        removeCommentBtn.textContent = "Remover comentário";

        const saveCommentBtn = document.createElement("button");
        saveCommentBtn.type = "button";
        saveCommentBtn.className = "rounded-md px-3 py-2 text-sm bg-primary text-white hover:opacity-95";
        saveCommentBtn.textContent = "Salvar comentário";

        const upsertComment = (nextComment) => {
            const sentenceText = state.sentences[idx]?.text || "";
            const cur = getCurrent() || {};
            const color = cur.color || state.selectedHighlightColor || colorPicker.value || "#ffda76";

            const next = {
                ...cur,
                color,
                timestamp: cur.timestamp || Date.now(),
                text: cur.text || sentenceText,
                sentenceText: cur.sentenceText || sentenceText,
            };

            if (nextComment) {
                next.comment = nextComment;
            } else {
                delete next.comment;
            }

            state.savedHighlights.set(idx, next);
            persistAndRefresh();
        };

        saveCommentBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = String(commentArea.value || "").trim();
            if (!next) return;
            upsertComment(next);
            syncUI();
        });

        removeCommentBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cur = getCurrent();
            if (!cur) return;
            const next = { ...cur };
            delete next.comment;
            if (next.color) {
                state.savedHighlights.set(idx, next);
            }
            persistAndRefresh({ allowEmpty: true });
            syncUI();
        });

        commentActions.appendChild(removeCommentBtn);
        commentActions.appendChild(saveCommentBtn);

        body.appendChild(colorRow);
        body.appendChild(actions);
        body.appendChild(commentArea);
        body.appendChild(commentActions);

        wrap.appendChild(header);
        wrap.appendChild(body);
        document.body.appendChild(wrap);
        this._highlightPopupEl = wrap;

        const close = () => this._hideHighlightPopup();
        closeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            close();
        });

        const onKey = (e) => {
            if (e.key === "Escape") close();
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                const next = String(commentArea.value || "").trim();
                if (next) {
                    upsertComment(next);
                    syncUI();
                }
            }
        };
        const onDown = (e) => {
            if (!this._highlightPopupEl) return;
            if (e.target === this._highlightPopupEl || this._highlightPopupEl.contains(e.target)) return;
            close();
        };

        window.addEventListener("keydown", onKey, { passive: true });
        window.addEventListener("mousedown", onDown, { capture: true });
        this._highlightPopupCleanup = () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown, { capture: true });
        };

        syncUI();

        setTimeout(() => {
            try {
                commentArea.focus();
            } catch {}
        }, 0);
    }

    async showCommentPopup({
        title = "Comentário",
        initialText = "",
        placeholder = "Escreva um comentário...",
        allowRemove = false,
    } = {}) {
        this._hideCommentPopup();

        return await new Promise((resolve) => {
            const wrap = document.createElement("div");
            wrap.className =
                "fixed z-50 bottom-24 left-1/2 -translate-x-1/2 w-[92vw] max-w-2xl rounded-lg " +
                "bg-background-light dark:bg-background-dark bg-opacity-100 " +
                "px-4 py-3 shadow-lg border border-slate-200 dark:border-slate-700";
            wrap.style.zIndex = "10000";

            const header = document.createElement("div");
            header.className = "flex items-center justify-between gap-3 mb-2";

            const titleEl = document.createElement("div");
            titleEl.className = "text-sm font-semibold text-slate-800 dark:text-slate-100";
            titleEl.textContent = title;

            const actions = document.createElement("div");
            actions.className = "flex items-center gap-2";

            const closeBtn = document.createElement("button");
            closeBtn.type = "button";
            closeBtn.className =
                "p-1 rounded-full text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary";
            const closeIcon = document.createElement("span");
            closeIcon.className = "material-symbols-outlined";
            closeIcon.textContent = "close";
            closeBtn.appendChild(closeIcon);

            const resolveAndClose = (result) => {
                this._hideCommentPopup();
                resolve(result);
            };

            closeBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                resolveAndClose(null);
            });

            actions.appendChild(closeBtn);
            header.appendChild(titleEl);
            header.appendChild(actions);

            const body = document.createElement("div");
            body.className = "space-y-3";

            const textarea = document.createElement("textarea");
            textarea.className =
                "w-full min-h-[96px] rounded-md border border-slate-200 dark:border-slate-700 " +
                "bg-white/80 dark:bg-black/20 text-slate-900 dark:text-slate-100 " +
                "px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary";
            textarea.placeholder = placeholder;
            textarea.value = typeof initialText === "string" ? initialText : "";

            const footer = document.createElement("div");
            footer.className = "flex items-center justify-between gap-2 pt-1";

            const left = document.createElement("div");
            left.className = "flex items-center gap-2";

            const right = document.createElement("div");
            right.className = "flex items-center gap-2";

            const cancelBtn = document.createElement("button");
            cancelBtn.type = "button";
            cancelBtn.className =
                "rounded-md px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 " +
                "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5";
            cancelBtn.textContent = "Cancelar";
            cancelBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                resolveAndClose(null);
            });

            const saveBtn = document.createElement("button");
            saveBtn.type = "button";
            saveBtn.className = "rounded-md px-3 py-2 text-sm bg-primary text-white hover:opacity-95";
            saveBtn.textContent = "Salvar";
            saveBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                resolveAndClose({ action: "save", text: String(textarea.value || "").trim() });
            });

            if (allowRemove) {
                const removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.className =
                    "rounded-md px-3 py-2 text-sm border border-red-200 dark:border-red-800 " +
                    "text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20";
                removeBtn.textContent = "Remover";
                removeBtn.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    resolveAndClose({ action: "remove" });
                });
                left.appendChild(removeBtn);
            }

            right.appendChild(cancelBtn);
            right.appendChild(saveBtn);
            footer.appendChild(left);
            footer.appendChild(right);

            body.appendChild(textarea);
            body.appendChild(footer);

            wrap.appendChild(header);
            wrap.appendChild(body);
            document.body.appendChild(wrap);
            this._commentPopupEl = wrap;

            // Focus textarea shortly after mount
            setTimeout(() => {
                try {
                    textarea.focus();
                    const len = textarea.value.length;
                    textarea.setSelectionRange(len, len);
                } catch {}
            }, 0);

            const onKey = (e) => {
                if (e.key === "Escape") resolveAndClose(null);
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    resolveAndClose({ action: "save", text: String(textarea.value || "").trim() });
                }
            };
            const onDown = (e) => {
                if (!this._commentPopupEl) return;
                if (e.target === this._commentPopupEl || this._commentPopupEl.contains(e.target)) return;
                resolveAndClose(null);
            };

            window.addEventListener("keydown", onKey, { passive: true });
            window.addEventListener("mousedown", onDown, { capture: true });
            this._commentPopupCleanup = () => {
                window.removeEventListener("keydown", onKey);
                window.removeEventListener("mousedown", onDown, { capture: true });
            };
        });
    }

    async showTranslatePopup({ originalText = "", translatedText = "", target = "", detectedSource = "" } = {}) {
        this._hideTranslatePopup();

        const wrap = document.createElement("div");
        wrap.className =
            "translate-popup fixed z-40 bottom-24 left-1/2 -translate-x-1/2 w-[92vw] max-w-2xl rounded-lg " +
            "bg-background-light dark:bg-background-dark bg-opacity-100 " +
            "px-4 py-3 shadow-lg border border-slate-200 dark:border-slate-700";

        // zindex must be on front of all other elements
        wrap.style.zIndex = "10000";

        const header = document.createElement("div");
        header.className = "flex items-center justify-between gap-3 mb-2";

        const actions = document.createElement("div");
        actions.className = "flex items-center gap-2";

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        if (!document.getElementById("config-menu-close")) {
            closeBtn.id = "config-menu-close";
        }
        closeBtn.className =
            "p-1 rounded-full text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary";
        const closeIcon = document.createElement("span");
        closeIcon.className = "material-symbols-outlined";
        closeIcon.textContent = "close";
        closeBtn.appendChild(closeIcon);
        closeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._hideTranslatePopup();
        });
        actions.appendChild(closeBtn);

        const body = document.createElement("div");
        body.className = "space-y-2";

        // if (originalText && String(originalText).trim()) {
        //     const oText = document.createElement("div");
        //     oText.className = "text-sm text-slate-700 dark:text-slate-300";
        //     oText.textContent = String(originalText).trim();
        //     body.appendChild(oText);
        // }

        // const tLabel = document.createElement("div");
        // tLabel.className = "text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400";
        // tLabel.textContent = "Tradução";
        //body.appendChild(tLabel);

        const tText = document.createElement("div");
        tText.className = "translate-popup-text text-lg font-medium text-slate-900 dark:text-white";

        tText.textContent = translatedText || "(empty)";
        body.appendChild(tText);

        header.appendChild(document.createElement("div"));
        header.appendChild(actions);
        wrap.appendChild(header);
        wrap.appendChild(body);
        document.body.appendChild(wrap);
        this._translatePopupEl = wrap;
        this._applyTranslatePopupAmoledColor();

        const onKey = (e) => {
            if (e.key === "Escape") this._hideTranslatePopup();
        };
        const onDown = (e) => {
            if (!this._translatePopupEl) return;
            if (e.target === this._translatePopupEl || this._translatePopupEl.contains(e.target)) return;
            if (this._shouldKeepTranslatePopupForTarget(e.target)) return;
            this._hideTranslatePopup();
        };

        window.addEventListener("keydown", onKey, { passive: true });
        window.addEventListener("mousedown", onDown, { capture: true });
        this._translatePopupCleanup = () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown, { capture: true });
        };
    }

    showInfo(msg) {
        this.updateBookLoading(msg);
        if (!this.infoBox) {
            console.log(msg);
            return;
        }

        // Mostra a mensagem
        this.infoBox.textContent = msg;
        this.infoBox.style.display = "block";
        this.isLoading = false;

        // Cancela qualquer timeout anterior
        clearTimeout(this.hideMessageTimeout);

        // Inicia novo timeout para esconder depois de 2s
        this.hideMessageTimeout = setTimeout(() => {
            this.infoBox.style.display = "none";
        }, 5000);
    }

    showMessage(msg, duration = 5000) {
        this.updateBookLoading(msg);
        if (!this.infoBox) {
            console.log(msg);
            return;
        }

        this.infoBox.textContent = msg;
        this.infoBox.style.display = "block";
        this.isLoading = false;

        clearTimeout(this.hideMessageTimeout);

        const ms = Number.isFinite(duration) ? Math.max(0, duration) : 5000;
        if (ms > 0) {
            this.hideMessageTimeout = setTimeout(() => {
                this.infoBox.style.display = "none";
            }, ms);
        }
    }

    beginBookLoading(message = "Carregando o livro e os modelos de IA…") {
        this.bookLoadingActive = true;
        if (this.bookLoadingStatus) this.bookLoadingStatus.textContent = message;
        if (this.bookLoadingOverlay) {
            this.bookLoadingOverlay.classList.remove(
                "bg-background-light/60",
                "dark:bg-background-dark/60",
                "backdrop-blur-sm",
            );
            this.bookLoadingOverlay.classList.add("bg-background-light", "dark:bg-background-dark");
            this.bookLoadingOverlay.classList.remove("hidden");
            this.bookLoadingOverlay.classList.add("flex");
        }
    }

    updateBookLoading(message) {
        if (!this.bookLoadingActive || !this.bookLoadingStatus || !message) return;
        this.bookLoadingStatus.textContent = String(message);
    }

    setBookLoadingPageReady() {
        if (!this.bookLoadingActive || !this.bookLoadingOverlay) return;
        this.bookLoadingOverlay.classList.remove("bg-background-light", "dark:bg-background-dark");
        this.bookLoadingOverlay.classList.add(
            "bg-background-light/60",
            "dark:bg-background-dark/60",
            "backdrop-blur-sm",
        );
    }

    finishBookLoading() {
        this.bookLoadingActive = false;
        if (this.bookLoadingOverlay) {
            this.bookLoadingOverlay.classList.add("hidden");
            this.bookLoadingOverlay.classList.remove("flex");
        }
    }

    beginPlaybackPreparation(message = "Preparando a leitura…") {
        this.playbackPreparationActive = true;
        this.updatePlayButton(this.app.state.playerState.LOADING);
        this.showMessage(message, 0);
    }

    updatePlaybackPreparation(message) {
        if (!this.playbackPreparationActive) return;
        this.updatePlayButton(this.app.state.playerState.LOADING);
        this.showMessage(message, 0);
    }

    finishPlaybackPreparation(message = "") {
        this.playbackPreparationActive = false;
        if (message) {
            this.showMessage(message, 2500);
        } else if (this.infoBox) {
            clearTimeout(this.hideMessageTimeout);
            this.infoBox.style.display = "none";
        }
        if (!this.app.state.isPlaying) {
            this.updatePlayButton(this.app.state.playerState.DONE);
        }
    }

    updatePlayButton(value) {
        const { state } = this.app;
        if (!this.playBarIcon) return;

        if (value === state.playerState.LOADING) {
            this.isLoading = true;
            this.playBarIcon.textContent = "hourglass_empty";
            this.playBarIcon.classList.add("animate-spin");
            return;
        }

        // Layout detection, voice initialization, and TTS synthesis finish at
        // different times. None of those intermediate completions should stop
        // the visual loading state while a play request is still pending.
        if (this.playbackPreparationActive && !state.isPlaying) {
            return;
        }

        this.isLoading = false;
        this.playBarIcon.classList.remove("animate-spin");

        switch (value) {
            case state.playerState.PLAY:
                this.playBarIcon.textContent = "pause";
                return;
            case state.playerState.PAUSE:
            case state.playerState.STOP:
                this.playBarIcon.textContent = "play_arrow";
                return;
            default:
                this.playBarIcon.textContent = state.isPlaying ? "pause" : "play_arrow";
        }
    }

    showFatalError(msg) {
        if (!this.fatalErrorBox) {
            alert(msg);
        }

        // Mostra a mensagem
        this.fatalErrorBox.textContent = msg;
        this.fatalErrorBox.style.display = "block";

        // Cancela qualquer timeout anterior
        clearTimeout(this.hideErrorTimeout);

        // Inicia novo timeout para esconder depois de 2s
        this.hideErrorTimeout = setTimeout(() => {
            this.fatalErrorBox.style.display = "none";
        }, 30000);
    }
}
