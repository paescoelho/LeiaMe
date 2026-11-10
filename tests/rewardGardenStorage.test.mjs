import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/config.js";
import {
    deterministicAvailableCell,
    GardenManager,
    gardenSquareSideWithFreeSpots,
} from "../src/modules/rewards/gardenManager.js";
import {
    findGardenHitArea,
    gardenPlantScale,
    gardenSoilFlowers,
} from "../src/modules/rewards/gardenRenderer.js";
import {
    AUTOMATIC_TREE_DEFINITIONS,
    getAutomaticTreeDurationSeconds,
    getAutomaticTreeTier,
    getPlantStage,
} from "../src/modules/rewards/plantDefinitions.js";
import {
    migrateRewardState,
    REWARD_SCHEMA_VERSION,
} from "../src/modules/rewards/rewardMigrations.js";
import { mergeRewardStates, relocateGardenConflicts } from "../src/modules/rewards/rewardStorage.js";
import {
    activeReadingMillisecondsForPeriod,
    gardenMinimumSideForPeriod,
    gardenReadingTimeMessage,
    gardenPositionSeedForPlant,
    gardenPlantsForPeriod,
    projectPlantsIntoGarden,
    reflectionTextForPlant,
} from "../src/modules/ui/gardenDialog.js";

const config = { defaultGardenRows: 2, defaultGardenColumns: 2 };

test("plant stages transition at explicit thresholds and preserve excess points", () => {
    const manager = new GardenManager({ randomUUID: () => "plant-1" });
    const plant = manager.createPlant({
        speciesId: "daisy-patch",
        sessionId: "session",
        document: { id: "doc", type: "pdf" },
        timestamp: 1,
    });
    assert.equal(getPlantStage(plant.speciesId, 0).id, "seed");
    assert.equal(manager.invest(plant, 3).stage.id, "sprout");
    assert.equal(manager.invest(plant, 4).stage.id, "young");
    const final = manager.invest(plant, 20);
    assert.equal(final.stage.id, "mature");
    assert.equal(final.excess, 12);
    assert.equal(plant.pointsInvested, 15);
});

test("deterministic placement never overwrites and reports a full garden", () => {
    const plot = { id: "garden", rows: 2, columns: 2 };
    const plants = [
        { plotId: "garden", cell: { x: 0, y: 0 } },
        { plotId: "garden", cell: { x: 1, y: 0 } },
        { plotId: "garden", cell: { x: 0, y: 1 } },
    ];
    assert.deepEqual(deterministicAvailableCell(plot, plants), { x: 1, y: 1 });
    plants.push({ plotId: "garden", cell: { x: 1, y: 1 } });
    assert.equal(deterministicAvailableCell(plot, plants), null);
});

test("placing a tree expands early enough to preserve free garden spots", () => {
    const manager = new GardenManager();
    const existing = {
        id: "existing", speciesId: "reading-sapling", stage: "mature",
        plotId: "garden", cell: { x: 0, y: 0 },
    };
    const newcomer = {
        id: "newcomer", speciesId: "reading-sapling", stage: "mature",
        plotId: null, cell: null,
    };
    const state = {
        gardenPlots: [{ id: "garden", rows: 1, columns: 1, updatedAt: 1 }],
        plants: [existing, newcomer],
    };
    const result = manager.placeMaturePlant(state, newcomer, 2);
    assert.equal(result.placed, true);
    assert.equal(result.expanded, true);
    assert.equal(state.gardenPlots[0].rows, 2);
    assert.equal(state.gardenPlots[0].columns, 2);
    assert.equal(
        state.gardenPlots[0].rows * state.gardenPlots[0].columns - state.plants.length,
        2,
    );
    assert.notDeepEqual(newcomer.cell, existing.cell);
    assert.ok(newcomer.cell.x >= 0 && newcomer.cell.x < 2);
    assert.ok(newcomer.cell.y >= 0 && newcomer.cell.y < 2);
});

test("garden capacity stays square and reserves one side-length of empty spots", () => {
    assert.equal(gardenSquareSideWithFreeSpots(0, 5), 5);
    assert.equal(gardenSquareSideWithFreeSpots(20, 5), 5);
    assert.equal(gardenSquareSideWithFreeSpots(21, 5), 6);
    assert.equal(gardenSquareSideWithFreeSpots(26, 5), 6);
});

