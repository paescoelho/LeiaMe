import { getPlantDefinition } from "../rewards/plantDefinitions.js";

export class SessionProgressWidget {
    constructor({ onPause, onResume, onQuestion }) {
        this.handlers = { onPause, onResume, onQuestion };
        this.element = document.createElement("aside");
        this.element.className =
            "hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-30 w-auto max-w-sm " +
            "rounded-lg border border-slate-200 dark:border-slate-700 bg-background-light/90 " +
            "dark:bg-background-dark/90 p-2 shadow-md";
        this.element.setAttribute("aria-label", "Sessão de leitura");
        this.element.innerHTML = `
            <div class="flex items-center gap-2">
                <button type="button" data-open-garden aria-label="Abrir o jardim de leitura"
                    class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary hover:bg-primary/10 transition-colors">
                    <img data-plant-image class="h-10 w-10" alt="">
                </button>
                <div class="min-w-0 flex-1">
                    <strong data-plant class="block truncate text-xs text-slate-800 dark:text-slate-100">Árvore de leitura</strong>
                    <span data-state class="block text-xs capitalize text-slate-500 dark:text-slate-400">Lendo automaticamente</span>
                </div>
                <div class="flex items-center gap-1">
                    <button type="button" data-pause
                        class="rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors">Pausar</button>
                    <button type="button" data-question title="Salvar uma pergunta de leitura" aria-label="Salvar uma pergunta de leitura"
                        class="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-transparent text-slate-600 dark:text-slate-300 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors">
                        <span class="material-symbols-outlined text-lg" aria-hidden="true">help</span>
                    </button>
                </div>
            </div>`;
        document.body.appendChild(this.element);
        this.element.querySelector("[data-pause]").addEventListener("click", () => {
            const paused = this.element.dataset.state === "paused" || this.element.dataset.state === "idle-timeout";
            return paused ? this.handlers.onResume() : this.handlers.onPause();
        });
        this.element.querySelector("[data-question]").addEventListener("click", () => this.handlers.onQuestion());
        this.lastMilestone = 0;
    }

    update(session, plant) {
        if (!session) {
            this.element.classList.add("hidden");
            return;
        }
        this.element.classList.remove("hidden");
        this.element.dataset.state = session.state;
        const definition = getPlantDefinition(plant?.speciesId);
        const image = this.element.querySelector("[data-plant-image]");
        if (image.getAttribute("src") !== (definition.image || "")) {
            image.src = definition.image || "";
        }
        image.alt = definition.image ? `${definition.name} preview` : "";
        this.element.querySelector("[data-plant]").textContent = definition.name;
        this.element.querySelector("[data-state]").textContent =
            session.state === "active" ? "Lendo automaticamente" : session.state.replace("-", " ");
        const pause = this.element.querySelector("[data-pause]");
        pause.textContent = ["paused", "idle-timeout"].includes(session.state) ? "Continuar" : "Pausar";
    }

    setGardenHandler(handler) {
        this.element.querySelector("[data-open-garden]").addEventListener("click", handler);
    }
}
