import { getPlantDefinition, getPlantStage } from "./plantDefinitions.js";
import { uuid } from "./rewardDefinitions.js";

function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

/**
 * Selects an available cell from a stable shuffled order.
 *
 * A plant ID is used as the seed so newly completed trees are visually
 * distributed around the garden while placement remains reproducible after
 * reloads and synchronization.
 */
export function deterministicAvailableCell(plot, plants, seed = "") {
    const occupied = new Set(
        plants
            .filter((plant) => !plant.deletedAt && plant.plotId === plot.id && plant.cell)
            .map((plant) => `${plant.cell.x}:${plant.cell.y}`),
    );
    const available = [];
    for (let diagonal = 0; diagonal <= plot.rows + plot.columns - 2; diagonal++) {
        for (let y = 0; y < plot.rows; y++) {
            const x = diagonal - y;
            if (x >= 0 && x < plot.columns && !occupied.has(`${x}:${y}`)) available.push({ x, y });
        }
    }
    if (!available.length) return null;
    if (!seed) return available[0];
    available.sort((left, right) => {
        const leftOrder = stableHash(`${seed}:${left.x}:${left.y}`);
        const rightOrder = stableHash(`${seed}:${right.x}:${right.y}`);
        return leftOrder - rightOrder || left.y - right.y || left.x - right.x;
    });
    return available[0];
}

/** Return a square side that also leaves at least one side-length of free spots. */
export function gardenSquareSideWithFreeSpots(plantCount, minimumSide = 1) {
    const visiblePlants = Math.max(0, Math.floor(Number(plantCount) || 0));
    let side = Math.max(1, Math.floor(Number(minimumSide) || 1));
    while (side * side - visiblePlants < side) side += 1;
    return side;
}

/** Pure garden entity creation, investment, and deterministic placement API. */
export class GardenManager {
    constructor({ randomUUID } = {}) {
        this.randomUUID = randomUUID;
    }

    createPlant({ speciesId, sessionId, document, timestamp = Date.now() }) {
        const definition = getPlantDefinition(speciesId);
        return {
            id: uuid(this.randomUUID),
            speciesId: definition.id,
            rarity: definition.rarity,
            requiredPoints: definition.requiredPoints,
            durationMinutes: Number(definition.durationMinutes) || null,
            stage: "seed",
            pointsInvested: 0,
            growthProgress: definition.automatic ? 0 : null,
            plotId: null,
            cell: null,
            plantedAt: timestamp,
            completedAt: null,
            sourceDocumentId: document?.id || null,
            sourceDocumentType: document?.type || null,
            sessionId,
            reflectionId: null,
            updatedAt: timestamp,
        };
    }

    invest(plant, points, timestamp = Date.now()) {
        const definition = getPlantDefinition(plant.speciesId);
        const capacity = Math.max(0, definition.requiredPoints - plant.pointsInvested);
        const invested = Math.min(capacity, Math.max(0, Number(points) || 0));
        plant.pointsInvested += invested;
        const previousStage = plant.stage;
        const stage = getPlantStage(plant.speciesId, plant.pointsInvested, plant.growthProgress);
        plant.stage = stage.id;
        plant.updatedAt = timestamp;
        if (stage.id === "mature" && !plant.completedAt) plant.completedAt = timestamp;
        return {
            invested,
            excess: Math.max(0, (Number(points) || 0) - invested),
            stage,
            stageChanged: previousStage !== stage.id,
            matured: stage.id === "mature",
        };
    }

    placeMaturePlant(state, plant, timestamp = Date.now()) {
        if (plant.stage !== "mature") return { placed: false, reason: "not-mature" };
        if (plant.cell) return { placed: true, plotId: plant.plotId, cell: plant.cell };
        const plot = state.gardenPlots[0];
        if (!plot) return { placed: false, reason: "missing-garden" };
        const maturePlantCount = state.plants.filter(
            (candidate) => candidate?.stage === "mature" && !candidate.deletedAt,
        ).length;
        const requiredSide = gardenSquareSideWithFreeSpots(
            maturePlantCount,
            Math.max(Number(plot.rows) || 1, Number(plot.columns) || 1),
        );
        const expanded = requiredSide !== Number(plot.rows) || requiredSide !== Number(plot.columns);
        if (expanded) {
            // Both dimensions grow together so the isometric plot always
            // remains square while retaining a side-length of open spots.
            plot.rows = requiredSide;
            plot.columns = requiredSide;
            plot.updatedAt = timestamp;
        }
        const cell = deterministicAvailableCell(plot, state.plants, plant.id);
        if (cell) {
            plant.plotId = plot.id;
            plant.cell = cell;
            plant.updatedAt = timestamp;
            return { placed: true, plotId: plot.id, cell, expanded };
        }
        return { placed: false, reason: "garden-full" };
    }

    createPlot(state, { name, rows, columns, timestamp = Date.now() }) {
        if (state.gardenPlots[0]) return state.gardenPlots[0];
        const side = Math.max(1, Math.floor(Number(rows) || 1), Math.floor(Number(columns) || 1));
        const plot = {
            id: "garden-1",
            name: String(name || "Jardim de leitura"),
            rows: side,
            columns: side,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        state.gardenPlots = [plot];
        return plot;
    }
}
