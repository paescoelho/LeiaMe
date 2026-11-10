import { localDateKey } from "./rewardDefinitions.js";
import { gardenSquareSideWithFreeSpots } from "./gardenManager.js";

export const REWARD_SCHEMA_VERSION = 2;

function firstAvailableCell(plot, occupied) {
    for (let diagonal = 0; diagonal <= plot.rows + plot.columns - 2; diagonal++) {
        for (let y = 0; y < plot.rows; y++) {
            const x = diagonal - y;
            if (x >= 0 && x < plot.columns && !occupied.has(`${x}:${y}`)) return { x, y };
        }
    }
    return null;
}

export function consolidateGardenPlots(state, config = {}, now = Date.now()) {
    const fallbackRows = Math.max(1, Number(config.defaultGardenRows) || 5);
    const fallbackColumns = Math.max(1, Number(config.defaultGardenColumns) || 5);
    const candidates = (Array.isArray(state.gardenPlots) ? state.gardenPlots : [])
        .filter((plot) => plot?.id)
        .sort(
            (left, right) =>
                Number(left.createdAt || 0) - Number(right.createdAt || 0) ||
                String(left.id).localeCompare(String(right.id)),
        );
    const preferred = candidates.find((plot) => plot.id === "garden-1") || candidates[0];
    const minimumSide = Math.max(
        fallbackRows,
        fallbackColumns,
        ...candidates.map((plot) => Math.max(1, Number(plot.rows) || 1)),
        ...candidates.map((plot) => Math.max(1, Number(plot.columns) || 1)),
    );
    const visiblePlants = state.plants.filter((plant) => !plant?.deletedAt);
    const maturePlants = visiblePlants.filter((plant) => plant?.stage === "mature");
    const side = gardenSquareSideWithFreeSpots(maturePlants.length, minimumSide);
    const expanded = side !== Number(preferred?.rows) || side !== Number(preferred?.columns);
    const garden = {
        id: preferred?.id || "garden-1",
        name: "Jardim de leitura",
        rows: side,
        columns: side,
        createdAt: Number(preferred?.createdAt) || now,
        updatedAt: candidates.length > 1 || expanded
            ? now
            : Number(preferred?.updatedAt) || now,
    };
    state.gardenPlots = [garden];

    const occupied = new Set();
    const matureIds = new Set(maturePlants.map((plant) => plant.id));
    const placedIds = new Set();
    const sorted = [...visiblePlants].sort(
        (left, right) =>
            Number(left.completedAt || left.plantedAt || 0) -
                Number(right.completedAt || right.plantedAt || 0) ||
            String(left.id).localeCompare(String(right.id)),
    );
    // Reserve every valid existing position first so expanding the garden
    // never moves an established tree merely because an unplaced tree is older.
    for (const plant of sorted) {
        if (!matureIds.has(plant.id) || !plant.cell) continue;
        const requested = plant.cell;
        const key = `${requested?.x}:${requested?.y}`;
        const valid =
            Number.isInteger(requested?.x) &&
            Number.isInteger(requested?.y) &&
            requested.x >= 0 &&
            requested.y >= 0 &&
            requested.x < garden.columns &&
            requested.y < garden.rows &&
            !occupied.has(key);
        if (!valid) continue;
        plant.plotId = garden.id;
        occupied.add(key);
        placedIds.add(plant.id);
    }
    for (const plant of sorted) {
        if (!matureIds.has(plant.id)) {
            if (plant.plotId !== garden.id) {
                plant.plotId = null;
                plant.cell = null;
            }
            continue;
        }
        if (placedIds.has(plant.id)) continue;
        const cell = firstAvailableCell(garden, occupied);
        plant.plotId = cell ? garden.id : null;
        plant.cell = cell || null;
        if (cell) occupied.add(`${cell.x}:${cell.y}`);
    }
    return garden;
}

export function createInitialRewardState(config = {}, now = Date.now()) {
    const side = Math.max(
        1,
        Math.floor(Number(config.defaultGardenRows) || 5),
        Math.floor(Number(config.defaultGardenColumns) || 5),
    );
    return {
        schemaVersion: REWARD_SCHEMA_VERSION,
        migrationVersion: REWARD_SCHEMA_VERSION,
        updatedAt: now,
        totalActiveReadingMs: 0,
        activeTimeByDay: {},
        activeTimeByDocument: {},
        timeRewardRemainderMs: 0,
        rewardLedger: [],
        sessions: [],
        currentSession: null,
        gardenPlots: [{
            id: "garden-1",
            name: "Jardim de leitura",
            rows: side,
            columns: side,
            createdAt: now,
            updatedAt: now,
        }],
        plants: [],
        currentGrowingPlantId: null,
        plantUnlocks: ["minute-sprout", "reading-sapling", "daisy-patch"],
        weeklyConsistency: {},
        reflections: [],
        unallocatedGrowthPoints: 0,
        lastValidReadingTimestamp: null,
        dailyRewardCaps: {},
        createdLocalDate: localDateKey(now),
    };
}

export function migrateRewardState(input, config = {}, now = Date.now()) {
    const fallback = createInitialRewardState(config, now);
    if (!input || typeof input !== "object" || Array.isArray(input)) return fallback;
    const result = { ...fallback, ...input };
    for (const key of ["activeTimeByDay", "activeTimeByDocument", "weeklyConsistency", "dailyRewardCaps"]) {
        if (!result[key] || typeof result[key] !== "object" || Array.isArray(result[key])) result[key] = {};
    }
    for (const key of ["rewardLedger", "sessions", "gardenPlots", "plants", "plantUnlocks", "reflections"]) {
        if (!Array.isArray(result[key])) result[key] = fallback[key];
    }
    result.rewardLedger = result.rewardLedger.filter((entry) => entry && entry.id && entry.deduplicationKey);
    result.sessions = result.sessions.filter((entry) => entry && entry.id);
    result.plants = result.plants.filter((entry) => entry && entry.id && entry.speciesId);
    for (const plant of result.plants) {
        if (!plant.deletedAt) continue;
        plant.plotId = null;
        plant.cell = null;
        plant.reflectionRequired = false;
    }
    result.reflections = result.reflections.filter((entry) => entry && entry.id && entry.sessionId);
    consolidateGardenPlots(result, config, now);
    result.schemaVersion = REWARD_SCHEMA_VERSION;
    result.migrationVersion = REWARD_SCHEMA_VERSION;
    result.unallocatedGrowthPoints = Math.max(0, Number(result.unallocatedGrowthPoints) || 0);
    result.timeRewardRemainderMs = Math.max(0, Number(result.timeRewardRemainderMs) || 0);
    return result;
}
