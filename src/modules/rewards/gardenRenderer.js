import { getPlantDefinition, getPlantStage } from "./plantDefinitions.js";

const MATURE_PLANT_TO_TILE_WIDTH = 0.68;
const TREE_ASSET_WIDTH = 90;
const GROUND_FLOWER_POSITIONS = Object.freeze([
    Object.freeze({ x: -0.31, y: 0.02 }),
    Object.freeze({ x: 0.31, y: 0.02 }),
    Object.freeze({ x: -0.23, y: -0.12 }),
    Object.freeze({ x: 0.23, y: -0.12 }),
    Object.freeze({ x: -0.20, y: 0.14 }),
    Object.freeze({ x: 0.20, y: 0.14 }),
]);
const GROUND_FLOWER_COLORS = Object.freeze(["#fff3b0", "#f8c9d4", "#dbeafe", "#fff7ed"]);

function decorationHash(x, y, salt = 0) {
    return (
        Math.imul(Number(x) + 1, 73856093) ^
        Math.imul(Number(y) + 1, 19349663) ^
        Math.imul(salt + 1, 83492791)
    ) >>> 0;
}

/** Stable micro-flower positions around a cell's edges, away from its tree. */
export function gardenSoilFlowers(cell, occupied = false) {
    const seed = decorationHash(cell?.x || 0, cell?.y || 0);
    const count = occupied
        ? seed % 3
        : 2 + seed % 4;
    return Array.from({ length: count }, (_, index) => {
        const variant = decorationHash(cell?.x || 0, cell?.y || 0, index + 1);
        const position = GROUND_FLOWER_POSITIONS[
            (variant + index * 3) % GROUND_FLOWER_POSITIONS.length
        ];
        return {
            x: position.x + (((variant >>> 8) % 5) - 2) * 0.008,
            y: position.y + (((variant >>> 12) % 5) - 2) * 0.006,
            size: 0.90 + ((variant >>> 16) % 5) * 0.07,
            color: GROUND_FLOWER_COLORS[(variant >>> 20) % GROUND_FLOWER_COLORS.length],
        };
    });
}

export function gardenPlantScale(tileWidth, progress) {
    const safeTileWidth = Math.max(1, Number(tileWidth) || 1);
    const stageProgress = Math.max(0, Math.min(1, Number(progress) || 0));
    const growthScale = 0.3 + stageProgress * 0.7;
    return growthScale * safeTileWidth * MATURE_PLANT_TO_TILE_WIDTH / TREE_ASSET_WIDTH;
}

function pointInDiamond(x, y, area) {
    const halfWidth = area.width / 2;
    const halfHeight = area.height / 2;
    if (!halfWidth || !halfHeight) return false;
    return Math.abs(x - area.centerX) / halfWidth + Math.abs(y - area.centerY) / halfHeight <= 1;
}

function pointInBounds(x, y, bounds) {
    return Boolean(
        bounds &&
        x >= bounds.left &&
        x <= bounds.right &&
        y >= bounds.top &&
        y <= bounds.bottom
    );
}

function pointHitsPlant(x, y, area) {
    if (!pointInBounds(x, y, area.plantBounds)) return false;
    const mask = area.plantMask;
    if (!mask?.data || !mask.width || !mask.height) return true;
    const width = area.plantBounds.right - area.plantBounds.left;
    const height = area.plantBounds.bottom - area.plantBounds.top;
    const maskX = Math.min(
        mask.width - 1,
        Math.max(0, Math.floor((x - area.plantBounds.left) / width * mask.width)),
    );
    const maskY = Math.min(
        mask.height - 1,
        Math.max(0, Math.floor((y - area.plantBounds.top) / height * mask.height)),
    );
    return mask.data[(maskY * mask.width + maskX) * 4 + 3] > 24;
}

/** Resolve overlapping isometric cells from front to back, preferring trees. */
export function findGardenHitArea(hitAreas, x, y) {
    const frontToBack = [...hitAreas].reverse();
    return frontToBack.find((area) => area.plant && pointHitsPlant(x, y, area))
        || frontToBack.find((area) => pointInDiamond(x, y, area))
        || null;
}

