/**
 * Drawing Tools
 * Implements various painting and editing tools
 */

/**
 * Clipboard History Manager
 * Stores up to 10 clipboard entries that can be reused
 */
class ClipboardHistory {
    constructor(maxEntries = 10) {
        this.maxEntries = maxEntries;
        this.entries = [];
        this.activeIndex = -1;
    }

    /**
     * Add a new entry to the clipboard history
     */
    addEntry(data, source = 'unknown') {
        const entry = {
            id: Date.now(),
            timestamp: new Date(),
            data: data,
            source: source, // 'selection' or 'wand'
            tileCount: data.tiles ? data.tiles.length : 0,
            size: `${data.width}×${data.height}`
        };

        // Add to beginning of array
        this.entries.unshift(entry);

        // Remove oldest if exceeds max
        if (this.entries.length > this.maxEntries) {
            this.entries.pop();
        }

        this.activeIndex = 0;
        this.updateUI();

        return entry;
    }

    /**
     * Get entry at index
     */
    getEntry(index) {
        return this.entries[index] || null;
    }

    /**
     * Get active entry
     */
    getActive() {
        if (this.activeIndex >= 0 && this.activeIndex < this.entries.length) {
            return this.entries[this.activeIndex];
        }
        return null;
    }

    /**
     * Set active entry by index
     */
    setActive(index) {
        if (index >= 0 && index < this.entries.length) {
            this.activeIndex = index;
            this.updateUI();
            return this.entries[index];
        }
        return null;
    }

    /**
     * Delete entry at index
     */
    deleteEntry(index) {
        if (index >= 0 && index < this.entries.length) {
            this.entries.splice(index, 1);
            if (this.activeIndex >= this.entries.length) {
                this.activeIndex = this.entries.length - 1;
            }
            this.updateUI();
        }
    }

    /**
     * Clear all entries
     */
    clear() {
        this.entries = [];
        this.activeIndex = -1;
        this.updateUI();
    }

    /**
     * Update the copy history UI panel
     */
    updateUI() {
        const container = document.getElementById('copy-history');
        if (!container) return;

        container.innerHTML = '';

        if (this.entries.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'copy-history-empty';
            emptyDiv.textContent = 'No copies yet';
            container.appendChild(emptyDiv);
            return;
        }

        this.entries.forEach((entry, index) => {
            const item = document.createElement('div');
            item.className = 'copy-history-item';
            if (index === this.activeIndex) {
                item.classList.add('active');
            }

            const info = document.createElement('div');
            info.className = 'copy-history-info';

            const label = document.createElement('div');
            label.className = 'copy-history-label';
            label.textContent = `Copy ${this.entries.length - index}`;

            const details = document.createElement('div');
            details.className = 'copy-history-details';
            details.textContent = `${entry.tileCount} tiles (${entry.size})`;

            info.appendChild(label);
            info.appendChild(details);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'copy-history-delete';
            deleteBtn.textContent = '×';
            deleteBtn.title = 'Delete this copy';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteEntry(index);
            });

            item.appendChild(info);
            item.appendChild(deleteBtn);

            item.addEventListener('click', () => {
                this.setActive(index);
            });

            container.appendChild(item);
        });
    }
}

