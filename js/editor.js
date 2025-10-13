/**
 * Main Editor Class
 * Handles canvas rendering, user input, and coordinate transformations
 */

class LevelEditor {
    constructor() {
        // Canvas elements
        this.gridCanvas = document.getElementById('grid-canvas');
        this.previewCanvas = document.getElementById('preview-canvas');
        this.minimapCanvas = document.getElementById('minimap-canvas');

        this.gridCtx = this.gridCanvas.getContext('2d', { alpha: false });
        this.previewCtx = this.previewCanvas.getContext('2d', { alpha: true });
        this.minimapCtx = this.minimapCanvas.getContext('2d', { alpha: false });

        // Disable image smoothing for pixel-perfect rendering
        this.gridCtx.imageSmoothingEnabled = false;
        this.previewCtx.imageSmoothingEnabled = false;
        this.minimapCtx.imageSmoothingEnabled = false;

        // Layer manager
        this.layerManager = new LayerManager(256, 256);

        // Tool settings
        this.currentTool = tools.pencil;
        this.selectedTileset = null;
        this.brushSize = 1;
        this.fillMode = 'filled';

        // View settings
        this.tileSize = 16;
        this.zoom = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.showGrid = true;

        // Mouse state
        this.mouseX = -1;
        this.mouseY = -1;
        this.gridX = -1;
        this.gridY = -1;
        this.isMouseDown = false;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;

        // Undo/Redo stacks
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistorySize = 50;

        // Auto-save
        this.autoSaveInterval = null;
        this.isDirty = false;

        this.setupEventListeners();
        this.resizeCanvas();
    }