/** Serializable, read-only Canvas projection of a garden plot. */
export class GardenRenderer {
    constructor(canvas, { onSelect = null } = {}) {
        this.canvas = canvas;
        this.context = canvas.getContext("2d");
        this.onSelect = onSelect;
        this.data = null;
        this.selectedIndex = -1;
        this.hitAreas = [];
        this.renderSize = { width: 0, height: 0 };
        this.imageCache = new Map();
        this.imageMaskCache = new Map();
        this.resizeObserver = typeof ResizeObserver === "function"
            ? new ResizeObserver(() => this.render(this.data))
            : null;
        this.resizeObserver?.observe(canvas);
        canvas.tabIndex = 0;
        canvas.setAttribute("role", "grid");
        canvas.addEventListener("pointermove", (event) => this._handlePointer(event, false));
        canvas.addEventListener("pointerleave", () => this._clearHover());
        canvas.addEventListener("click", (event) => this._handlePointer(event, true));
        canvas.addEventListener("keydown", (event) => this._handleKey(event));
    }

    render(data) {
        if (!data?.plot) return;
        this.data = data;
        const { canvas, context } = this;
        const rect = canvas.getBoundingClientRect();
        const cssWidth = Math.max(320, rect.width || 640);
        const tileWidth = Math.max(
            52,
            Math.min(92, cssWidth * 1.38 / (data.plot.columns + data.plot.rows)),
        );
        const tileHeight = tileWidth * 0.52;
        const originY = 118;
        const soilDepth = Math.max(26, tileHeight * 0.68);
        const maximumDepth = Math.max(0, data.plot.columns + data.plot.rows - 2);
        const cssHeight = Math.max(
            260,
            originY + maximumDepth * tileHeight / 2 + tileHeight / 2 + soilDepth + 28,
        );
        const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
        canvas.width = Math.round(cssWidth * ratio);
        canvas.height = Math.round(cssHeight * ratio);
        canvas.style.height = `${cssHeight}px`;
        this.renderSize = { width: cssWidth, height: cssHeight };
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, cssWidth, cssHeight);