test("persisted rectangular gardens are normalized to their larger square side", () => {
    const migrated = migrateRewardState({
        gardenPlots: [{ id: "garden-1", rows: 4, columns: 7, createdAt: 1 }],
        plants: [],
    }, { defaultGardenRows: 5, defaultGardenColumns: 5 }, 2);

    assert.equal(migrated.gardenPlots[0].rows, 7);
    assert.equal(migrated.gardenPlots[0].columns, 7);
});

test("mature trees remain smaller than their isometric garden spots", () => {
    assert.equal(gardenPlantScale(90, 1), 0.68);
    assert.ok(gardenPlantScale(52, 1) * 90 < 52);
    assert.ok(gardenPlantScale(90, 0.45) < gardenPlantScale(90, 1));
});

test("soil flowers are stable, tiny edge details that defer to trees", () => {
    const cell = { x: 3, y: 2 };
    const emptyFlowers = gardenSoilFlowers(cell, false);
    const occupiedFlowers = gardenSoilFlowers(cell, true);
    assert.deepEqual(gardenSoilFlowers(cell, false), emptyFlowers);
    assert.ok(emptyFlowers.length >= 2 && emptyFlowers.length <= 5);
    assert.ok(occupiedFlowers.length <= 2);
    assert.ok(emptyFlowers.every((flower) =>
        Math.abs(flower.x) >= 0.18 && flower.size <= 1.2,
    ));
});

test("new trees use stable scattered garden positions", () => {
    const plot = { id: "garden", rows: 5, columns: 5 };
    const positions = Array.from({ length: 8 }, (_, index) =>
        deterministicAvailableCell(plot, [], `plant-${index}`),
    );
    assert.deepEqual(
        deterministicAvailableCell(plot, [], "plant-3"),
        deterministicAvailableCell(plot, [], "plant-3"),
    );
    assert.ok(new Set(positions.map((cell) => `${cell.x}:${cell.y}`)).size > 1);
});

test("sync cell conflicts relocate deterministically", () => {
    const plants = [
        { id: "a", plotId: "garden", cell: { x: 0, y: 0 }, completedAt: 1 },
        { id: "b", plotId: "garden", cell: { x: 0, y: 0 }, completedAt: 2 },
    ];
    relocateGardenConflicts(plants, [{ id: "garden", rows: 2, columns: 2 }]);
    assert.deepEqual(plants[0].cell, { x: 0, y: 0 });
    assert.deepEqual(plants[1].cell, { x: 1, y: 0 });
});

test("reward ledger merges by transaction ID without duplication", () => {
    const base = migrateRewardState(null, config, 1);
    const transaction = { id: "tx", rewardType: "active-time", points: 1, timestamp: 1, localDate: "2026-01-01", sessionId: "s", documentId: "d", deduplicationKey: "dedup", metadata: {} };
    const merged = mergeRewardStates(
        { ...base, rewardLedger: [transaction] },
        { ...base, rewardLedger: [transaction] },
        config,
        2,
    );
    assert.equal(merged.rewardLedger.length, 1);
    assert.equal(merged.gardenPlots.length, 1);
});

test("account sync cannot replace the session currently running on this device", () => {
    const base = migrateRewardState(null, config, 1);
    const localSession = {
        id: "session-live",
        state: "active",
        plantId: "plant-live",
        activeReadingMs: 3000,
        updatedAt: 10,
    };
    const remoteSession = {
        ...localSession,
        state: "paused",
        activeReadingMs: 0,
        updatedAt: 999999,
    };
    const localPlant = {
        id: "plant-live",
        speciesId: "minute-sprout",
        stage: "sprout",
        growthProgress: 0.25,
        updatedAt: 10,
    };
    const remotePlant = {
        ...localPlant,
        stage: "seed",
        growthProgress: 0,
        updatedAt: 999999,
    };

    const merged = mergeRewardStates(
        {
            ...base,
            sessions: [localSession],
            currentSession: localSession,
            plants: [localPlant],
        },
        {
            ...base,
            sessions: [remoteSession],
            currentSession: remoteSession,
            plants: [remotePlant],
        },
        config,
        20,
    );

    assert.equal(merged.currentSession.state, "active");
    assert.equal(merged.currentSession.activeReadingMs, 3000);
    assert.equal(merged.sessions.find((session) => session.id === "session-live").state, "active");
    assert.equal(merged.plants.find((plant) => plant.id === "plant-live").growthProgress, 0.25);
});

