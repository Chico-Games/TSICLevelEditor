/**
 * Drawing Tools
 * Implements various painting and editing tools
 */

class Tool {
    constructor(name) {
        this.name = name;
    }

    onMouseDown(editor, x, y) {}
    onMouseMove(editor, x, y) {}
    onMouseUp(editor, x, y) {}
    getPreview(editor, x, y) { return []; }
}

class PencilTool extends Tool {
    constructor() {
        super('pencil');
        this.isDrawing = false;
        this.lastX = -1;
        this.lastY = -1;
    }

    onMouseDown(editor, x, y) {
        this.isDrawing = true;
        this.lastX = x;
        this.lastY = y;
        this.draw(editor, x, y);
    }

    onMouseMove(editor, x, y) {
        if (this.isDrawing) {
            // Draw line from last position to current
            this.drawLine(editor, this.lastX, this.lastY, x, y);
            this.lastX = x;
            this.lastY = y;
        }
    }

    onMouseUp(editor, x, y) {
        this.isDrawing = false;
    }

    draw(editor, x, y) {
        const size = editor.brushSize;
        const offset = Math.floor(size / 2);
        const layer = editor.layerManager.getActiveLayer();

        if (!layer || layer.locked) return;

        const tilesToSet = [];

        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                const tx = x - offset + dx;
                const ty = y - offset + dy;
                tilesToSet.push({ x: tx, y: ty });
            }
        }

        editor.setTiles(tilesToSet);
    }

    drawLine(editor, x0, y0, x1, y1) {
        // Bresenham's line algorithm
        const points = this.getLinePoints(x0, y0, x1, y1);
        for (const point of points) {
            this.draw(editor, point.x, point.y);
        }
    }

    getLinePoints(x0, y0, x1, y1) {
        const points = [];
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        let x = x0;
        let y = y0;

        while (true) {
            points.push({ x, y });

            if (x === x1 && y === y1) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
        }

        return points;
    }

    getPreview(editor, x, y) {
        const size = editor.brushSize;
        const offset = Math.floor(size / 2);
        const preview = [];

        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                const tx = x - offset + dx;
                const ty = y - offset + dy;
                if (tx >= 0 && tx < editor.layerManager.width &&
                    ty >= 0 && ty < editor.layerManager.height) {
                    preview.push({ x: tx, y: ty });
                }
            }
        }

        return preview;
    }
}

class BucketTool extends Tool {
    constructor() {
        super('bucket');
    }

    onMouseDown(editor, x, y) {
        this.floodFill(editor, x, y);
    }

    floodFill(editor, startX, startY) {
        const layer = editor.layerManager.getActiveLayer();
        if (!layer || layer.locked) return;

        const targetTile = layer.getTile(startX, startY);
        const targetColor = targetTile ? targetTile.color : null;
        const fillColor = editor.selectedTileset ? editor.selectedTileset.color : null;

        // Don't fill if same color
        if (targetColor === fillColor) return;

        const stack = [{ x: startX, y: startY }];
        const visited = new Set();
        const tilesToSet = [];

        while (stack.length > 0) {
            const { x, y } = stack.pop();
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= layer.width || y < 0 || y >= layer.height) continue;

            const currentTile = layer.getTile(x, y);
            const currentColor = currentTile ? currentTile.color : null;

            if (currentColor !== targetColor) continue;

            visited.add(key);
            tilesToSet.push({ x, y });

            // Add neighbors
            stack.push({ x: x + 1, y });
            stack.push({ x: x - 1, y });
            stack.push({ x, y: y + 1 });
            stack.push({ x, y: y - 1 });
        }

        editor.setTiles(tilesToSet);
    }
}

class LineTool extends Tool {
    constructor() {
        super('line');
        this.startX = -1;
        this.startY = -1;
        this.isDrawing = false;
    }

    onMouseDown(editor, x, y) {
        this.startX = x;
        this.startY = y;
        this.isDrawing = true;
    }

    onMouseUp(editor, x, y) {
        if (this.isDrawing) {
            this.drawLine(editor, this.startX, this.startY, x, y);
            this.isDrawing = false;
        }
    }

    drawLine(editor, x0, y0, x1, y1) {
        const layer = editor.layerManager.getActiveLayer();
        if (!layer || layer.locked) return;

        const points = this.getLinePoints(x0, y0, x1, y1);
        const tilesToSet = [];

        const size = editor.brushSize;
        const offset = Math.floor(size / 2);

        for (const point of points) {
            for (let dy = 0; dy < size; dy++) {
                for (let dx = 0; dx < size; dx++) {
                    const tx = point.x - offset + dx;
                    const ty = point.y - offset + dy;
                    tilesToSet.push({ x: tx, y: ty });
                }
            }
        }

        editor.setTiles(tilesToSet);
    }

    getLinePoints(x0, y0, x1, y1) {
        const points = [];
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        let x = x0;
        let y = y0;

        while (true) {
            points.push({ x, y });

            if (x === x1 && y === y1) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
        }

        return points;
    }

    getPreview(editor, x, y) {
        if (!this.isDrawing) {
            return [];
        }

        const points = this.getLinePoints(this.startX, this.startY, x, y);
        const preview = [];

        const size = editor.brushSize;
        const offset = Math.floor(size / 2);

        for (const point of points) {
            for (let dy = 0; dy < size; dy++) {
                for (let dx = 0; dx < size; dx++) {
                    const tx = point.x - offset + dx;
                    const ty = point.y - offset + dy;
                    if (tx >= 0 && tx < editor.layerManager.width &&
                        ty >= 0 && ty < editor.layerManager.height) {
                        preview.push({ x: tx, y: ty });
                    }
                }
            }
        }

        return preview;
    }
}