    /**
     * Initialize layer manager from config
     */
    initializeLayers(config) {
        const size = config.getDefaultGridSize();
        this.layerManager = new LayerManager(size.width, size.height);

        const layers = config.getLayers();
        for (const layerConfig of layers) {
            this.layerManager.addLayer(layerConfig.name, {
                visible: layerConfig.visible,
                opacity: layerConfig.opacity,
                locked: layerConfig.locked,
                editable: layerConfig.editable,
                showHeights: layerConfig.showHeights
            });
        }

        this.resizeCanvas();
        this.render();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const container = document.getElementById('canvas-container');

        // Mouse events
        container.addEventListener('mousedown', (e) => this.onMouseDown(e));
        container.addEventListener('mousemove', (e) => this.onMouseMove(e));
        container.addEventListener('mouseup', (e) => this.onMouseUp(e));
        container.addEventListener('mouseleave', (e) => this.onMouseLeave(e));

        // Prevent context menu
        container.addEventListener('contextmenu', (e) => e.preventDefault());

        // Window resize
        window.addEventListener('resize', () => this.resizeCanvas());

        // Scroll for zoom with adaptive increments
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            // Smaller increments at lower zoom levels for finer control
            let delta;
            if (this.zoom < 0.2) {
                delta = e.deltaY > 0 ? -0.01 : 0.01; // Very fine control under 20%
            } else if (this.zoom < 0.5) {
                delta = e.deltaY > 0 ? -0.025 : 0.025; // Fine control under 50%
            } else if (this.zoom < 1.0) {
                delta = e.deltaY > 0 ? -0.05 : 0.05; // Medium control under 100%
            } else {
                delta = e.deltaY > 0 ? -0.1 : 0.1; // Normal control above 100%
            }
            this.setZoom(this.zoom + delta);
        }, { passive: false });

        // Minimap click-to-pan
        this.minimapCanvas.addEventListener('click', (e) => this.onMinimapClick(e));
        this.minimapCanvas.style.cursor = 'pointer';
    }

    /**
     * Resize canvas to fill container
     */
    resizeCanvas() {
        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();

        const gridWidth = this.layerManager.width * this.tileSize * this.zoom;
        const gridHeight = this.layerManager.height * this.tileSize * this.zoom;

        this.gridCanvas.width = Math.max(rect.width, gridWidth);
        this.gridCanvas.height = Math.max(rect.height, gridHeight);

        this.previewCanvas.width = this.gridCanvas.width;
        this.previewCanvas.height = this.gridCanvas.height;

        this.minimapCanvas.width = 190;
        this.minimapCanvas.height = 190;

        this.render();
        this.renderMinimap();
    }

    /**
     * Mouse event handlers
     */
    onMouseDown(e) {
        const rect = this.gridCanvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;

        // Middle mouse or Space+Left mouse for panning
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            this.isPanning = true;
            this.panStartX = this.mouseX - this.offsetX;
            this.panStartY = this.mouseY - this.offsetY;
            this.gridCanvas.style.cursor = 'grabbing';
            return;
        }

        // Left mouse for tool
        if (e.button === 0) {
            this.isMouseDown = true;
            this.updateGridPosition();

            if (this.gridX >= 0 && this.gridY >= 0) {
                this.saveState();
                this.currentTool.onMouseDown(this, this.gridX, this.gridY);
                this.render();
                this.renderMinimap();
                this.isDirty = true;
            }
        }
    }

    onMouseMove(e) {
        const rect = this.gridCanvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;

        if (this.isPanning) {
            this.offsetX = this.mouseX - this.panStartX;
            this.offsetY = this.mouseY - this.panStartY;
            this.render();
            return;
        }

        this.updateGridPosition();

        if (this.isMouseDown && this.gridX >= 0 && this.gridY >= 0) {
            this.currentTool.onMouseMove(this, this.gridX, this.gridY);
            this.render();
            this.renderMinimap();
        }

        this.renderPreview();
    }

    onMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.gridCanvas.style.cursor = 'crosshair';
            return;
        }

        if (this.isMouseDown && this.gridX >= 0 && this.gridY >= 0) {
            this.currentTool.onMouseUp(this, this.gridX, this.gridY);
            this.render();
            this.renderMinimap();
        }

        this.isMouseDown = false;
    }

    onMouseLeave(e) {
        this.isMouseDown = false;
        this.isPanning = false;
        this.gridCanvas.style.cursor = 'crosshair';
        this.clearPreview();
    }

    /**
     * Handle minimap click to pan
     */
    onMinimapClick(e) {
        const rect = this.minimapCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Calculate scale factors
        const scaleX = this.layerManager.width / this.minimapCanvas.width;
        const scaleY = this.layerManager.height / this.minimapCanvas.height;

        // Convert minimap coordinates to grid coordinates
        const gridX = clickX * scaleX;
        const gridY = clickY * scaleY;

        // Center viewport on clicked position
        const container = document.getElementById('canvas-container');
        const containerRect = container.getBoundingClientRect();

        const centerOffsetX = (containerRect.width / 2) / (this.tileSize * this.zoom);
        const centerOffsetY = (containerRect.height / 2) / (this.tileSize * this.zoom);

        this.offsetX = -(gridX - centerOffsetX) * this.tileSize * this.zoom;
        this.offsetY = -(gridY - centerOffsetY) * this.tileSize * this.zoom;

        this.render();
        this.renderMinimap();
    }

    /**
     * Update grid position from mouse position
     */
    updateGridPosition() {
        const worldX = (this.mouseX - this.offsetX) / (this.tileSize * this.zoom);
        const worldY = (this.mouseY - this.offsetY) / (this.tileSize * this.zoom);

        this.gridX = Math.floor(worldX);
        this.gridY = Math.floor(worldY);

        // Update status bar
        if (this.gridX >= 0 && this.gridX < this.layerManager.width &&
            this.gridY >= 0 && this.gridY < this.layerManager.height) {
            document.getElementById('status-position').textContent = `X: ${this.gridX}, Y: ${this.gridY}`;
        } else {
            document.getElementById('status-position').textContent = 'X: --, Y: --';
        }
    }

    /**
     * Set tiles (used by tools)
     */
    setTiles(tiles) {
        const layer = this.layerManager.getActiveLayer();
        if (!layer || !this.selectedTileset) return;

        // Check if layer is editable
        if (layer.locked || !layer.editable) {
            document.getElementById('status-message').textContent = 'Layer is not editable';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
            return;
        }

        for (const tile of tiles) {
            layer.setTile(tile.x, tile.y, this.selectedTileset);
        }
    }

    /**
     * Clear tiles (used by eraser)
     */
    clearTiles(tiles) {
        const layer = this.layerManager.getActiveLayer();
        if (!layer) return;

        // Check if layer is editable
        if (layer.locked || !layer.editable) {
            document.getElementById('status-message').textContent = 'Layer is not editable';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
            return;
        }

        for (const tile of tiles) {
            layer.clearTile(tile.x, tile.y);
        }
    }

    /**
     * Select tileset by name
     */
    selectTileset(name) {
        const tileset = configManager.getTileset(name);
        if (tileset) {
            this.selectedTileset = { name, ...tileset };

            // Update UI
            const colorDisplay = document.getElementById('current-color');
            const colorLabel = document.getElementById('current-color-label');
            colorDisplay.style.backgroundColor = tileset.color;
            colorLabel.textContent = name;

            // Update palette selection
            document.querySelectorAll('.color-item').forEach(item => {
                item.classList.toggle('selected', item.dataset.name === name);
            });
        }
    }

    /**
     * Set current tool
     */
    setTool(toolName) {
        if (tools[toolName]) {
            this.currentTool = tools[toolName];

            // Show/hide shape options
            const shapeOptions = document.getElementById('shape-options');
            if (toolName === 'rectangle') {
                shapeOptions.style.display = 'flex';
            } else {
                shapeOptions.style.display = 'none';
            }
        }
    }

    /**
     * Set zoom level
     */
    setZoom(newZoom) {
        this.zoom = Math.max(0.05, Math.min(8, newZoom)); // 5% to 800% zoom range
        document.getElementById('zoom-level').textContent = `${Math.round(this.zoom * 100)}%`;
        this.resizeCanvas();
    }

    /**
     * Fit grid to view
     */
    fitToView() {
        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();

        const gridWidth = this.layerManager.width * this.tileSize;
        const gridHeight = this.layerManager.height * this.tileSize;

        const zoomX = rect.width / gridWidth;
        const zoomY = rect.height / gridHeight;

        this.zoom = Math.min(zoomX, zoomY) * 0.9;
        this.offsetX = (rect.width - gridWidth * this.zoom) / 2;
        this.offsetY = (rect.height - gridHeight * this.zoom) / 2;

        document.getElementById('zoom-level').textContent = `${Math.round(this.zoom * 100)}%`;
        this.resizeCanvas();
    }

    /**
     * Render main grid
     */
    render() {
        const ctx = this.gridCtx;
        const width = this.gridCanvas.width;
        const height = this.gridCanvas.height;

        // Clear background
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.zoom, this.zoom);

        // Render layers from bottom to top
        for (const layer of this.layerManager.layers) {
            if (!layer.visible) continue;

            ctx.globalAlpha = layer.opacity;
            this.renderLayer(ctx, layer);
        }

        ctx.globalAlpha = 1.0;

        // Render grid lines
        if (this.showGrid && this.zoom >= 0.5) {
            this.renderGrid(ctx);
        }

        ctx.restore();

        // Update statistics
        this.updateStatistics();
    }

    /**
     * Render a single layer with viewport culling
     */
    renderLayer(ctx, layer) {
        // Calculate visible tile bounds for culling
        const startX = Math.max(0, Math.floor(-this.offsetX / (this.tileSize * this.zoom)));
        const startY = Math.max(0, Math.floor(-this.offsetY / (this.tileSize * this.zoom)));
        const endX = Math.min(layer.width, startX + Math.ceil(this.gridCanvas.width / (this.tileSize * this.zoom)) + 1);
        const endY = Math.min(layer.height, startY + Math.ceil(this.gridCanvas.height / (this.tileSize * this.zoom)) + 1);

        // Only render tiles within viewport
        for (const [key, tileset] of layer.tiles.entries()) {
            const [x, y] = key.split(',').map(Number);

            // Skip tiles outside viewport
            if (x < startX || x >= endX || y < startY || y >= endY) {
                continue;
            }

            ctx.fillStyle = tileset.color;
            ctx.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
        }
    }

    /**
     * Render grid lines
     */
    renderGrid(ctx) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1 / this.zoom;

        const startX = 0;
        const startY = 0;
        const endX = this.layerManager.width;
        const endY = this.layerManager.height;

        // Vertical lines
        for (let x = startX; x <= endX; x++) {
            ctx.beginPath();
            ctx.moveTo(x * this.tileSize, startY * this.tileSize);
            ctx.lineTo(x * this.tileSize, endY * this.tileSize);
            ctx.stroke();
        }

        // Horizontal lines
        for (let y = startY; y <= endY; y++) {
            ctx.beginPath();
            ctx.moveTo(startX * this.tileSize, y * this.tileSize);
            ctx.lineTo(endX * this.tileSize, y * this.tileSize);
            ctx.stroke();
        }
    }

    /**
     * Render preview overlay
     */
    renderPreview() {
        const ctx = this.previewCtx;
        ctx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);

        if (this.gridX < 0 || this.gridY < 0) return;
        if (!this.selectedTileset && this.currentTool.name !== 'eraser' && this.currentTool.name !== 'eyedropper') return;

        const preview = this.currentTool.getPreview(this, this.gridX, this.gridY);

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.zoom, this.zoom);

        for (const tile of preview) {
            if (this.currentTool.name === 'eraser') {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            } else {
                ctx.fillStyle = this.selectedTileset ? this.selectedTileset.color + '80' : 'rgba(255, 255, 255, 0.3)';
            }
            ctx.fillRect(tile.x * this.tileSize, tile.y * this.tileSize, this.tileSize, this.tileSize);
        }

        ctx.restore();
    }

    /**
     * Clear preview
     */
    clearPreview() {
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    }

    /**
     * Render minimap with optimized sampling
     */
    renderMinimap() {
        const ctx = this.minimapCtx;
        const width = this.minimapCanvas.width;
        const height = this.minimapCanvas.height;

        // Clear
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, width, height);

        const scaleX = width / this.layerManager.width;
        const scaleY = height / this.layerManager.height;

        // Sample rate: render every Nth tile for performance
        // For 512×512: sample every 2nd tile, for 256×256: every tile
        const sampleRate = Math.max(1, Math.ceil(this.layerManager.width / 256));

        // Render all layers
        for (const layer of this.layerManager.layers) {
            if (!layer.visible) continue;

            ctx.globalAlpha = layer.opacity;

            // Render tiles with sampling for performance
            for (const [key, tileset] of layer.tiles.entries()) {
                const [x, y] = key.split(',').map(Number);

                // Skip some tiles for larger grids
                if (x % sampleRate !== 0 || y % sampleRate !== 0) continue;

                ctx.fillStyle = tileset.color;
                ctx.fillRect(
                    x * scaleX,
                    y * scaleY,
                    sampleRate * scaleX + 1,
                    sampleRate * scaleY + 1
                );
            }
        }

        ctx.globalAlpha = 1.0;

        // Draw viewport rectangle
        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();
        const viewportX = (-this.offsetX / (this.tileSize * this.zoom)) * scaleX;
        const viewportY = (-this.offsetY / (this.tileSize * this.zoom)) * scaleY;
        const viewportWidth = (rect.width / (this.tileSize * this.zoom)) * scaleX;
        const viewportHeight = (rect.height / (this.tileSize * this.zoom)) * scaleY;

        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2;
        ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);
    }

    /**
     * Update statistics display
     */
    updateStatistics() {
        const totalTiles = this.layerManager.getTotalTileCount();
        const emptyTiles = (this.layerManager.width * this.layerManager.height) - totalTiles;

        document.getElementById('stat-tiles').textContent = totalTiles;
        document.getElementById('stat-empty').textContent = emptyTiles;
    }

    /**
     * Save state for undo
     */
    saveState() {
        const state = this.layerManager.exportData();
        this.undoStack.push(JSON.stringify(state));

        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }

        this.redoStack = [];
        this.updateUndoRedoButtons();
    }

    /**
     * Undo last action
     */
    undo() {
        if (this.undoStack.length === 0) return;

        const currentState = this.layerManager.exportData();
        this.redoStack.push(JSON.stringify(currentState));

        const previousState = this.undoStack.pop();
        this.layerManager.importData(JSON.parse(previousState), configManager);

        this.render();
        this.renderMinimap();
        this.updateUndoRedoButtons();
        this.isDirty = true;
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (this.redoStack.length === 0) return;

        const currentState = this.layerManager.exportData();
        this.undoStack.push(JSON.stringify(currentState));

        const nextState = this.redoStack.pop();
        this.layerManager.importData(JSON.parse(nextState), configManager);

        this.render();
        this.renderMinimap();
        this.updateUndoRedoButtons();
        this.isDirty = true;
    }

    /**
     * Update undo/redo button states
     */
    updateUndoRedoButtons() {
        document.getElementById('btn-undo').disabled = this.undoStack.length === 0;
        document.getElementById('btn-redo').disabled = this.redoStack.length === 0;
    }

    /**
     * Resize grid
     */
    resizeGrid(newWidth, newHeight) {
        this.saveState();
        this.layerManager.resize(newWidth, newHeight);
        this.resizeCanvas();
        this.isDirty = true;
    }

    /**
     * Clear all layers
     */
    clearAll() {
        this.saveState();
        this.layerManager.clearAll();
        this.render();
        this.renderMinimap();
        this.isDirty = true;
    }

    /**
     * Export level data
     */
    exportLevel() {
        return {
            version: '1.0',
            gridSize: {
                width: this.layerManager.width,
                height: this.layerManager.height
            },
            layers: this.layerManager.exportData().layers
        };
    }

    /**
     * Import level data
     */
    importLevel(data) {
        if (data.gridSize) {
            this.layerManager.resize(data.gridSize.width, data.gridSize.height);
        }

        this.layerManager.importData(data, configManager);
        this.resizeCanvas();
        this.isDirty = false;
    }
}