test("a removed tree tombstone wins over an older synced copy", () => {
    const base = migrateRewardState(null, config, 1);
    const remoteTree = {
        id: "tree-1",
        speciesId: "minute-sprout",
        stage: "mature",
        plotId: "garden-1",
        cell: { x: 0, y: 0 },
        completedAt: 5,
        updatedAt: 10,
    };
    const localTombstone = {
        ...remoteTree,
        plotId: null,
        cell: null,
        deletedAt: 20,
        updatedAt: 20,
    };

    const merged = mergeRewardStates(
        { ...base, plants: [localTombstone] },
        { ...base, plants: [remoteTree] },
        config,
        30,
    );

    assert.equal(merged.plants.length, 1);
    assert.equal(merged.plants[0].deletedAt, 20);
    assert.equal(merged.plants[0].cell, null);
    assert.deepEqual(gardenPlantsForPeriod(merged.plants, "year", 30, 1), []);
});

test("cross-device merge keeps one garden and both devices' trees", () => {
    const tree = (id, plotId, timestamp) => ({
        id,
        speciesId: "reading-sapling",
        stage: "mature",
        plotId,
        cell: { x: 0, y: 0 },
        plantedAt: timestamp,
        completedAt: timestamp,
        updatedAt: timestamp,
    });
    const merged = mergeRewardStates(
        {
            gardenPlots: [{ id: "local-garden", rows: 2, columns: 2, createdAt: 1 }],
            plants: [tree("local-tree", "local-garden", 1)],
        },
        {
            gardenPlots: [{ id: "remote-garden", rows: 2, columns: 2, createdAt: 2 }],
            plants: [tree("remote-tree", "remote-garden", 2)],
        },
        config,
        3,
    );
    assert.equal(merged.gardenPlots.length, 1);
    assert.equal(merged.plants.length, 2);
    assert.equal(merged.plants.every((plant) => plant.plotId === merged.gardenPlots[0].id), true);
    assert.equal(new Set(merged.plants.map((plant) => `${plant.cell.x}:${plant.cell.y}`)).size, 2);
});

test("schema migration repairs malformed persisted collections", () => {
    const migrated = migrateRewardState({
        schemaVersion: 0,
        rewardLedger: "bad",
        sessions: null,
        plants: [{ nope: true }],
        unallocatedGrowthPoints: -9,
    }, config, 1);
    assert.equal(migrated.schemaVersion, REWARD_SCHEMA_VERSION);
    assert.deepEqual(migrated.rewardLedger, []);
    assert.deepEqual(migrated.plants, []);
    assert.equal(migrated.unallocatedGrowthPoints, 0);
});

test("schema migration consolidates old plots into one garden without losing placed trees", () => {
    const migrated = migrateRewardState({
        schemaVersion: 1,
        gardenPlots: [
            { id: "garden-a", rows: 2, columns: 2, createdAt: 1, updatedAt: 1 },
            { id: "garden-b", rows: 2, columns: 2, createdAt: 2, updatedAt: 2 },
        ],
        plants: [
            { id: "tree-a", speciesId: "reading-sapling", stage: "mature", plotId: "garden-a", cell: { x: 0, y: 0 }, plantedAt: 1, completedAt: 2 },
            { id: "tree-b", speciesId: "reading-sapling", stage: "mature", plotId: "garden-b", cell: { x: 0, y: 0 }, plantedAt: 3, completedAt: 4 },
        ],
    }, config, 10);

    assert.equal(migrated.gardenPlots.length, 1);
    assert.equal(migrated.plants.every((plant) => plant.plotId === migrated.gardenPlots[0].id), true);
    assert.equal(new Set(migrated.plants.map((plant) => `${plant.cell.x}:${plant.cell.y}`)).size, 2);
});