        const originX = cssWidth / 2;
        this._drawSoil(
            originX,
            originY,
            tileWidth,
            tileHeight,
            soilDepth,
            data.plot,
        );
        this.hitAreas = [];
        const plantsByCell = new Map(
            data.plants.filter((plant) => plant.cell).map((plant) => [`${plant.cell.x}:${plant.cell.y}`, plant]),
        );
        const cells = [];
        for (let y = 0; y < data.plot.rows; y++) {
            for (let x = 0; x < data.plot.columns; x++) {
                cells.push({ x, y, depth: x + y });
            }
        }
        cells.sort((left, right) => left.depth - right.depth || left.y - right.y || left.x - right.x);
        for (const cell of cells) {
            const screen = this._screen(cell.x, cell.y, originX, originY, tileWidth, tileHeight);
            const plant = plantsByCell.get(`${cell.x}:${cell.y}`);
            this._drawTile(screen.x, screen.y, tileWidth, tileHeight, cell, !!plant);
            this.hitAreas.push({
                cell,
                plant,
                centerX: screen.x,
                centerY: screen.y,
                width: tileWidth,
                height: tileHeight,
                plantBounds: plant
                    ? this._plantBounds(screen.x, screen.y, tileWidth, tileHeight, plant)
                    : null,
                plantMask: plant
                    ? this.imageMaskCache.get(getPlantDefinition(plant.speciesId).image)
                    : null,
            });
        }
        this._drawSelection(originX, originY, tileWidth, tileHeight);
        for (const area of this.hitAreas) {
            if (area.plant) {
                this._drawPlant(area.centerX, area.centerY, tileWidth, tileHeight, area.plant);
            }
        }
    }

    destroy() {
        this.resizeObserver?.disconnect();
    }

    _screen(gridX, gridY, originX, originY, tileWidth, tileHeight) {
        return {
            x: originX + (gridX - gridY) * tileWidth / 2,
            y: originY + (gridX + gridY) * tileHeight / 2,
        };
    }

    _drawTile(x, y, width, height, cell, occupied = false) {
        const context = this.context;
        context.beginPath();
        context.moveTo(x, y - height / 2);
        context.lineTo(x + width / 2, y);
        context.lineTo(x, y + height / 2);
        context.lineTo(x - width / 2, y);
        context.closePath();
        context.fillStyle = (cell.x + cell.y) % 2 ? "#78b879" : "#83c482";
        context.fill();
        context.strokeStyle = "rgba(36, 82, 54, .35)";
        context.lineWidth = 1;
        context.stroke();
        this._drawSoilFlowers(x, y, width, height, cell, occupied);
    }

    _drawSoilFlowers(x, y, width, height, cell, occupied) {
        const context = this.context;
        const flowers = gardenSoilFlowers(cell, occupied);
        if (!flowers.length) return;
        const baseRadius = Math.max(0.8, Math.min(1.45, width / 66));

        context.save();
        context.globalAlpha = occupied ? 0.38 : 0.60;
        for (const flower of flowers) {
            const flowerX = x + flower.x * width;
            const flowerY = y + flower.y * height;
            const radius = baseRadius * flower.size;
            context.fillStyle = flower.color;
            for (let petal = 0; petal < 4; petal++) {
                const angle = petal * Math.PI / 2;
                context.beginPath();
                context.ellipse(
                    flowerX + Math.cos(angle) * radius,
                    flowerY + Math.sin(angle) * radius * 0.52,
                    radius * 0.72,
                    radius * 0.42,
                    angle,
                    0,
                    Math.PI * 2,
                );
                context.fill();
            }
            context.fillStyle = "#d6a514";
            context.beginPath();
            context.ellipse(flowerX, flowerY, radius * 0.38, radius * 0.24, 0, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
    }

    _drawSoil(originX, originY, tileWidth, tileHeight, depth, plot) {
        const context = this.context;
        const right = {
            x: originX + plot.columns * tileWidth / 2,
            y: originY + (plot.columns - 1) * tileHeight / 2,
        };
        const bottom = {
            x: originX + (plot.columns - plot.rows) * tileWidth / 2,
            y: originY + (plot.columns + plot.rows - 1) * tileHeight / 2,
        };
        const left = {
            x: originX - plot.rows * tileWidth / 2,
            y: originY + (plot.rows - 1) * tileHeight / 2,
        };

        context.save();
        context.fillStyle = "rgba(15, 23, 42, .16)";
        context.beginPath();
        context.ellipse(bottom.x, bottom.y + depth + 8, tileWidth * 2.25, 13, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();

        this._drawSoilFace(left, bottom, depth, "#6f5427", "#93713a", 3);
        this._drawSoilFace(bottom, right, depth, "#7d5d28", "#a17a3b", 11);

        context.save();
        context.strokeStyle = "#5c963e";
        context.lineWidth = 4;
        context.lineJoin = "round";
        context.beginPath();
        context.moveTo(left.x, left.y);
        context.lineTo(bottom.x, bottom.y);
        context.lineTo(right.x, right.y);
        context.stroke();
        context.restore();
    }

    _drawSoilFace(start, end, depth, topColor, bottomColor, seed) {
        const context = this.context;
        const gradient = context.createLinearGradient(0, start.y, 0, start.y + depth);
        gradient.addColorStop(0, topColor);
        gradient.addColorStop(1, bottomColor);
        context.save();
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.lineTo(end.x, end.y + depth);
        context.lineTo(start.x, start.y + depth);
        context.closePath();
        context.fillStyle = gradient;
        context.fill();
        context.clip();

        context.strokeStyle = "rgba(77, 52, 20, .25)";
        context.lineWidth = 1;
        for (const offset of [0.36, 0.7]) {
            context.beginPath();
            context.moveTo(start.x, start.y + depth * offset);
            context.lineTo(end.x, end.y + depth * offset);
            context.stroke();
        }
        for (let index = 0; index < 10; index++) {
            const along = ((index * 37 + seed * 13) % 91 + 5) / 100;
            const down = ((index * 29 + seed * 7) % 58 + 24) / 100;
            const x = start.x + (end.x - start.x) * along;
            const y = start.y + (end.y - start.y) * along + depth * down;
            context.fillStyle = index % 2 ? "rgba(67, 45, 19, .34)" : "rgba(191, 148, 70, .28)";
            context.beginPath();
            context.ellipse(x, y, 3 + index % 4, 1.8 + index % 2, -0.25, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
    }

    _drawPlant(x, y, tileWidth, tileHeight, plant) {
        const context = this.context;
        const definition = getPlantDefinition(plant.speciesId);
        const stage = getPlantStage(plant.speciesId, plant.pointsInvested, plant.growthProgress);
        const scale = gardenPlantScale(tileWidth, stage.progress);
        // Keep the planting point just below the cell center. SVGs include
        // padding below their shadow, so the configured shadow line—not the
        // image bounding box—is aligned to this subtle offset.
        const baseY = y + tileHeight * 0.18;
        context.save();
        context.translate(x, baseY);
        context.scale(scale, scale);
        context.lineCap = "round";
        if (stage.id === "seed") {
            context.fillStyle = "#6d4c35";
            context.beginPath();
            context.ellipse(0, -4, 5, 3, -0.35, 0, Math.PI * 2);
            context.fill();
            context.restore();
            return;
        }
        const treeImage = this._getTreeImage(definition.image);
        if (treeImage?.complete && treeImage.naturalWidth > 0) {
            const drawWidth = 90;
            const drawHeight = 105;
            const groundAnchor = Math.max(
                0.5,
                Math.min(1, Number(definition.groundAnchor) || 0.92),
            );
            context.drawImage(
                treeImage,
                -drawWidth / 2,
                -drawHeight * groundAnchor,
                drawWidth,
                drawHeight,
            );
            context.restore();
            return;
        }
        const stems = definition.id === "fern" ? 5 : definition.id === "flowering-tree" ? 1 : 3;
        context.strokeStyle = definition.palette[2];
        context.lineWidth = definition.id === "flowering-tree" ? 7 : 3;
        for (let index = 0; index < stems; index++) {
            const offset = (index - (stems - 1) / 2) * 7;
            context.beginPath();
            context.moveTo(0, 0);
            context.quadraticCurveTo(offset * 0.4, -22, offset, -42 - (index % 2) * 7);
            context.stroke();
            context.fillStyle = definition.palette[2];
            context.beginPath();
            context.ellipse(offset * 0.5 + 5, -22, 8, 3.5, -0.55, 0, Math.PI * 2);
            context.fill();
        }
        if (["flowering", "mature"].includes(stage.id)) {
            const blossomCount = definition.id === "flowering-tree" ? 9 : stage.id === "mature" ? 7 : 3;
            for (let index = 0; index < blossomCount; index++) {
                const angle = (index / blossomCount) * Math.PI * 2;
                const radius = definition.id === "flowering-tree" ? 20 : 12;
                const bx = Math.cos(angle) * radius;
                const by = -44 + Math.sin(angle) * radius * 0.55;
                this._drawBlossom(bx, by, definition.palette[0], definition.palette[1]);
            }
        }
        context.restore();
    }

    _plantBounds(x, y, tileWidth, tileHeight, plant) {
        const definition = getPlantDefinition(plant.speciesId);
        const stage = getPlantStage(plant.speciesId, plant.pointsInvested, plant.growthProgress);
        const scale = gardenPlantScale(tileWidth, stage.progress);
        const baseY = y + tileHeight * 0.18;
        if (stage.id === "seed") {
            return { left: x - 8, right: x + 8, top: baseY - 10, bottom: baseY + 3 };
        }
        if (definition.image) {
            const groundAnchor = Math.max(
                0.5,
                Math.min(1, Number(definition.groundAnchor) || 0.92),
            );
            return {
                left: x - 45 * scale,
                right: x + 45 * scale,
                top: baseY - 105 * groundAnchor * scale,
                bottom: baseY + 105 * (1 - groundAnchor) * scale,
            };
        }
        return {
            left: x - 30 * scale,
            right: x + 30 * scale,
            top: baseY - 62 * scale,
            bottom: baseY + 5,
        };
    }

    _getTreeImage(source) {
        if (!source || typeof Image !== "function") return null;
        if (this.imageCache.has(source)) return this.imageCache.get(source);
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
            this._cacheTreeMask(source, image);
            this.render(this.data);
        };
        image.onerror = () => console.warn("[GardenRenderer] Unable to load tree image", source);
        image.src = source;
        this.imageCache.set(source, image);
        return image;
    }

    _cacheTreeMask(source, image) {
        if (!source || this.imageMaskCache.has(source) || typeof document !== "object") return;
        try {
            const maskCanvas = document.createElement("canvas");
            maskCanvas.width = 90;
            maskCanvas.height = 105;
            const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
            maskContext.drawImage(image, 0, 0, maskCanvas.width, maskCanvas.height);
            this.imageMaskCache.set(source, {
                width: maskCanvas.width,
                height: maskCanvas.height,
                data: maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data,
            });
        } catch (error) {
            // A browser may prohibit reading image pixels; geometric bounds
            // remain a safe fallback in that case.
            this.imageMaskCache.set(source, null);
            console.debug("[GardenRenderer] Tree hit mask unavailable", error);
        }
    }

    _drawBlossom(x, y, petal, center) {
        const context = this.context;
        context.fillStyle = petal;
        for (let index = 0; index < 5; index++) {
            const angle = index * Math.PI * 0.4;
            context.beginPath();
            context.ellipse(x + Math.cos(angle) * 5, y + Math.sin(angle) * 5, 4.5, 3, angle, 0, Math.PI * 2);
            context.fill();
        }
        context.fillStyle = center;
        context.beginPath();
        context.arc(x, y, 3, 0, Math.PI * 2);
        context.fill();
    }

    _drawSelection(originX, originY, tileWidth, tileHeight) {
        const area = this.hitAreas[this.selectedIndex];
        if (!area) return;
        const screen = this._screen(area.cell.x, area.cell.y, originX, originY, tileWidth, tileHeight);
        this.context.fillStyle = "rgba(250, 204, 21, .2)";
        this.context.strokeStyle = "#d97706";
        this.context.lineWidth = 2.5;
        this.context.beginPath();
        this.context.moveTo(screen.x, screen.y - tileHeight / 2);
        this.context.lineTo(screen.x + tileWidth / 2, screen.y);
        this.context.lineTo(screen.x, screen.y + tileHeight / 2);
        this.context.lineTo(screen.x - tileWidth / 2, screen.y);
        this.context.closePath();
        this.context.fill();
        this.context.stroke();
    }

    _handlePointer(event, select) {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = (event.clientX - rect.left) * this.renderSize.width / rect.width;
        const y = (event.clientY - rect.top) * this.renderSize.height / rect.height;
        const area = findGardenHitArea(this.hitAreas, x, y);
        const index = area ? this.hitAreas.indexOf(area) : -1;
        this.canvas.style.cursor = area?.plant ? "pointer" : "default";
        if (index < 0) {
            if (this.selectedIndex !== -1) {
                this.selectedIndex = -1;
                this.canvas.removeAttribute("title");
                this.render(this.data);
            }
            return;
        }
        this.selectedIndex = index;
        this.canvas.title = this._label(area);
        if (select) this.onSelect?.(area);
        this.render(this.data);
    }

    _clearHover() {
        this.canvas.style.cursor = "default";
        this.canvas.removeAttribute("title");
        if (this.selectedIndex === -1) return;
        this.selectedIndex = -1;
        this.render(this.data);
    }

    _handleKey(event) {
        const columns = this.data?.plot?.columns || 1;
        const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
        if (delta) {
            event.preventDefault();
            const currentIndex = this.selectedIndex < 0 ? 0 : this.selectedIndex;
            this.selectedIndex = Math.max(0, Math.min(this.hitAreas.length - 1, currentIndex + delta));
            this.canvas.setAttribute("aria-label", this._label(this.hitAreas[this.selectedIndex]));
            this.render(this.data);
        } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const area = this.hitAreas[this.selectedIndex];
            if (area) this.onSelect?.(area);
        }
    }

    _label(area) {
        if (!area?.plant) return `Espaço vazio no jardim, coluna ${area.cell.x + 1}, linha ${area.cell.y + 1}`;
        const definition = getPlantDefinition(area.plant.speciesId);
        const stage = getPlantStage(
            area.plant.speciesId,
            area.plant.pointsInvested,
            area.plant.growthProgress,
        );
        return `${definition.name}, ${stage.label}, column ${area.cell.x + 1}, row ${area.cell.y + 1}`;
    }
}
