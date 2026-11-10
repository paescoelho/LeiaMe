import treeCatalog from "../../../assets/rewards/trees/catalog.json" with { type: "json" };
import { CONFIG } from "../../config.js";

/**
 * @typedef {Object} GardenPlant
 * @property {string} id
 * @property {string} speciesId
 * @property {string} stage
 * @property {number} pointsInvested
 * @property {?string} plotId
 * @property {?{x:number,y:number}} cell
 * @property {number} plantedAt
 * @property {?number} completedAt
 * @property {?string} sourceDocumentId
 * @property {?string} sourceDocumentType
 * @property {string} sessionId
 * @property {?string} reflectionId
 */

/**
 * @typedef {Object} GardenPlot
 * @property {string} id
 * @property {string} name
 * @property {number} rows
 * @property {number} columns
 * @property {number} createdAt
 * @property {number} updatedAt
 */

const STAGES = Object.freeze([
    Object.freeze({ id: "seed", threshold: 0, label: "Semente" }),
    Object.freeze({ id: "sprout", threshold: 0.2, label: "Broto" }),
    Object.freeze({ id: "young", threshold: 0.45, label: "Planta jovem" }),
    Object.freeze({ id: "flowering", threshold: 0.75, label: "Planta florida" }),
    Object.freeze({ id: "mature", threshold: 1, label: "Planta adulta" }),
]);

const plant = (definition) => Object.freeze({ ...definition, stages: STAGES });

export const AUTOMATIC_TREE_DEFINITIONS = Object.freeze(
    treeCatalog.trees.map((definition) => plant({
        ...definition,
        automatic: true,
        durationMinutes: CONFIG.REWARDS.treePlantingIntervalMinutes,
        requiredPoints: Number(definition.requiredPoints) || 15,
        unlockPoints: 0,
    })),
);

const LEGACY_PLANT_DEFINITIONS = [
    plant({ id: "daisy-patch", name: "Canteiro de margaridas", rarity: "common", requiredPoints: 15, unlockPoints: 0, palette: ["#fffaf0", "#f6b93b", "#4d9b62"] }),
    plant({ id: "lavender", name: "Lavanda", rarity: "common", requiredPoints: 18, unlockPoints: 20, palette: ["#9b87db", "#6554a4", "#4f8d64"] }),
    plant({ id: "fern", name: "Samambaia prateada", rarity: "uncommon", requiredPoints: 20, unlockPoints: 45, palette: ["#9ed49a", "#3f8158", "#285b45"] }),
    plant({ id: "sunflower", name: "Girassol", rarity: "uncommon", requiredPoints: 24, unlockPoints: 75, palette: ["#f8c74f", "#7d532a", "#4c9660"] }),
    plant({ id: "hydrangea", name: "Hortênsia-nuvem", rarity: "rare", requiredPoints: 28, unlockPoints: 120, palette: ["#77a9dd", "#a683cc", "#477957"] }),
    plant({ id: "flowering-tree", name: "Árvore-lanterna florida", rarity: "rare", requiredPoints: 34, unlockPoints: 180, palette: ["#f3a7ba", "#815b45", "#39704c"] }),
];

export const PLANT_DEFINITIONS = Object.freeze([
    ...AUTOMATIC_TREE_DEFINITIONS,
    ...LEGACY_PLANT_DEFINITIONS,
]);

export function getPlantDefinition(speciesId) {
    return PLANT_DEFINITIONS.find((definition) => definition.id === speciesId) || PLANT_DEFINITIONS[0];
}

export function getPlantStage(speciesId, pointsInvested, progressOverride = null) {
    const definition = getPlantDefinition(speciesId);
    const hasProgressOverride =
        progressOverride !== null &&
        progressOverride !== undefined &&
        Number.isFinite(Number(progressOverride));
    const rawProgress = hasProgressOverride
        ? Number(progressOverride)
        : (Number(pointsInvested) || 0) / definition.requiredPoints;
    const progress = Math.max(0, Math.min(1, rawProgress));
    let stage = definition.stages[0];
    for (const candidate of definition.stages) {
        if (progress >= candidate.threshold) stage = candidate;
    }
    return { ...stage, progress, percent: Math.floor(progress * 100) };
}