test("schema migration expands beyond 25 blocks and places waiting trees", () => {
    const plants = Array.from({ length: 26 }, (_, index) => ({
        id: `tree-${index}`,
        speciesId: "reading-sapling",
        stage: "mature",
        plotId: index < 25 ? "garden-1" : null,
        cell: index < 25 ? { x: index % 5, y: Math.floor(index / 5) } : null,
        completedAt: index + 1,
    }));
    const migrated = migrateRewardState({
        gardenPlots: [{ id: "garden-1", rows: 5, columns: 5, createdAt: 1 }],
        plants,
    }, { defaultGardenRows: 5, defaultGardenColumns: 5 }, 100);
    assert.equal(migrated.gardenPlots[0].rows, 6);
    assert.equal(migrated.gardenPlots[0].columns, 6);
    assert.equal(migrated.plants.every((plant) => plant.cell), true);
    assert.equal(new Set(migrated.plants.map((plant) => `${plant.cell.x}:${plant.cell.y}`)).size, 26);
});

test("garden manager never creates a second user garden", () => {
    const manager = new GardenManager({ randomUUID: () => "garden-new" });
    const state = migrateRewardState(null, config, 1);
    const original = state.gardenPlots[0];
    const result = manager.createPlot(state, {
        name: "Another garden",
        rows: 10,
        columns: 10,
        timestamp: 2,
    });
    assert.equal(result.id, original.id);
    assert.equal(state.gardenPlots.length, 1);
});

test("garden period views use local week, month, and year boundaries", () => {
    const now = new Date(2026, 6, 30, 12).getTime();
    const plants = [
        { id: "week", stage: "mature", completedAt: new Date(2026, 6, 27, 12).getTime() },
        { id: "month", stage: "mature", completedAt: new Date(2026, 6, 2, 12).getTime() },
        { id: "year", stage: "mature", completedAt: new Date(2026, 0, 5, 12).getTime() },
        { id: "past", stage: "mature", completedAt: new Date(2025, 11, 31, 12).getTime() },
        { id: "removed", stage: "mature", completedAt: now, deletedAt: now + 1 },
    ];
    assert.deepEqual(gardenPlantsForPeriod(plants, "week", now, 1).map((plant) => plant.id), ["week"]);
    assert.deepEqual(gardenPlantsForPeriod(plants, "month", now, 1).map((plant) => plant.id), ["month", "week"]);
    assert.deepEqual(gardenPlantsForPeriod(plants, "year", now, 1).map((plant) => plant.id), ["year", "month", "week"]);
});

test("week, month, and year gardens use progressively larger square minimums", () => {
    assert.equal(gardenMinimumSideForPeriod("week", 5), 3);
    assert.equal(gardenMinimumSideForPeriod("month", 5), 4);
    assert.equal(gardenMinimumSideForPeriod("year", 5), 5);

    const twoTrees = [{ id: "one" }, { id: "two" }];
    for (const [period, expectedSide] of [["week", 3], ["month", 4], ["year", 5]]) {
        const minimumSide = gardenMinimumSideForPeriod(period, 5);
        const projection = projectPlantsIntoGarden(twoTrees, {
            id: "garden-1",
            rows: minimumSide,
            columns: minimumSide,
        });
        assert.equal(projection.plot.rows, expectedSide);
        assert.equal(projection.plot.columns, expectedSide);
    }
});

test("garden popup summarizes the current interval and local reading totals", () => {
    const now = new Date(2026, 6, 30, 12).getTime();
    const state = {
        plants: [{
            id: "minute-tree",
            speciesId: "minute-sprout",
            stage: "mature",
            completedAt: now - 1000,
        }],
        activeTimeByDay: {
            "2026-07-30": 6 * 60000,
            "2026-07-20": 4 * 60000,
            "2026-01-05": 3 * 60000,
            "2025-12-31": 99 * 60000,
        },
    };

    assert.equal(activeReadingMillisecondsForPeriod(state.activeTimeByDay, "week", now, 1), 6 * 60000);
    assert.equal(
        gardenReadingTimeMessage(state, now, 1),
        [
            "Cada árvore cresce a cada 5 minutos de leitura.",
            "Nesta semana você leu 6 minutos.",
            "Neste mês você leu 10 minutos.",
            "Neste ano você leu 13 minutos.",
        ].join("\n"),
    );
});