// Global clipboard history
const clipboardHistory = new ClipboardHistory(10);

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
        const layer = editor.layerManager.getActiveLayer();
        if (!layer || layer.locked) return;

        const tilesToSet = editor.getBrushTiles(x, y);
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
        const tiles = editor.getBrushTiles(x, y);
        const preview = [];

        for (const tile of tiles) {
            if (tile.x >= 0 && tile.x < editor.layerManager.width &&
                tile.y >= 0 && tile.y < editor.layerManager.height) {
                preview.push({ x: tile.x, y: tile.y });
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

        // Check if no color is selected
        if (!editor.selectedTileset) {
            document.getElementById('status-message').textContent = 'Please select a color first';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 2000);
            return;
        }

        // Check if layer is locked
        if (!layer || layer.locked) {
            document.getElementById('status-message').textContent = 'Layer is locked or not available';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 2000);
            return;
        }

        const targetData = layer.getTile(startX, startY);
        const targetColor = targetData && targetData.tileset ? targetData.tileset.color : null;
        const fillColor = editor.selectedTileset.color;

        // Don't fill if same color
        if (targetColor === fillColor) {
            document.getElementById('status-message').textContent = 'Already same color';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
            return;
        }

        const stack = [{ x: startX, y: startY }];
        const visited = new Set();
        const tilesToSet = [];

        while (stack.length > 0) {
            const { x, y } = stack.pop();
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= layer.width || y < 0 || y >= layer.height) continue;

            const currentData = layer.getTile(x, y);
            const currentColor = currentData && currentData.tileset ? currentData.tileset.color : null;

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

        for (const point of points) {
            const brushTiles = editor.getBrushTiles(point.x, point.y);
            tilesToSet.push(...brushTiles);
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

        for (const point of points) {
            const brushTiles = editor.getBrushTiles(point.x, point.y);
            for (const tile of brushTiles) {
                if (tile.x >= 0 && tile.x < editor.layerManager.width &&
                    tile.y >= 0 && tile.y < editor.layerManager.height) {
                    preview.push({ x: tile.x, y: tile.y });
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
        if (!layer) {
            document.getElementById('status-message').textContent = 'No active layer';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
            return;
        }

        const data = layer.getTile(x, y);
        if (data && data.tileset) {
            editor.selectTileset(data.tileset.name);
            document.getElementById('status-message').textContent = `Picked ${data.tileset.name}`;
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
        } else {
            document.getElementById('status-message').textContent = 'No tile at this position';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
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
        const layer = editor.layerManager.getActiveLayer();
        if (!layer || layer.locked) return;

        const tilesToClear = editor.getBrushTiles(x, y);
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
        const tiles = editor.getBrushTiles(x, y);
        const preview = [];

        for (const tile of tiles) {
            if (tile.x >= 0 && tile.x < editor.layerManager.width &&
                tile.y >= 0 && tile.y < editor.layerManager.height) {
                preview.push({ x: tile.x, y: tile.y });
            }
        }

        return preview;
    }
}

class PanTool extends Tool {
    constructor() {
        super('pan');
        this.isPanning = false;
        this.startX = 0;
        this.startY = 0;
        this.initialOffsetX = 0;
        this.initialOffsetY = 0;
    }

    onMouseDown(editor, x, y, mouseEvent) {
        this.isPanning = true;
        this.startX = mouseEvent.clientX;
        this.startY = mouseEvent.clientY;
        this.initialOffsetX = editor.offsetX;
        this.initialOffsetY = editor.offsetY;
        editor.gridCanvas.parentElement.style.cursor = 'grabbing';
    }

    onMouseMove(editor, x, y, mouseEvent) {
        if (this.isPanning) {
            const deltaX = mouseEvent.clientX - this.startX;
            const deltaY = mouseEvent.clientY - this.startY;
            editor.offsetX = this.initialOffsetX + deltaX;
            editor.offsetY = this.initialOffsetY + deltaY;
            editor.requestRender();
        }
    }

    onMouseUp(editor, x, y) {
        this.isPanning = false;
        editor.gridCanvas.parentElement.style.cursor = 'grab';
    }
}

class SelectionTool extends Tool {
    constructor() {
        super('selection');
        this.mode = 'idle'; // 'idle', 'drawing', 'moving', 'floating'
        this.startX = -1;
        this.startY = -1;
        this.endX = -1;
        this.endY = -1;
        this.selectionData = null; // Stores floating tile data
        this.originalData = null; // Backup of original location for undo
        this.moveOffsetX = 0;
        this.moveOffsetY = 0;
        this.isFloating = false; // True when selection has been lifted from canvas
        this.savedState = false; // Track if we've saved state for this operation
    }

    onMouseDown(editor, x, y) {
        // Check if clicking inside existing selection
        if (this.hasSelection() && this.isInsideSelection(x, y)) {
            // Start moving the selection
            this.mode = 'moving';
            this.moveOffsetX = x - Math.min(this.startX, this.endX);
            this.moveOffsetY = y - Math.min(this.startY, this.endY);

            // If this is the first time moving, "lift" the selection from the canvas
            if (!this.isFloating) {
                this.liftSelection(editor);
            }
        } else {
            // Finalize any existing floating selection before starting new one
            if (this.isFloating) {
                this.finalizeSelection(editor);
            }

            // Start new selection
            this.mode = 'drawing';
            this.startX = x;
            this.startY = y;
            this.endX = x;
            this.endY = y;
            this.selectionData = null;
            this.isFloating = false;
            this.savedState = false;
        }
    }

    onMouseMove(editor, x, y) {
        if (this.mode === 'drawing') {
            // Drawing selection box
            this.endX = x;
            this.endY = y;
        } else if (this.mode === 'moving' && this.isFloating) {
            // Update selection bounds while moving floating selection
            const width = Math.abs(this.endX - this.startX);
            const height = Math.abs(this.endY - this.startY);
            this.startX = x - this.moveOffsetX;
            this.startY = y - this.moveOffsetY;
            this.endX = this.startX + width;
            this.endY = this.startY + height;

            // Re-render to show the floating selection at new position
            editor.requestRender();
        }
    }

    onMouseUp(editor, x, y) {
        if (this.mode === 'drawing') {
            // Finished drawing selection box
            this.mode = 'idle';
        } else if (this.mode === 'moving') {
            // Finished moving, but keep floating
            this.mode = 'idle';
        }
    }

    /**
     * "Lift" the selection from the canvas - saves it to memory and clears from canvas
     */
    liftSelection(editor) {
        if (!this.hasSelection() || this.isFloating) return;

        const layer = editor.layerManager.getActiveLayer();
        if (!layer || layer.locked) return;

        // Save state for undo
        if (!this.savedState) {
            editor.saveState();
            this.savedState = true;
        }

        const minX = Math.min(this.startX, this.endX);
        const maxX = Math.max(this.startX, this.endX);
        const minY = Math.min(this.startY, this.endY);
        const maxY = Math.max(this.startY, this.endY);

        // Copy tiles to selection data
        this.selectionData = {
            width: maxX - minX + 1,
            height: maxY - minY + 1,
            tiles: []
        };

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const data = layer.getTile(x, y);
                if (data && data.tileset) {
                    this.selectionData.tiles.push({
                        x: x - minX,
                        y: y - minY,
                        tileset: { ...data.tileset }
                    });
                }
            }
        }

        // Clear from canvas
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                layer.clearTile(x, y);
            }
        }

        this.isFloating = true;
        editor.requestRender();
        editor.requestMinimapRender();
    }

    /**
     * Finalize the floating selection - commits it to the canvas
     */
    finalizeSelection(editor) {
        if (!this.isFloating || !this.selectionData) return;

        const layer = editor.layerManager.getActiveLayer();
        if (!layer || layer.locked) return;

        const minX = Math.min(this.startX, this.endX);
        const minY = Math.min(this.startY, this.endY);

        // Paste tiles at current position
        for (const tile of this.selectionData.tiles) {
            const tx = minX + tile.x;
            const ty = minY + tile.y;
            if (tx >= 0 && tx < layer.width && ty >= 0 && ty < layer.height) {
                layer.setTile(tx, ty, tile.tileset.value || 0, tile.tileset);
            }
        }

        // Clear floating state
        this.isFloating = false;
        this.selectionData = null;
        this.savedState = false;

        editor.requestRender();
        editor.requestMinimapRender();
        editor.isDirty = true;
    }

    hasSelection() {
        return this.startX !== -1 && this.startY !== -1 && this.endX !== -1 && this.endY !== -1;
    }

    isInsideSelection(x, y) {
        if (!this.hasSelection()) return false;
        const minX = Math.min(this.startX, this.endX);
        const maxX = Math.max(this.startX, this.endX);
        const minY = Math.min(this.startY, this.endY);
        const maxY = Math.max(this.startY, this.endY);
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }

    /**
     * Copy selection to clipboard (doesn't lift it from canvas)
     */
    copySelection(editor) {
        if (!this.hasSelection()) return;

        const layer = editor.layerManager.getActiveLayer();
        if (!layer) return;

        const minX = Math.min(this.startX, this.endX);
        const maxX = Math.max(this.startX, this.endX);
        const minY = Math.min(this.startY, this.endY);
        const maxY = Math.max(this.startY, this.endY);

        const copiedData = {
            width: maxX - minX + 1,
            height: maxY - minY + 1,
            tiles: []
        };

        // Copy tiles from selection
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const data = layer.getTile(x, y);
                if (data && data.tileset) {
                    copiedData.tiles.push({
                        x: x - minX,
                        y: y - minY,
                        tileset: { ...data.tileset }
                    });
                }
            }
        }

        // Store in clipboard history
        clipboardHistory.addEntry(copiedData, 'selection');

        // Also keep local reference for backward compatibility
        this.clipboardData = copiedData;

        document.getElementById('status-message').textContent = `Copied ${copiedData.tiles.length} tiles to history`;
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 1500);
    }

    /**
     * Paste from clipboard - creates a new floating selection
     */
    pasteSelection(editor) {
        // Get active clipboard entry from history
        const activeEntry = clipboardHistory.getActive();
        const clipboardData = activeEntry ? activeEntry.data : this.clipboardData;

        if (!clipboardData) return;

        // Finalize any existing selection
        if (this.isFloating) {
            this.finalizeSelection(editor);
        }

        // Create new floating selection from clipboard
        this.selectionData = {
            width: clipboardData.width,
            height: clipboardData.height,
            tiles: clipboardData.tiles.map(t => ({...t, tileset: {...t.tileset}}))
        };

        // Position at center of viewport or at current selection
        if (this.hasSelection()) {
            // Keep current selection position
        } else {
            // TODO: Calculate center of viewport
            this.startX = 10;
            this.startY = 10;
            this.endX = this.startX + this.selectionData.width - 1;
            this.endY = this.startY + this.selectionData.height - 1;
        }

        this.isFloating = true;
        this.mode = 'idle';
        this.savedState = false;

        editor.requestRender();

        document.getElementById('status-message').textContent = `Pasted ${this.selectionData.tiles.length} tiles (move to position)`;
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 1500);
    }

    /**
     * Clear selection and floating state
     */
    clearSelection(editor) {
        // Finalize if floating
        if (this.isFloating && editor) {
            this.finalizeSelection(editor);
        }

        this.startX = -1;
        this.startY = -1;
        this.endX = -1;
        this.endY = -1;
        this.selectionData = null;
        this.isFloating = false;
        this.savedState = false;
    }

    getPreview(editor, x, y) {
        if (!this.hasSelection()) return [];

        const minX = Math.min(this.startX, this.endX);
        const maxX = Math.max(this.startX, this.endX);
        const minY = Math.min(this.startY, this.endY);
        const maxY = Math.max(this.startY, this.endY);

        const preview = [];

        // If floating, show the selection contents
        if (this.isFloating && this.selectionData) {
            for (const tile of this.selectionData.tiles) {
                const tx = minX + tile.x;
                const ty = minY + tile.y;
                if (tx >= 0 && tx < editor.layerManager.width &&
                    ty >= 0 && ty < editor.layerManager.height) {
                    preview.push({ x: tx, y: ty, tileset: tile.tileset });
                }
            }
        }

        // Always draw selection outline
        for (let px = minX; px <= maxX; px++) {
            if (px >= 0 && px < editor.layerManager.width) {
                if (minY >= 0 && minY < editor.layerManager.height) {
                    preview.push({ x: px, y: minY, outline: true });
                }
                if (maxY >= 0 && maxY < editor.layerManager.height) {
                    preview.push({ x: px, y: maxY, outline: true });
                }
            }
        }
        for (let py = minY + 1; py < maxY; py++) {
            if (py >= 0 && py < editor.layerManager.height) {
                if (minX >= 0 && minX < editor.layerManager.width) {
                    preview.push({ x: minX, y: py, outline: true });
                }
                if (maxX >= 0 && maxX < editor.layerManager.width) {
                    preview.push({ x: maxX, y: py, outline: true });
                }
            }
        }

        return preview;
    }
}