export function getAutomaticTreeDurationSeconds(plants = []) {
    const automaticSpecies = new Set(AUTOMATIC_TREE_DEFINITIONS.map((definition) => definition.id));
    const completedTrees = plants.filter(
        (candidate) => automaticSpecies.has(candidate.speciesId) && candidate.stage === "mature",
    ).length;
    const baseSeconds = Math.max(
        1,
        Math.round(Number(CONFIG.REWARDS.treePlantingIntervalMinutes) * 60),
    );
    const incrementSeconds = Math.max(
        0,
        Number(CONFIG.REWARDS.treePlantingIncrementSeconds) || 0,
    );
    const incrementEveryTrees = Math.max(
        1,
        Math.floor(Number(CONFIG.REWARDS.treePlantingIncrementEveryTrees) || 1),
    );
    const completedGroups = Math.floor(completedTrees / incrementEveryTrees);
    const configuredMaximumSeconds = Number(CONFIG.REWARDS.treePlantingMaximumMinutes) * 60;
    const maximumSeconds = Number.isFinite(configuredMaximumSeconds) && configuredMaximumSeconds > 0
        ? Math.max(baseSeconds, configuredMaximumSeconds)
        : Number.POSITIVE_INFINITY;
    return Math.min(maximumSeconds, baseSeconds + (completedGroups * incrementSeconds));
}

function withCurrentAutomaticDuration(definition, plants) {
    const durationSeconds = getAutomaticTreeDurationSeconds(plants);
    return Object.freeze({
        ...definition,
        durationSeconds,
        durationMinutes: durationSeconds / 60,
    });
}

/** Select each catalog tree once, then keep rotating in catalog order. */
export function getAutomaticTreeTier(plants = []) {
    for (let index = 0; index < AUTOMATIC_TREE_DEFINITIONS.length; index++) {
        const definition = AUTOMATIC_TREE_DEFINITIONS[index];
        const completed = plants.filter(
            (candidate) => candidate.speciesId === definition.id && candidate.stage === "mature",
        ).length;
        const required = Number(definition.requiredCompletions);
        if (!Number.isFinite(required) || required <= 0 || completed < required) {
            const activeDefinition = withCurrentAutomaticDuration(definition, plants);
            return {
                definition: activeDefinition,
                index,
                completed,
                required: Number.isFinite(required) && required > 0 ? required : null,
                remaining: Number.isFinite(required) && required > 0 ? Math.max(0, required - completed) : null,
                next: AUTOMATIC_TREE_DEFINITIONS[index + 1] || null,
            };
        }
    }

    const automaticSpecies = new Set(AUTOMATIC_TREE_DEFINITIONS.map((definition) => definition.id));
    const completedTrees = plants.filter(
        (candidate) => automaticSpecies.has(candidate.speciesId) && candidate.stage === "mature",
    );
    const latestTree = completedTrees.reduce((latest, candidate) => {
        if (!latest) return candidate;
        const latestTimestamp = Number(latest.completedAt || latest.plantedAt || latest.updatedAt || 0);
        const candidateTimestamp = Number(candidate.completedAt || candidate.plantedAt || candidate.updatedAt || 0);
        return candidateTimestamp >= latestTimestamp ? candidate : latest;
    }, null);
    const latestIndex = AUTOMATIC_TREE_DEFINITIONS.findIndex(
        (definition) => definition.id === latestTree?.speciesId,
    );
    const index = (latestIndex + 1) % AUTOMATIC_TREE_DEFINITIONS.length;
    const definition = withCurrentAutomaticDuration(AUTOMATIC_TREE_DEFINITIONS[index], plants);
    return {
        definition,
        index,
        completed: completedTrees.filter((candidate) => candidate.speciesId === definition.id).length,
        required: null,
        remaining: null,
        next: AUTOMATIC_TREE_DEFINITIONS[(index + 1) % AUTOMATIC_TREE_DEFINITIONS.length],
    };
}

export function availablePlantDefinitions(totalEarnedPoints, unlocks = []) {
    const unlocked = new Set(unlocks);
    return PLANT_DEFINITIONS.map((definition) => ({
        ...definition,
        locked: definition.unlockPoints > totalEarnedPoints && !unlocked.has(definition.id),
    }));
}