class RectangleTool extends Tool {
    constructor() {
        super('rectangle');
        this.startX = -1;
        this.startY = -1;
        this.isDrawing = false;
    }

    onMouseDown(editor, x, y) {
        this.startX = x;
        this.startY = y;
        this.isDrawing = true;
    }

    onMouseUp(editor, x, y) {
        if (this.isDrawing) {
            this.drawRectangle(editor, this.startX, this.startY, x, y);
            this.isDrawing = false;
        }
    }

    drawRectangle(editor, x0, y0, x1, y1) {
        const layer = editor.layerManager.getActiveLayer();
        if (!layer || layer.locked) return;

        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1);
        const maxY = Math.max(y0, y1);

        const tilesToSet = [];

        if (editor.fillMode === 'filled') {
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    tilesToSet.push({ x, y });
                }
            }
        } else {
            // Outline only
            for (let x = minX; x <= maxX; x++) {
                tilesToSet.push({ x, y: minY });
                tilesToSet.push({ x, y: maxY });
            }
            for (let y = minY + 1; y < maxY; y++) {
                tilesToSet.push({ x: minX, y });
                tilesToSet.push({ x: maxX, y });
            }
        }

        editor.setTiles(tilesToSet);
    }

    getPreview(editor, x, y) {
        if (!this.isDrawing) {
            return [];
        }

        const minX = Math.min(this.startX, x);
        const maxX = Math.max(this.startX, x);
        const minY = Math.min(this.startY, y);
        const maxY = Math.max(this.startY, y);

        const preview = [];

        if (editor.fillMode === 'filled') {
            for (let py = minY; py <= maxY; py++) {
                for (let px = minX; px <= maxX; px++) {
                    if (px >= 0 && px < editor.layerManager.width &&
                        py >= 0 && py < editor.layerManager.height) {
                        preview.push({ x: px, y: py });
                    }
                }
            }
        } else {
            for (let px = minX; px <= maxX; px++) {
                if (px >= 0 && px < editor.layerManager.width) {
                    if (minY >= 0 && minY < editor.layerManager.height) {
                        preview.push({ x: px, y: minY });
                    }
                    if (maxY >= 0 && maxY < editor.layerManager.height) {
                        preview.push({ x: px, y: maxY });
                    }
                }
            }
            for (let py = minY + 1; py < maxY; py++) {
                if (py >= 0 && py < editor.layerManager.height) {
                    if (minX >= 0 && minX < editor.layerManager.width) {
                        preview.push({ x: minX, y: py });
                    }
                    if (maxX >= 0 && maxX < editor.layerManager.width) {
                        preview.push({ x: maxX, y: py });
                    }
                }
            }
        }

        return preview;
    }
}

class EyedropperTool extends Tool {
    constructor() {
        super('eyedropper');
    }

    onMouseDown(editor, x, y) {
        const layer = editor.layerManager.getActiveLayer();
        if (!layer) return;

        const tile = layer.getTile(x, y);
        if (tile) {
            editor.selectTileset(tile.name);
        }
    }
}

class EraserTool extends Tool {
    constructor() {
        super('eraser');
        this.isErasing = false;
        this.lastX = -1;
        this.lastY = -1;
    }

    onMouseDown(editor, x, y) {
        this.isErasing = true;
        this.lastX = x;
        this.lastY = y;
        this.erase(editor, x, y);
    }

    onMouseMove(editor, x, y) {
        if (this.isErasing) {
            this.eraseLine(editor, this.lastX, this.lastY, x, y);
            this.lastX = x;
            this.lastY = y;
        }
    }

    onMouseUp(editor, x, y) {
        this.isErasing = false;
    }

    erase(editor, x, y) {
        const size = editor.brushSize;
        const offset = Math.floor(size / 2);
        const layer = editor.layerManager.getActiveLayer();

        if (!layer || layer.locked) return;

        const tilesToClear = [];

        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                const tx = x - offset + dx;
                const ty = y - offset + dy;
                tilesToClear.push({ x: tx, y: ty });
            }
        }

        editor.clearTiles(tilesToClear);
    }

    eraseLine(editor, x0, y0, x1, y1) {
        const points = this.getLinePoints(x0, y0, x1, y1);
        for (const point of points) {
            this.erase(editor, point.x, point.y);
        }
    }

    getLinePoints(x0, y0, x1, y1) {
        const points = [];
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        let x = x0;
        let y = y0;

        while (true) {
            points.push({ x, y });

            if (x === x1 && y === y1) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
        }

        return points;
    }

    getPreview(editor, x, y) {
        const size = editor.brushSize;
        const offset = Math.floor(size / 2);
        const preview = [];

        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                const tx = x - offset + dx;
                const ty = y - offset + dy;
                if (tx >= 0 && tx < editor.layerManager.width &&
                    ty >= 0 && ty < editor.layerManager.height) {
                    preview.push({ x: tx, y: ty });
                }
            }
        }

        return preview;
    }
}

// Tool registry
const tools = {
    pencil: new PencilTool(),
    bucket: new BucketTool(),
    line: new LineTool(),
    rectangle: new RectangleTool(),
    eyedropper: new EyedropperTool(),
    eraser: new EraserTool()
};
