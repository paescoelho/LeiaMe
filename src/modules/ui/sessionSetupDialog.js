import { availablePlantDefinitions } from "../rewards/plantDefinitions.js";

export class SessionSetupDialog {
    constructor({ config, onStart }) {
        this.config = config;
        this.onStart = onStart;
        this.dialog = document.createElement("dialog");
        this.dialog.className =
            "rewards-dialog w-[94vw] max-w-xl max-h-[88vh] p-0 rounded-xl border border-slate-200 " +
            "dark:border-slate-700 bg-background-light dark:bg-background-dark text-slate-800 " +
            "dark:text-slate-200 text-center shadow-2xl";
        this.dialog.innerHTML = `
            <form method="dialog" class="grid gap-4 p-4 sm:p-6 overflow-y-auto max-h-[88vh]">
                <header class="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                    <div class="flex-1 text-center">
                        <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">Cresça enquanto lê</h2>
                        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Escolha uma meta de foco e uma planta.</p>
                    </div>
                    <button value="cancel" aria-label="Fechar"
                        class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                        <span class="material-symbols-outlined" aria-hidden="true">close</span>
                    </button>
                </header>
                <p class="text-sm text-slate-600 dark:text-slate-300">Só o tempo de leitura ativa e concentrada faz a planta crescer.</p>
                <label class="grid gap-2 text-left text-sm font-medium text-slate-700 dark:text-slate-200">
                    Meta de leitura
                    <select data-goal class="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-900 px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary"></select>
                </label>
                <fieldset data-plants class="grid grid-cols-1 sm:grid-cols-2 gap-2 border-0 p-0">
                    <legend class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Planta</legend>
                </fieldset>
                <footer class="flex items-center justify-end gap-2 pt-1">
                    <button value="cancel"
                        class="rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">Cancelar</button>
                    <button type="button" data-start
                        class="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors">Começar a ler</button>
                </footer>
            </form>`;
        document.body.appendChild(this.dialog);
        const goal = this.dialog.querySelector("[data-goal]");
        for (const minutes of config.sessionGoalsMinutes) {
            const option = document.createElement("option");
            option.value = String(minutes);
            option.textContent = `${minutes} minutos`;
            option.selected = minutes === config.defaultSessionGoalMinutes;
            goal.appendChild(option);
        }
        this.dialog.querySelector("[data-start]").addEventListener("click", async () => {
            const speciesId = this.dialog.querySelector("[name='reward-plant']:checked")?.value;
            if (!speciesId) return;
            const button = this.dialog.querySelector("[data-start]");
            button.disabled = true;
            try {
                await this.onStart({ goalMinutes: Number(goal.value), speciesId });
                this.dialog.close();
            } finally {
                button.disabled = false;
            }
        });
    }

    open({ totalPoints, unlocks, preferredSpeciesId = null }) {
        const fieldset = this.dialog.querySelector("[data-plants]");
        fieldset.replaceChildren(fieldset.querySelector("legend"));
        const definitions = availablePlantDefinitions(totalPoints, unlocks);
        definitions.forEach((plant, index) => {
            const label = document.createElement("label");
            label.className =
                "flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 " +
                "bg-white/50 dark:bg-black/20 p-3 text-slate-700 dark:text-slate-200 " +
                "hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors " +
                "has-[:checked]:bg-white dark:has-[:checked]:bg-slate-700 " +
                (plant.locked ? "opacity-80" : "");
            const selected = !plant.locked && (plant.id === preferredSpeciesId || (!preferredSpeciesId && index === 0));
            label.innerHTML = `
                <input type="radio" name="reward-plant" value="${plant.id}" ${plant.locked ? "disabled" : ""} ${selected ? "checked" : ""}
                    class="reward-plant-radio h-5 w-5">
                <span class="material-symbols-outlined text-primary" aria-hidden="true">local_florist</span>
                <span class="min-w-0">
                    <strong class="block text-sm">${plant.name}</strong>
                    <small class="block text-xs text-slate-500 dark:text-slate-400">${plant.requiredPoints} points · ${plant.rarity}${plant.locked ? ` · unlocks at ${plant.unlockPoints}` : ""}</small>
                </span>`;
            fieldset.appendChild(label);
        });
        const first = fieldset.querySelector("input:not(:disabled)");
        if (first && !fieldset.querySelector("input:checked")) first.checked = true;
        this.dialog.showModal();
    }
}