class WandTool extends Tool {
    constructor() {
        super('wand');
        this.mode = 'idle'; // 'idle', 'moving', 'floating'
        this.selectedTiles = []; // Array of {x, y} coordinates
        this.selectionData = null; // Stores floating tile data
        this.moveOffsetX = 0;
        this.moveOffsetY = 0;
        this.isFloating = false;
        this.savedState = false;
        this.clipboardData = null;
    }

    onMouseDown(editor, x, y) {
        // Check if clicking inside existing selection
        if (this.hasSelection() && this.isInsideSelection(x, y)) {
            // Start moving the selection
            this.mode = 'moving';
            const bounds = this.getSelectionBounds();
            this.moveOffsetX = x - bounds.minX;
            this.moveOffsetY = y - bounds.minY;

            // If this is the first time moving, "lift" the selection from the canvas
            if (!this.isFloating) {
                this.liftSelection(editor);
            }
        } else {
            // Finalize any existing floating selection before starting new one
            if (this.isFloating) {
                this.finalizeSelection(editor);
            }

            // Start new flood fill selection
            this.floodFillSelect(editor, x, y);
        }
    }

    onMouseMove(editor, x, y) {
        if (this.mode === 'moving' && this.isFloating) {
            // Update tile positions while moving
            const bounds = this.getSelectionBounds();
            const deltaX = x - this.moveOffsetX - bounds.minX;
            const deltaY = y - this.moveOffsetY - bounds.minY;

            // Move all selected tiles
            this.selectedTiles = this.selectedTiles.map(tile => ({
                x: tile.x + deltaX,
                y: tile.y + deltaY
            }));

            editor.requestRender();
        }
    }