test("period projections add enough blocks for every visible tree", () => {
    const trees = Array.from({ length: 26 }, (_, index) => ({ id: `tree-${index}` }));
    const projection = projectPlantsIntoGarden(trees, {
        id: "garden-1", rows: 5, columns: 5,
    });
    assert.equal(projection.plot.rows, 6);
    assert.equal(projection.plot.columns, 6);
    assert.equal(projection.plants.length, 26);
    assert.equal(projection.plants.every((plant) => plant.cell), true);
});

test("period tree positions are phrase-seeded, stable, and conflict-free", () => {
    const trees = [
        { id: "tree-a", reflectionText: "The same phrase" },
        { id: "tree-b", reflectionText: "The same phrase" },
        { id: "tree-c", reflectionText: "A different thought" },
    ];
    const plot = { id: "garden-1", rows: 5, columns: 5 };
    const first = projectPlantsIntoGarden(trees, plot);
    const second = projectPlantsIntoGarden(trees, plot);
    assert.deepEqual(
        first.plants.map((plant) => plant.cell),
        second.plants.map((plant) => plant.cell),
    );
    assert.equal(
        new Set(first.plants.map((plant) => `${plant.cell.x}:${plant.cell.y}`)).size,
        trees.length,
    );
    assert.notEqual(
        gardenPositionSeedForPlant(trees[0]),
        gardenPositionSeedForPlant(trees[1]),
    );
});

test("garden hit testing prefers the front tree and uses diamond cells", () => {
    const back = {
        cell: { x: 0, y: 0 }, plant: { id: "back" },
        centerX: 100, centerY: 100, width: 80, height: 40,
        plantBounds: { left: 70, right: 130, top: 30, bottom: 105 },
    };
    const front = {
        cell: { x: 1, y: 0 }, plant: { id: "front" },
        centerX: 140, centerY: 120, width: 80, height: 40,
        plantBounds: { left: 110, right: 170, top: 50, bottom: 125 },
    };
    assert.equal(findGardenHitArea([back, front], 120, 80).plant.id, "front");
    assert.equal(findGardenHitArea([back, front], 100, 100).plant.id, "back");
    assert.equal(findGardenHitArea([back, front], 65, 80), null);
});

test("garden hit testing ignores transparent SVG pixels", () => {
    const back = {
        cell: { x: 0, y: 0 }, plant: { id: "visible-back" },
        centerX: 100, centerY: 100, width: 80, height: 40,
        plantBounds: { left: 70, right: 130, top: 30, bottom: 105 },
    };
    const transparentMask = new Uint8ClampedArray(2 * 2 * 4);
    const front = {
        cell: { x: 1, y: 0 }, plant: { id: "transparent-front" },
        centerX: 140, centerY: 120, width: 80, height: 40,
        plantBounds: { left: 110, right: 170, top: 50, bottom: 125 },
        plantMask: { width: 2, height: 2, data: transparentMask },
    };
    assert.equal(findGardenHitArea([back, front], 120, 80).plant.id, "visible-back");
});

test("a garden tree resolves its saved reading note", () => {
    const reflections = [
        { id: "note-1", sessionId: "session-1", text: "  A useful insight.  " },
    ];
    assert.equal(
        reflectionTextForPlant({ reflectionId: "note-1" }, reflections),
        "A useful insight.",
    );
    assert.equal(
        reflectionTextForPlant({ sessionId: "session-1" }, reflections),
        "A useful insight.",
    );
});

