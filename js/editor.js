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
        this.recentLayerSelections = []; // Track last 2 selected layer indices for auto-visibility

        // Tool settings
        this.currentTool = tools.pencil;
        this.selectedTileset = null;
        this.brushSize = 1;
        this.brushShape = 'square';
        this.fillMode = 'filled';

        // View settings
        this.tileSize = 16;
        this.zoom = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.showGrid = true;
        this.topLayerOpacity = 0.8; // Global opacity for top layer(s)

        // Mouse state
        this.mouseX = -1;
        this.mouseY = -1;
        this.gridX = -1;
        this.gridY = -1;
        this.isMouseDown = false;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;

        // Minimap drag state
        this.isMinimapDragging = false;

        // Undo/Redo stacks
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistorySize = 50;

        // Auto-save
        this.autoSaveInterval = null;
        this.isDirty = false;

        // Performance optimization flags
        this.isDrawing = false; // Track active drawing operations
        this.renderRequested = false; // Track if render is already queued
        this.minimapRenderRequested = false; // Track if minimap render is queued
        this.needsLayerPanelUpdate = false; // Defer layer panel updates

        // Layer highlight optimization
        this.lastHighlightX = -1;
        this.lastHighlightY = -1;
        this.highlightThrottleTime = 50; // Only update highlight every 50ms
        this.lastHighlightTime = 0;

        // Preview optimization
        this.lastPreviewX = -1;
        this.lastPreviewY = -1;
        this.previewRequested = false;

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
            const layer = this.layerManager.addLayer(layerConfig.name, {
                visible: layerConfig.visible,
                opacity: layerConfig.opacity,
                locked: layerConfig.locked,
                editable: layerConfig.editable,
                showHeights: layerConfig.showHeights,
                layerType: layerConfig.layerType,
                worldLayer: layerConfig.worldLayer
            });

            // Fill layer with appropriate default color
            const defaultColor = this.getDefaultColorForLayer(layerConfig.layerType);
            if (defaultColor) {
                this.layerManager.fillLayerWithDefault(layer, defaultColor);
            }
        }

        this.resizeCanvas();
        this.render();
    }

    /**
     * Get default color for a layer type
     * Returns transparent (#000000) for most layers, or a valid color if needed
     */
    getDefaultColorForLayer(layerType) {
        // Most layers use transparent black (#000000) as default
        // This renders as transparent and represents "None" values
        switch(layerType) {
            case 'Floor':
            case 'Underground':
            case 'Sky':
                return '#000000'; // Biome_None - renders transparent
            case 'Height':
                return '#525d6b'; // Height_Ground - Ground floor (default height)
            case 'Difficulty':
                return '#90ee90'; // Difficulty_Easy - lowest difficulty
            case 'Hazard':
                return '#1a1a1a'; // Hazard_None - no hazard
            default:
                return '#000000'; // Default transparent
        }
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

            // Get mouse position relative to container
            const rect = this.gridCanvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

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
            this.setZoom(this.zoom + delta, mouseX, mouseY);
        }, { passive: false });

        // Minimap drag-to-pan
        this.minimapCanvas.addEventListener('mousedown', (e) => this.onMinimapMouseDown(e));
        this.minimapCanvas.addEventListener('mousemove', (e) => this.onMinimapMouseMove(e));
        this.minimapCanvas.addEventListener('mouseup', (e) => this.onMinimapMouseUp(e));
        this.minimapCanvas.addEventListener('mouseleave', (e) => this.onMinimapMouseLeave(e));
        this.minimapCanvas.style.cursor = 'grab';
    }

    /**
     * Resize canvas to fill container
     */
    resizeCanvas() {
        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();

        // CRITICAL FIX: Canvas should be viewport size, NOT grid size!
        // The old code used Math.max(rect, grid) which made huge canvases (8192x8192)
        // This broke viewport culling and rendered ALL tiles instead of visible ones
        this.gridCanvas.width = rect.width;
        this.gridCanvas.height = rect.height;

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
            this.isDrawing = true; // Mark as drawing for performance optimization
            this.updateGridPosition();

            if (this.gridX >= 0 && this.gridY >= 0) {
                // CRITICAL FIX: Save state BEFORE drawing starts, not after!
                // We must capture the state before any modifications
                this.saveState();
                this.currentTool.onMouseDown(this, this.gridX, this.gridY, e);
                this.requestRender();
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
            this.requestRender();
            // Skip minimap render during panning for better performance
            return;
        }

        this.updateGridPosition();

        // Highlight layer under cursor (skip during active drawing for performance)
        if (!this.isMouseDown) {
            // Throttle highlight updates to reduce overhead
            const now = performance.now();
            if (now - this.lastHighlightTime > this.highlightThrottleTime ||
                this.gridX !== this.lastHighlightX ||
                this.gridY !== this.lastHighlightY) {
                this.highlightLayerAtPosition(this.gridX, this.gridY);
                this.lastHighlightTime = now;
                this.lastHighlightX = this.gridX;
                this.lastHighlightY = this.gridY;
            }
        }

        if (this.isMouseDown && this.gridX >= 0 && this.gridY >= 0) {
            this.currentTool.onMouseMove(this, this.gridX, this.gridY, e);
            this.requestRender();
            // Minimap updates are deferred until drawing finishes
        }

        // Only update preview if grid position changed (avoid redundant renders)
        if (this.gridX !== this.lastPreviewX || this.gridY !== this.lastPreviewY) {
            this.requestPreviewRender();
            this.lastPreviewX = this.gridX;
            this.lastPreviewY = this.gridY;
        }
    }

    onMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.gridCanvas.style.cursor = 'crosshair';
            return;
        }

        if (this.isMouseDown && this.gridX >= 0 && this.gridY >= 0) {
            this.currentTool.onMouseUp(this, this.gridX, this.gridY, e);
            this.isDrawing = false; // Drawing finished
            this.requestRender();
            this.requestMinimapRender(); // Update minimap now that drawing is done

            // Update layer panel after drawing completes
            if (this.needsLayerPanelUpdate && typeof window.updateLayersPanel === 'function') {
                window.updateLayersPanel();
                this.needsLayerPanelUpdate = false;
            }
        }

        this.isMouseDown = false;
        this.isDrawing = false;
    }

    onMouseLeave(e) {
        this.isMouseDown = false;
        this.isPanning = false;
        this.isDrawing = false;
        this.gridCanvas.style.cursor = 'crosshair';
        this.clearPreview();
        this.clearLayerHoverHighlight();
        this.lastPreviewX = -1;
        this.lastPreviewY = -1;
    }

    /**
     * Handle minimap mouse down to start dragging
     */
    onMinimapMouseDown(e) {
        this.isMinimapDragging = true;
        this.minimapCanvas.style.cursor = 'grabbing';
        this.updateViewportFromMinimap(e);
    }

    /**
     * Handle minimap mouse move while dragging
     */
    onMinimapMouseMove(e) {
        if (!this.isMinimapDragging) return;
        this.updateViewportFromMinimap(e, true); // Skip minimap render during drag
    }

    /**
     * Handle minimap mouse up to stop dragging
     */
    onMinimapMouseUp(e) {
        this.isMinimapDragging = false;
        this.minimapCanvas.style.cursor = 'grab';
        // Render minimap once when drag ends
        this.renderMinimap();
    }

    /**
     * Handle minimap mouse leave to stop dragging
     */
    onMinimapMouseLeave(e) {
        if (this.isMinimapDragging) {
            this.isMinimapDragging = false;
            this.minimapCanvas.style.cursor = 'grab';
        }
    }

    /**
     * Update viewport position based on minimap coordinates
     */
    updateViewportFromMinimap(e, skipMinimap = false) {
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

        this.requestRender();
        if (!skipMinimap) {
            this.requestMinimapRender();
        }
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
     * Highlight the layer that has data at the current cursor position
     * Searches from top to bottom (forward order, since first layer renders on top)
     * OPTIMIZED: Uses direct color lookup instead of full getTile reconstruction
     */
    highlightLayerAtPosition(x, y) {
        // Check if coordinates are valid
        if (x < 0 || x >= this.layerManager.width || y < 0 || y >= this.layerManager.height) {
            this.clearLayerHoverHighlight();
            document.getElementById('status-hover-info').textContent = '';
            return;
        }

        let foundLayerIndex = -1;
        let foundColor = null;

        // Search from first layer (top) to last layer (bottom)
        // OPTIMIZATION: Use direct Map lookup instead of getTile() to avoid colorMapper overhead
        const key = `${x},${y}`;
        for (let i = 0; i < this.layerManager.layers.length; i++) {
            const layer = this.layerManager.layers[i];
            if (!layer.visible) continue;

            // Direct lookup - much faster than getTile()
            const color = layer.tileData.get(key);
            // PERF: Avoid toLowerCase() - colors are stored lowercase
            if (color && color !== '#000000') {
                foundLayerIndex = i;
                foundColor = color;
                break;
            }
        }

        // Update the UI to highlight the found layer
        this.updateLayerHoverHighlight(foundLayerIndex);

        // Update status bar with hover info
        // Only reconstruct tileset if we need to display it
        if (foundLayerIndex >= 0 && foundColor) {
            const layer = this.layerManager.layers[foundLayerIndex];
            // Lazy load tileset name only when needed for display
            const enumData = window.colorMapper?.getEnumFromColor(foundColor);
            const tilesetName = enumData ? enumData.name : 'Unknown';
            document.getElementById('status-hover-info').textContent =
                `Layer: ${layer.name} | Tile: ${tilesetName}`;
        } else {
            document.getElementById('status-hover-info').textContent = '';
        }
    }

    /**
     * Update the visual highlight on layer items in the layers panel
     */
    updateLayerHoverHighlight(layerIndex) {
        const layerItems = document.querySelectorAll('.layer-item');

        layerItems.forEach((item, index) => {
            if (index === layerIndex) {
                item.classList.add('layer-hover');
            } else {
                item.classList.remove('layer-hover');
            }
        });
    }

    /**
     * Clear all layer hover highlights
     */
    clearLayerHoverHighlight() {
        const layerItems = document.querySelectorAll('.layer-item');
        layerItems.forEach(item => {
            item.classList.remove('layer-hover');
        });
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
            layer.setTile(tile.x, tile.y, this.selectedTileset.value, this.selectedTileset);
        }

        // Defer layer panel updates during active drawing for performance
        if (this.isDrawing) {
            this.needsLayerPanelUpdate = true;
        } else if (typeof window.updateLayersPanel === 'function') {
            window.updateLayersPanel();
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

        // Defer layer panel updates during active drawing for performance
        if (this.isDrawing) {
            this.needsLayerPanelUpdate = true;
        } else if (typeof window.updateLayersPanel === 'function') {
            window.updateLayersPanel();
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
            colorLabel.textContent = tileset.displayName || name;

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
            // Finalize any floating selection when switching away from selection tool
            if (this.currentTool.name === 'selection' && toolName !== 'selection') {
                if (this.currentTool.isFloating) {
                    this.currentTool.finalizeSelection(this);
                }
            }

            this.currentTool = tools[toolName];

            // Show/hide shape options
            const shapeOptions = document.getElementById('shape-options');
            if (toolName === 'rectangle') {
                shapeOptions.style.display = 'flex';
            } else {
                shapeOptions.style.display = 'none';
            }

            // Update cursor based on tool
            const container = document.getElementById('canvas-container');
            if (toolName === 'pan') {
                container.style.cursor = 'grab';
            } else if (toolName === 'selection') {
                container.style.cursor = 'crosshair';
            } else {
                container.style.cursor = 'crosshair';
            }
        }
    }

    /**
     * Set zoom level
     * @param {number} newZoom - The new zoom level
     * @param {number} centerX - Optional X coordinate to zoom towards (canvas space)
     * @param {number} centerY - Optional Y coordinate to zoom towards (canvas space)
     */
    setZoom(newZoom, centerX = null, centerY = null) {
        const oldZoom = this.zoom;
        this.zoom = Math.max(0.05, Math.min(8, newZoom)); // 5% to 800% zoom range

        // If center point provided, adjust offset to zoom towards that point
        if (centerX !== null && centerY !== null) {
            // Calculate world position at the center point before zoom
            const worldX = (centerX - this.offsetX) / (this.tileSize * oldZoom);
            const worldY = (centerY - this.offsetY) / (this.tileSize * oldZoom);

            // Calculate new offset to keep that world position under the mouse
            this.offsetX = centerX - worldX * this.tileSize * this.zoom;
            this.offsetY = centerY - worldY * this.tileSize * this.zoom;
        }

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
     * Get brush tiles based on shape (square or circle)
     */
    getBrushTiles(centerX, centerY, size = null, shape = null) {
        const brushSize = size !== null ? size : this.brushSize;
        const brushShape = shape !== null ? shape : this.brushShape;
        const offset = Math.floor(brushSize / 2);
        const tiles = [];

        if (brushShape === 'circle') {
            // Circle brush: use distance from center
            // Calculate radius to create circular shape
            // For odd sizes, center is at the middle tile
            // For even sizes, center is between tiles
            const centerOffset = brushSize / 2;
            const radius = brushSize / 2;

            for (let dy = 0; dy < brushSize; dy++) {
                for (let dx = 0; dx < brushSize; dx++) {
                    const tx = centerX - offset + dx;
                    const ty = centerY - offset + dy;

                    // Calculate distance from center (use 0.5 offset for pixel center)
                    const distX = (dx + 0.5) - centerOffset;
                    const distY = (dy + 0.5) - centerOffset;
                    const distance = Math.sqrt(distX * distX + distY * distY);

                    // Only include tiles within radius (use < for stricter circle)
                    if (distance < radius) {
                        tiles.push({ x: tx, y: ty });
                    }
                }
            }
        } else {
            // Square brush (default)
            for (let dy = 0; dy < brushSize; dy++) {
                for (let dx = 0; dx < brushSize; dx++) {
                    const tx = centerX - offset + dx;
                    const ty = centerY - offset + dy;
                    tiles.push({ x: tx, y: ty });
                }
            }
        }

        return tiles;
    }

    /**
     * Request a render using requestAnimationFrame for batching
     */
    requestRender() {
        if (this.renderRequested) return; // Already queued
        this.renderRequested = true;

        requestAnimationFrame(() => {
            this.render();
            this.renderRequested = false;
        });
    }

    /**
     * Request a minimap render using requestAnimationFrame for batching
     */
    requestMinimapRender() {
        if (this.minimapRenderRequested) return; // Already queued
        this.minimapRenderRequested = true;

        requestAnimationFrame(() => {
            this.renderMinimap();
            this.minimapRenderRequested = false;
        });
    }

    /**
     * Request a preview render using requestAnimationFrame for batching
     */
    requestPreviewRender() {
        if (this.previewRequested) return; // Already queued
        this.previewRequested = true;

        requestAnimationFrame(() => {
            this.renderPreview();
            this.previewRequested = false;
        });
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

        // Render layers in reverse order (first layer in list renders on top)
        // Bottom layer is always full opacity, top layers use global opacity
        const visibleLayers = [];
        for (let i = this.layerManager.layers.length - 1; i >= 0; i--) {
            const layer = this.layerManager.layers[i];
            if (layer.visible) {
                visibleLayers.push(layer);
            }
        }

        for (let i = 0; i < visibleLayers.length; i++) {
            const layer = visibleLayers[i];
            const isBottomLayer = (i === visibleLayers.length - 1);

            // Bottom layer always at full opacity, others use global opacity
            ctx.globalAlpha = isBottomLayer ? 1.0 : this.topLayerOpacity;
            this.renderLayer(ctx, layer);
        }

        ctx.globalAlpha = 1.0;

        // Render grid boundary (visible border around the actual grid)
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2 / this.zoom;
        ctx.strokeRect(0, 0, this.layerManager.width * this.tileSize, this.layerManager.height * this.tileSize);

        // Render grid lines
        if (this.showGrid && this.zoom >= 0.5) {
            this.renderGrid(ctx);
        }

        ctx.restore();

        // Update statistics
        this.updateStatistics();
    }

    /**
     * Render a single layer with viewport culling and batched rendering
     */
    renderLayer(ctx, layer) {
        const dataMap = layer.tileData;
        if (!dataMap) {
            return;
        }

        // Calculate visible tile bounds for culling
        const startX = Math.max(0, Math.floor(-this.offsetX / (this.tileSize * this.zoom)));
        const startY = Math.max(0, Math.floor(-this.offsetY / (this.tileSize * this.zoom)));
        const endX = Math.min(layer.width, startX + Math.ceil(this.gridCanvas.width / (this.tileSize * this.zoom)) + 1);
        const endY = Math.min(layer.height, startY + Math.ceil(this.gridCanvas.height / (this.tileSize * this.zoom)) + 1);

        // Batch tiles by color for more efficient rendering
        const colorBatches = new Map();

        // CRITICAL FIX: Only iterate through VISIBLE tiles, not all tiles!
        // Instead of iterating through entire Map (262k+ tiles), only check visible range
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const key = `${x},${y}`;
                const color = dataMap.get(key);

                // PERF: Avoid toLowerCase() on every tile - colors are stored lowercase
                if (color && color !== '#000000') {
                    // Skip rendering for transparent "none" colors (#000000)
                    if (!colorBatches.has(color)) {
                        colorBatches.set(color, []);
                    }
                    colorBatches.get(color).push({ x, y });
                }
            }
        }

        // Render all tiles of the same color together using Path2D for better performance
        for (const [color, tiles] of colorBatches.entries()) {
            ctx.fillStyle = color;

            // CRITICAL PERF: Use Path2D to batch all rects into a single fill operation
            // This is MUCH faster than individual fillRect calls (10x-20x speedup)
            const path = new Path2D();
            for (const tile of tiles) {
                path.rect(tile.x * this.tileSize, tile.y * this.tileSize, this.tileSize, this.tileSize);
            }
            ctx.fill(path);
        }
    }

    /**
     * Render grid lines (optimized with batched paths)
     */
    renderGrid(ctx) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1 / this.zoom;

        // Only render visible grid lines
        const startX = Math.max(0, Math.floor(-this.offsetX / (this.tileSize * this.zoom)));
        const startY = Math.max(0, Math.floor(-this.offsetY / (this.tileSize * this.zoom)));
        const endX = Math.min(this.layerManager.width, startX + Math.ceil(this.gridCanvas.width / (this.tileSize * this.zoom)) + 1);
        const endY = Math.min(this.layerManager.height, startY + Math.ceil(this.gridCanvas.height / (this.tileSize * this.zoom)) + 1);

        // Batch all lines into a single path for better performance
        ctx.beginPath();

        // Vertical lines
        for (let x = startX; x <= endX; x++) {
            ctx.moveTo(x * this.tileSize, startY * this.tileSize);
            ctx.lineTo(x * this.tileSize, endY * this.tileSize);
        }

        // Horizontal lines
        for (let y = startY; y <= endY; y++) {
            ctx.moveTo(startX * this.tileSize, y * this.tileSize);
            ctx.lineTo(endX * this.tileSize, y * this.tileSize);
        }

        ctx.stroke();
    }

    /**
     * Render preview overlay
     * OPTIMIZED: Use Path2D batching for performance
     */
    renderPreview() {
        const ctx = this.previewCtx;
        ctx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);

        if (this.gridX < 0 || this.gridY < 0) return;
        if (!this.selectedTileset && this.currentTool.name !== 'eraser' && this.currentTool.name !== 'eyedropper' && this.currentTool.name !== 'selection') return;

        const preview = this.currentTool.getPreview(this, this.gridX, this.gridY);
        if (preview.length === 0) return;

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.zoom, this.zoom);

        // Separate tiles by type for batching
        const outlineTiles = [];
        const floatingTiles = [];
        const normalTiles = [];

        for (const tile of preview) {
            if (tile.outline && this.currentTool.name === 'selection') {
                outlineTiles.push(tile);
            } else if (tile.tileset && this.currentTool.name === 'selection') {
                floatingTiles.push(tile);
            } else {
                normalTiles.push(tile);
            }
        }

        // Render normal tiles with Path2D batching (much faster!)
        if (normalTiles.length > 0) {
            const path = new Path2D();
            for (const tile of normalTiles) {
                path.rect(tile.x * this.tileSize, tile.y * this.tileSize, this.tileSize, this.tileSize);
            }

            if (this.currentTool.name === 'eraser') {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            } else {
                ctx.fillStyle = this.selectedTileset ? this.selectedTileset.color + '80' : 'rgba(255, 255, 255, 0.3)';
            }
            ctx.fill(path);
        }

        // Render floating selection tiles (can't batch due to different colors)
        for (const tile of floatingTiles) {
            ctx.fillStyle = tile.tileset.color + 'CC';
            ctx.fillRect(tile.x * this.tileSize, tile.y * this.tileSize, this.tileSize, this.tileSize);
        }

        // Render outline tiles (can't batch due to setLineDash)
        if (outlineTiles.length > 0) {
            ctx.strokeStyle = '#4a9eff';
            ctx.lineWidth = 2 / this.zoom;
            ctx.setLineDash([4 / this.zoom, 4 / this.zoom]);
            for (const tile of outlineTiles) {
                ctx.strokeRect(tile.x * this.tileSize, tile.y * this.tileSize, this.tileSize, this.tileSize);
            }
            ctx.setLineDash([]);
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

        // Render all layers in reverse order (first layer in list renders on top)
        // Bottom layer is always full opacity, top layers use global opacity
        const visibleLayers = [];
        for (let i = this.layerManager.layers.length - 1; i >= 0; i--) {
            const layer = this.layerManager.layers[i];
            if (layer.visible) {
                visibleLayers.push(layer);
            }
        }

        for (let layerIdx = 0; layerIdx < visibleLayers.length; layerIdx++) {
            const layer = visibleLayers[layerIdx];
            const isBottomLayer = (layerIdx === visibleLayers.length - 1);

            // Bottom layer always at full opacity, others use global opacity
            ctx.globalAlpha = isBottomLayer ? 1.0 : this.topLayerOpacity;

            const dataMap = layer.tileData;
            if (!dataMap) continue;

            // CRITICAL FIX: Only iterate through sampled positions, not all tiles!
            // For large grids, this reduces iterations from 262k to ~65k (4x faster)
            for (let y = 0; y < layer.height; y += sampleRate) {
                for (let x = 0; x < layer.width; x += sampleRate) {
                    const key = `${x},${y}`;
                    const color = dataMap.get(key);

                    // PERF: Avoid toLowerCase() - colors are stored lowercase
                    if (color && color !== '#000000') {
                        ctx.fillStyle = color;
                        ctx.fillRect(
                            x * scaleX,
                            y * scaleY,
                            sampleRate * scaleX + 1,
                            sampleRate * scaleY + 1
                        );
                    }
                }
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
        // Skip statistics update during drawing for performance
        // Statistics are expensive to calculate for large grids
        if (this.isDrawing) return;

        const totalTiles = this.layerManager.getTotalTileCount();
        const emptyTiles = (this.layerManager.width * this.layerManager.height) - totalTiles;

        document.getElementById('stat-tiles').textContent = totalTiles;
        document.getElementById('stat-empty').textContent = emptyTiles;
    }

    /**
     * Save state for undo (optimized: clone Maps directly instead of JSON export)
     * PERFORMANCE: Direct Map cloning is 10-100x faster than exportData + JSON.stringify
     */
    saveState() {
        const state = {
            width: this.layerManager.width,
            height: this.layerManager.height,
            activeLayerIndex: this.layerManager.activeLayerIndex,
            layers: this.layerManager.layers.map(layer => ({
                name: layer.name,
                opacity: layer.opacity,
                locked: layer.locked,
                editable: layer.editable,
                layerType: layer.layerType,
                worldLayer: layer.worldLayer,
                required: layer.required,
                // Deep clone the Map - much faster than exporting to array + JSON
                tileData: new Map(layer.tileData)
            }))
        };

        this.undoStack.push(state);

        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }

        this.redoStack = [];
        this.updateUndoRedoButtons();
    }

    /**
     * Undo last action (optimized: restore Maps directly)
     */
    undo() {
        if (this.undoStack.length === 0) return;

        // Save current visibility state before undo
        const visibilityState = this.layerManager.layers.map(l => l.visible);

        // Save current state to redo stack (using optimized Map cloning)
        const currentState = {
            width: this.layerManager.width,
            height: this.layerManager.height,
            activeLayerIndex: this.layerManager.activeLayerIndex,
            layers: this.layerManager.layers.map(layer => ({
                name: layer.name,
                opacity: layer.opacity,
                locked: layer.locked,
                editable: layer.editable,
                layerType: layer.layerType,
                worldLayer: layer.worldLayer,
                required: layer.required,
                tileData: new Map(layer.tileData)
            }))
        };
        this.redoStack.push(currentState);

        // Restore previous state directly from Maps
        const previousState = this.undoStack.pop();

        // Restore layer data directly
        for (let i = 0; i < this.layerManager.layers.length; i++) {
            if (i < previousState.layers.length) {
                const layer = this.layerManager.layers[i];
                const prevLayer = previousState.layers[i];

                // Clone the Map data
                layer.tileData = new Map(prevLayer.tileData);

                // Restore other properties
                layer.name = prevLayer.name;
                layer.opacity = prevLayer.opacity;
                layer.locked = prevLayer.locked;
                layer.editable = prevLayer.editable;
                layer.layerType = prevLayer.layerType;
                layer.worldLayer = prevLayer.worldLayer;
                layer.required = prevLayer.required;
            }
        }

        // Restore visibility state after undo (visibility is UI state, not data state)
        this.layerManager.layers.forEach((layer, idx) => {
            if (idx < visibilityState.length) {
                layer.visible = visibilityState[idx];
            }
        });

        this.render();
        this.renderMinimap();
        this.updateUndoRedoButtons();
        this.isDirty = true;
    }

    /**
     * Redo last undone action (optimized: restore Maps directly)
     */
    redo() {
        if (this.redoStack.length === 0) return;

        // Save current visibility state before redo
        const visibilityState = this.layerManager.layers.map(l => l.visible);

        // Save current state to undo stack (using optimized Map cloning)
        const currentState = {
            width: this.layerManager.width,
            height: this.layerManager.height,
            activeLayerIndex: this.layerManager.activeLayerIndex,
            layers: this.layerManager.layers.map(layer => ({
                name: layer.name,
                opacity: layer.opacity,
                locked: layer.locked,
                editable: layer.editable,
                layerType: layer.layerType,
                worldLayer: layer.worldLayer,
                required: layer.required,
                tileData: new Map(layer.tileData)
            }))
        };
        this.undoStack.push(currentState);

        // Restore next state directly from Maps
        const nextState = this.redoStack.pop();

        // Restore layer data directly
        for (let i = 0; i < this.layerManager.layers.length; i++) {
            if (i < nextState.layers.length) {
                const layer = this.layerManager.layers[i];
                const nextLayer = nextState.layers[i];

                // Clone the Map data
                layer.tileData = new Map(nextLayer.tileData);

                // Restore other properties
                layer.name = nextLayer.name;
                layer.opacity = nextLayer.opacity;
                layer.locked = nextLayer.locked;
                layer.editable = nextLayer.editable;
                layer.layerType = nextLayer.layerType;
                layer.worldLayer = nextLayer.worldLayer;
                layer.required = nextLayer.required;
            }
        }

        // Restore visibility state after redo (visibility is UI state, not data state)
        this.layerManager.layers.forEach((layer, idx) => {
            if (idx < visibilityState.length) {
                layer.visible = visibilityState[idx];
            }
        });

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
     * Clear all layers and refill with defaults
     */
    clearAll() {
        this.saveState();
        this.layerManager.clearAll();

        // Refill each layer with its default color
        for (const layer of this.layerManager.layers) {
            const defaultColor = this.getDefaultColorForLayer(layer.layerType);
            if (defaultColor) {
                this.layerManager.fillLayerWithDefault(layer, defaultColor);
            }
        }

        this.render();
        this.renderMinimap();
        this.isDirty = true;
    }

    /**
     * Export level data (legacy format for undo/redo)
     */
    exportLevel() {
        // Use legacy export for backwards compatibility with undo/redo
        return this.layerManager.exportData();
    }

    /**
     * Import level data (supports both legacy and RLE formats)
     */
    importLevel(data) {
        // Check if it's RLE format (has metadata and layers array)
        if (data.metadata && Array.isArray(data.layers)) {
            // RLE format
            const worldSize = data.metadata.world_size;
            this.layerManager.resize(worldSize, worldSize);
            this.layerManager.importRLEData(data, configManager);
        } else {
            // Legacy format
            if (data.gridSize) {
                this.layerManager.resize(data.gridSize.width, data.gridSize.height);
            }
            this.layerManager.importData(data, configManager);
        }

        this.resizeCanvas();
        this.isDirty = false;
    }
}

// Export for testing
if (typeof window !== 'undefined') {
    window.LevelEditor = LevelEditor;
}