    onMouseUp(editor, x, y) {
        if (this.mode === 'moving') {
            this.mode = 'idle';
        }
    }

    floodFillSelect(editor, startX, startY) {
        const layer = editor.layerManager.getActiveLayer();
        if (!layer) {
            document.getElementById('status-message').textContent = 'No active layer';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
            return;
        }

        const targetData = layer.getTile(startX, startY);
        const targetColor = targetData && targetData.tileset ? targetData.tileset.color : null;

        if (!targetColor) {
            document.getElementById('status-message').textContent = 'No tiles to select';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
            return;
        }

        // Check if diagonal mode is enabled
        const diagonalCheckbox = document.getElementById('wand-diagonal');
        const includeDiagonals = diagonalCheckbox ? diagonalCheckbox.checked : false;

        const stack = [{ x: startX, y: startY }];
        const visited = new Set();
        this.selectedTiles = [];

        while (stack.length > 0) {
            const { x, y } = stack.pop();
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= layer.width || y < 0 || y >= layer.height) continue;

            const currentData = layer.getTile(x, y);
            const currentColor = currentData && currentData.tileset ? currentData.tileset.color : null;

            if (currentColor !== targetColor) continue;

            visited.add(key);
            this.selectedTiles.push({ x, y });

            // Add cardinal neighbors
            stack.push({ x: x + 1, y });
            stack.push({ x: x - 1, y });
            stack.push({ x, y: y + 1 });
            stack.push({ x, y: y - 1 });

            // Add diagonal neighbors if enabled
            if (includeDiagonals) {
                stack.push({ x: x + 1, y: y + 1 });
                stack.push({ x: x + 1, y: y - 1 });
                stack.push({ x: x - 1, y: y + 1 });
                stack.push({ x: x - 1, y: y - 1 });
            }
        }