test("each group of seven automatic trees adds one second to the next goal", () => {
    const minuteTree = {
        id: "minute-1",
        speciesId: "minute-sprout",
        stage: "mature",
    };
    const sapling = {
        id: "sapling-1",
        speciesId: "reading-sapling",
        stage: "mature",
    };
    const baseSeconds = CONFIG.REWARDS.treePlantingIntervalMinutes * 60;
    assert.equal(getAutomaticTreeDurationSeconds([]), baseSeconds);
    assert.equal(getAutomaticTreeDurationSeconds([minuteTree]), baseSeconds);
    assert.equal(getAutomaticTreeTier([]).definition.durationSeconds, baseSeconds);
    assert.equal(getAutomaticTreeTier([minuteTree]).definition.durationSeconds, baseSeconds);
    const nextTier = getAutomaticTreeTier([minuteTree, sapling]);
    assert.equal(nextTier.definition.id, "aurora-pine");
    assert.equal(nextTier.definition.durationSeconds, baseSeconds);
    const sevenCompletedTrees = AUTOMATIC_TREE_DEFINITIONS.slice(0, 7).map((definition, index) => ({
        id: `first-group-${index}`,
        speciesId: definition.id,
        stage: "mature",
    }));
    assert.equal(getAutomaticTreeDurationSeconds(sevenCompletedTrees), baseSeconds + 1);
    assert.equal(
        getAutomaticTreeDurationSeconds([...sevenCompletedTrees, ...sevenCompletedTrees.map((tree) => ({
            ...tree,
            id: `second-group-${tree.id}`,
        }))]),
        baseSeconds + 2,
    );
    assert.deepEqual(
        AUTOMATIC_TREE_DEFINITIONS.map((definition) => definition.durationMinutes),
        Array.from({ length: 25 }, () => CONFIG.REWARDS.treePlantingIntervalMinutes),
    );
});

test("automatic tree duration stops increasing at ten minutes", () => {
    const completedEarlierTiers = AUTOMATIC_TREE_DEFINITIONS.slice(0, -1).map((definition, index) => ({
        id: `tree-${index}`,
        speciesId: definition.id,
        stage: "mature",
    }));
    const buriti = {
        id: "buriti-1",
        speciesId: "buriti-sun-palm",
        stage: "mature",
    };
    const secondBuriti = { ...buriti, id: "buriti-2" };
    const thirdBuriti = { ...buriti, id: "buriti-3" };
    const fourthBuriti = { ...buriti, id: "buriti-4" };

    assert.equal(getAutomaticTreeTier(completedEarlierTiers).definition.durationSeconds, 303);
    assert.equal(getAutomaticTreeTier([...completedEarlierTiers, buriti]).definition.durationSeconds, 303);
    assert.equal(getAutomaticTreeTier([...completedEarlierTiers, buriti, secondBuriti]).definition.durationSeconds, 303);
    assert.equal(getAutomaticTreeTier([...completedEarlierTiers, buriti, secondBuriti, thirdBuriti]).definition.durationSeconds, 303);
    assert.equal(getAutomaticTreeTier([...completedEarlierTiers, buriti, secondBuriti, thirdBuriti, fourthBuriti]).definition.durationSeconds, 304);

    const manyCompletedTrees = Array.from({ length: 2100 }, (_, index) => ({
        id: `completed-${index}`,
        speciesId: "buriti-sun-palm",
        stage: "mature",
    }));
    assert.equal(getAutomaticTreeDurationSeconds(manyCompletedTrees), 600);
});

test("automatic trees rotate through the catalog after every species is earned", () => {
    const completedCatalog = AUTOMATIC_TREE_DEFINITIONS.map((definition, index) => ({
        id: `tree-${index}`,
        speciesId: definition.id,
        stage: "mature",
        completedAt: index + 1,
    }));

    assert.equal(getAutomaticTreeTier(completedCatalog).definition.id, "minute-sprout");
    assert.equal(
        getAutomaticTreeTier([
            ...completedCatalog,
            {
                id: "rotated-minute",
                speciesId: "minute-sprout",
                stage: "mature",
                completedAt: completedCatalog.length + 1,
            },
        ]).definition.id,
        "reading-sapling",
    );
});

test("existing Buriti repeats recover by restarting the catalog rotation", () => {
    const completedCatalog = AUTOMATIC_TREE_DEFINITIONS.map((definition, index) => ({
        id: `tree-${index}`,
        speciesId: definition.id,
        stage: "mature",
        completedAt: index + 1,
    }));
    const oldBuritiRepeats = Array.from({ length: 4 }, (_, index) => ({
        id: `old-buriti-${index}`,
        speciesId: "buriti-sun-palm",
        stage: "mature",
        completedAt: completedCatalog.length + index + 1,
    }));

    assert.equal(
        getAutomaticTreeTier([...completedCatalog, ...oldBuritiRepeats]).definition.id,
        "minute-sprout",
    );
});