        this.isFloating = false;
        this.savedState = false;
        editor.requestRender();

        document.getElementById('status-message').textContent = `Selected ${this.selectedTiles.length} tiles`;
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 1500);
    }

    liftSelection(editor) {
        if (!this.hasSelection() || this.isFloating) return;

        const layer = editor.layerManager.getActiveLayer();
        if (!layer || layer.locked) return;

        if (!this.savedState) {
            editor.saveState();
            this.savedState = true;
        }

        const bounds = this.getSelectionBounds();
        this.selectionData = {
            width: bounds.maxX - bounds.minX + 1,
            height: bounds.maxY - bounds.minY + 1,
            tiles: []
        };

        for (const tile of this.selectedTiles) {
            const data = layer.getTile(tile.x, tile.y);
            if (data && data.tileset) {
                this.selectionData.tiles.push({
                    x: tile.x - bounds.minX,
                    y: tile.y - bounds.minY,
                    tileset: { ...data.tileset }
                });
            }
        }

        // Clear from canvas
        for (const tile of this.selectedTiles) {
            layer.clearTile(tile.x, tile.y);
        }

        this.isFloating = true;
        editor.requestRender();
        editor.requestMinimapRender();
    }

    finalizeSelection(editor) {
        if (!this.isFloating || !this.selectionData) return;

        const layer = editor.layerManager.getActiveLayer();
        if (!layer || layer.locked) return;

        const bounds = this.getSelectionBounds();

        for (const tile of this.selectionData.tiles) {
            const tx = bounds.minX + tile.x;
            const ty = bounds.minY + tile.y;
            if (tx >= 0 && tx < layer.width && ty >= 0 && ty < layer.height) {
                layer.setTile(tx, ty, tile.tileset.value || 0, tile.tileset);
            }
        }

        this.isFloating = false;
        this.selectionData = null;
        this.savedState = false;

        editor.requestRender();
        editor.requestMinimapRender();
        editor.isDirty = true;
    }

    hasSelection() {
        return this.selectedTiles.length > 0;
    }

    getSelectionBounds() {
        if (this.selectedTiles.length === 0) {
            return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
        }

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const tile of this.selectedTiles) {
            minX = Math.min(minX, tile.x);
            maxX = Math.max(maxX, tile.x);
            minY = Math.min(minY, tile.y);
            maxY = Math.max(maxY, tile.y);
        }

        return { minX, maxX, minY, maxY };
    }

    isInsideSelection(x, y) {
        return this.selectedTiles.some(tile => tile.x === x && tile.y === y);
    }

    copySelection(editor) {
        if (!this.hasSelection()) return;

        const layer = editor.layerManager.getActiveLayer();
        if (!layer) return;

        const bounds = this.getSelectionBounds();
        const copiedData = {
            width: bounds.maxX - bounds.minX + 1,
            height: bounds.maxY - bounds.minY + 1,
            tiles: []
        };

        for (const tile of this.selectedTiles) {
            const data = layer.getTile(tile.x, tile.y);
            if (data && data.tileset) {
                copiedData.tiles.push({
                    x: tile.x - bounds.minX,
                    y: tile.y - bounds.minY,
                    tileset: { ...data.tileset }
                });
            }
        }

        // Store in clipboard history
        clipboardHistory.addEntry(copiedData, 'wand');

        // Also keep local reference for backward compatibility
        this.clipboardData = copiedData;

        document.getElementById('status-message').textContent = `Copied ${copiedData.tiles.length} tiles to history`;
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 1500);
    }

    pasteSelection(editor) {
        // Get active clipboard entry from history
        const activeEntry = clipboardHistory.getActive();
        const clipboardData = activeEntry ? activeEntry.data : this.clipboardData;

        if (!clipboardData) return;

        if (this.isFloating) {
            this.finalizeSelection(editor);
        }

        this.selectionData = {
            width: clipboardData.width,
            height: clipboardData.height,
            tiles: clipboardData.tiles.map(t => ({...t, tileset: {...t.tileset}}))
        };

        // Create selection tiles at position (10, 10)
        this.selectedTiles = [];
        const baseX = 10;
        const baseY = 10;
        for (const tile of this.selectionData.tiles) {
            this.selectedTiles.push({ x: baseX + tile.x, y: baseY + tile.y });
        }

        this.isFloating = true;
        this.mode = 'idle';
        this.savedState = false;

        editor.requestRender();

        document.getElementById('status-message').textContent = `Pasted ${this.selectionData.tiles.length} tiles (move to position)`;
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 1500);
    }

    clearSelection(editor) {
        if (this.isFloating && editor) {
            this.finalizeSelection(editor);
        }

        this.selectedTiles = [];
        this.selectionData = null;
        this.isFloating = false;
        this.savedState = false;
    }

    getPreview(editor, x, y) {
        if (!this.hasSelection()) return [];

        const preview = [];

        // If floating, show the selection contents
        if (this.isFloating && this.selectionData) {
            const bounds = this.getSelectionBounds();
            for (const tile of this.selectionData.tiles) {
                const tx = bounds.minX + tile.x;
                const ty = bounds.minY + tile.y;
                if (tx >= 0 && tx < editor.layerManager.width &&
                    ty >= 0 && ty < editor.layerManager.height) {
                    preview.push({ x: tx, y: ty, tileset: tile.tileset });
                }
            }
        }

        // Draw selection outline around selected tiles
        for (const tile of this.selectedTiles) {
            if (tile.x >= 0 && tile.x < editor.layerManager.width &&
                tile.y >= 0 && tile.y < editor.layerManager.height) {
                preview.push({ x: tile.x, y: tile.y, outline: true });
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
    eraser: new EraserTool(),
    pan: new PanTool(),
    selection: new SelectionTool(),
    wand: new WandTool()
};

// Export classes and variables to window for testing
if (typeof window !== 'undefined') {
    window.ClipboardHistory = ClipboardHistory;
    window.clipboardHistory = clipboardHistory;
    window.Tool = Tool;
    window.PencilTool = PencilTool;
    window.BucketTool = BucketTool;
    window.LineTool = LineTool;
    window.RectangleTool = RectangleTool;
    window.EyedropperTool = EyedropperTool;
    window.EraserTool = EraserTool;
    window.PanTool = PanTool;
    window.SelectionTool = SelectionTool;
    window.WandTool = WandTool;
    window.tools = tools;
}
