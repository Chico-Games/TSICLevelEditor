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

        // Layer solo mode (click active layer to toggle solo/multi view)
        this.layerSoloMode = false;
        this.preSoloVisibility = []; // Store visibility before solo mode
        this.preSoloOpacity = 0.8; // Store opacity before solo mode
        this.preSoloRecentSelections = []; // Store recent selections before solo mode

        // Tool settings
        this.currentTool = tools.pencil;
        this.previousTool = null; // Track previous tool for eyedropper auto-switch
        this.selectedTileset = null;
        this.brushSize = 1;
        this.brushShape = 'circle';
        this.fillMode = 'filled';
        this.prePOIBrushSize = null; // Store brush size before selecting a POI

        // Locked colors - colors in this set cannot be painted over
        this.lockedColors = new Set();

        // Points of Interest - special biomes that are often worth protecting
        this.pointsOfInterest = [
            '#00ff7f', // Spawn
            '#f59e0b', // Map
            '#bb8fce', // HelpPoint
            '#3b82f6', // SCPBaseEntrance
            '#1e40af', // SCPBaseExit
            '#fbbf24', // SCPBasePower
            '#9ca3af', // CarParkEntrance
            '#4b5563', // CarParkExit
            '#9370db', // LostAndFound
            '#8b4513'  // AbandonedCamp
        ];

        // View settings
        this.tileSize = 16;
        this.zoom = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.showGrid = true;
        this.showGuides = true; // Show composition guide lines
        this.guideHorizontal = 2; // Number of horizontal divisions
        this.guideVertical = 2; // Number of vertical divisions
        this.topLayerOpacity = 0.65; // Global opacity for top layer(s)

        // Mouse state
        this.mouseX = -1;
        this.mouseY = -1;
        this.gridX = -1;
        this.gridY = -1;
        this.isMouseDown = false;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;

        // Keyboard modifier state
        this.shiftPressed = false;
        this.ctrlPressed = false;

        // Maze visualizer
        this.mazeVisualizer = null; // Will be initialized in app.js

        // Minimap drag state
        this.isMinimapDragging = false;

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
     * NOTE: Layers start EMPTY for performance. Fill with defaults only when creating new project.
     */
    initializeLayers(config) {
        const initStart = performance.now();
        const size = config.getDefaultGridSize();
        console.log(`[EDITOR] initializeLayers: Creating ${size.width}x${size.height} grid...`);

        this.layerManager = new LayerManager(size.width, size.height);

        const layers = config.getLayers();
        console.log(`[EDITOR] initializeLayers: Creating ${layers.length} layers...`);

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
            console.log(`[EDITOR] initializeLayers: Created layer "${layer.name}" (${layer.layerType})`);

            // DON'T fill with defaults here - layers start empty for fast initialization
            // Defaults are filled when creating a NEW project (see createNewProject)
        }

        console.log(`[EDITOR] initializeLayers: Layers created in ${(performance.now() - initStart).toFixed(1)}ms`);

        this.resizeCanvas();
        this.render();

        console.log(`[EDITOR] initializeLayers: Complete in ${(performance.now() - initStart).toFixed(1)}ms`);
    }

    /**
     * Get default color for a layer type
     * Every tile must have a valid color - no empty/transparent tiles allowed
     */
    getDefaultColorForLayer(layerType) {
        switch(layerType) {
            case 'Height':
                return '#0a0a0a'; // Height_0
            case 'Difficulty':
                return '#90ee90'; // Difficulty_Easy
            case 'Hazard':
                return '#1a1a1a'; // Hazard_None
            case 'Sky':
                return '#d3d3d3'; // Biome_SkyEmpty
            case 'Floor':
                return '#ff6b6b'; // Biome_ShowFloor
            case 'Underground':
                return '#2f2f2f'; // Biome_Blocked
            default:
                return '#000000'; // Fallback
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const container = document.getElementById('canvas-container');

        // Store bound document event handlers for cleanup
        this.boundDocumentMouseMove = (e) => this.onMouseMove(e);
        this.boundDocumentMouseUp = (e) => this.onMouseUp(e);

        // Mouse events
        container.addEventListener('mousedown', (e) => this.onMouseDown(e));
        container.addEventListener('mousemove', (e) => this.onMouseMove(e));
        container.addEventListener('mouseup', (e) => this.onMouseUp(e));
        container.addEventListener('mouseleave', (e) => this.onMouseLeave(e));

        // Escape key to cancel drawing operations
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && (this.isMouseDown || this.isPanning)) {
                this.cancelOperation();
            }
        });

        // Safety cleanup when page visibility changes (tab switch, minimize)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && (this.isMouseDown || this.isPanning)) {
                this.cancelOperation();
            }
        });

        // Prevent context menu
        container.addEventListener('contextmenu', (e) => e.preventDefault());

        // Window resize (debounced to prevent spam)
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                console.log('[EDITOR] Window resize - updating canvas');
                this.resizeCanvas();
            }, 100);
        });

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
        const resizeStart = performance.now();
        console.log(`[EDITOR] resizeCanvas() starting...`);

        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();
        console.log(`[EDITOR] Container size: ${rect.width}x${rect.height}`);

        // CRITICAL FIX: Canvas should be viewport size, NOT grid size!
        // The old code used Math.max(rect, grid) which made huge canvases (8192x8192)
        // This broke viewport culling and rendered ALL tiles instead of visible ones
        this.gridCanvas.width = rect.width;
        this.gridCanvas.height = rect.height;

        this.previewCanvas.width = this.gridCanvas.width;
        this.previewCanvas.height = this.gridCanvas.height;

        this.minimapCanvas.width = 190;
        this.minimapCanvas.height = 190;

        console.log(`[EDITOR] Canvases resized, calling render()...`);
        let t0 = performance.now();
        this.render();
        console.log(`[EDITOR] render() completed in ${(performance.now() - t0).toFixed(1)}ms`);

        t0 = performance.now();
        this.renderMinimap();
        console.log(`[EDITOR] renderMinimap() completed in ${(performance.now() - t0).toFixed(1)}ms`);

        console.log(`[EDITOR] resizeCanvas() complete in ${(performance.now() - resizeStart).toFixed(1)}ms`);
    }

    /**
     * Mouse event handlers
     */
    onMouseDown(e) {
        console.log(`[MOUSE] onMouseDown: button=${e.button}, tool=${this.currentTool?.name}`);
        const rect = this.gridCanvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
        this.updateGridPosition();

        // Right-click behavior depends on current tool
        if (e.button === 2) {
            e.preventDefault();
            console.log(`[MOUSE] Right-click at grid (${this.gridX}, ${this.gridY}), tool=${this.currentTool?.name}`);
            const inBounds = this.gridX >= 0 && this.gridY >= 0 &&
                this.gridX < this.layerManager.width &&
                this.gridY < this.layerManager.height;

            if (inBounds) {
                // For drawing tools (pencil, bucket, line, rectangle), right-click picks color
                const colorPickTools = ['pencil', 'bucket', 'line', 'rectangle'];
                if (colorPickTools.includes(this.currentTool?.name)) {
                    console.log(`[MOUSE] Right-click color pick for tool: ${this.currentTool.name}`);
                    this.pickColorAtPosition(this.gridX, this.gridY);
                }
                // For other tools, do nothing on canvas right-click
                // (color locking only happens from palette right-click now)
            }
            return;
        }

        // Middle mouse button or Space+Left click for panning
        if (e.button === 1 || (e.button === 0 && this.spacePressed)) {
            console.log(`[MOUSE] Starting pan`);
            this.isPanning = true;
            this.panStartX = this.mouseX - this.offsetX;
            this.panStartY = this.mouseY - this.offsetY;
            this.gridCanvas.style.cursor = 'grabbing';

            // Attach document-level listeners to track mouse outside canvas
            document.addEventListener('mousemove', this.boundDocumentMouseMove);
            document.addEventListener('mouseup', this.boundDocumentMouseUp);
            return;
        }

        // Left mouse for tool
        if (e.button === 0) {
            console.log(`[MOUSE] Left-click with tool ${this.currentTool?.name} at grid (${this.gridX}, ${this.gridY})`);
            this.isMouseDown = true;
            this.isDrawing = true; // Mark as drawing for performance optimization

            // Attach document-level listeners to track mouse outside canvas
            document.addEventListener('mousemove', this.boundDocumentMouseMove);
            document.addEventListener('mouseup', this.boundDocumentMouseUp);

            if (this.gridX >= 0 && this.gridY >= 0) {
                // CRITICAL FIX: Save state BEFORE drawing starts, not after!
                // We must capture the state before any modifications
                console.log(`[MOUSE] Saving state and calling tool.onMouseDown`);
                this.saveState();
                this.currentTool.onMouseDown(this, this.gridX, this.gridY, e);
                console.log(`[MOUSE] Tool.onMouseDown complete, requesting render`);
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

        // Allow tools to track mouse even when outside canvas bounds
        // Tools will naturally clamp to valid coordinates when drawing
        if (this.isMouseDown) {
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
        // If clicking on a UI element (button, input, etc), don't intercept the event
        // This allows tile inspector close button and other UI elements to work
        const target = e.target;
        if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.closest('.floating-panel'))) {
            // Remove document-level listeners but don't process the event
            document.removeEventListener('mousemove', this.boundDocumentMouseMove);
            document.removeEventListener('mouseup', this.boundDocumentMouseUp);

            // Reset state but let the UI element handle the click
            this.isMouseDown = false;
            this.isPanning = false;
            this.isDrawing = false;
            this.gridCanvas.style.cursor = 'crosshair';
            return;
        }

        // Remove document-level listeners when operation completes
        document.removeEventListener('mousemove', this.boundDocumentMouseMove);
        document.removeEventListener('mouseup', this.boundDocumentMouseUp);

        if (this.isPanning) {
            this.isPanning = false;
            this.gridCanvas.style.cursor = 'crosshair';
            return;
        }

        // Allow tools to complete even when mouse is outside canvas bounds
        if (this.isMouseDown) {
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
        // Don't cancel operations if we're actively drawing or panning
        // Document-level listeners will handle completion
        if (!this.isMouseDown && !this.isPanning) {
            this.clearPreview();
            this.clearLayerHoverHighlight();
            this.lastPreviewX = -1;
            this.lastPreviewY = -1;
        }
    }

    /**
     * Cancel current drawing/panning operation
     * Called when Escape is pressed or tab is switched
     */
    cancelOperation() {
        // Remove document-level listeners
        document.removeEventListener('mousemove', this.boundDocumentMouseMove);
        document.removeEventListener('mouseup', this.boundDocumentMouseUp);

        // Reset state
        this.isMouseDown = false;
        this.isPanning = false;
        this.isDrawing = false;
        this.gridCanvas.style.cursor = 'crosshair';

        // Clear visual feedback
        this.clearPreview();
        this.clearLayerHoverHighlight();

        // Re-render to clean up any partial drawing
        this.requestRender();
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
        this.updateViewportFromMinimap(e, false); // Update minimap to show viewport position
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
     * Uses bottom-left origin: Y=0 at BOTTOM, Y increases UPWARD
     */
    updateViewportFromMinimap(e, skipMinimap = false) {
        const rect = this.minimapCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Calculate scale factors using DISPLAYED size (rect), not internal resolution
        // This is critical because CSS may scale the canvas differently than its internal size
        const scaleX = this.layerManager.width / rect.width;
        const scaleY = this.layerManager.height / rect.height;

        // Convert minimap click to render-space coordinates
        // The minimap is rendered with the same Y orientation as the main canvas
        const renderX = clickX * scaleX;
        const renderY = clickY * scaleY;

        // Center viewport on clicked position
        const container = document.getElementById('canvas-container');
        const containerRect = container.getBoundingClientRect();

        const centerOffsetX = (containerRect.width / 2) / (this.tileSize * this.zoom);
        const centerOffsetY = (containerRect.height / 2) / (this.tileSize * this.zoom);

        this.offsetX = -(renderX - centerOffsetX) * this.tileSize * this.zoom;
        this.offsetY = -(renderY - centerOffsetY) * this.tileSize * this.zoom;

        this.requestRender();
        if (!skipMinimap) {
            this.requestMinimapRender();
        }
    }

    /**
     * Update grid position from mouse position
     * Uses bottom-left origin: Y=0 at BOTTOM, Y increases UPWARD
     */
    updateGridPosition() {
        const worldX = (this.mouseX - this.offsetX) / (this.tileSize * this.zoom);
        const worldY = (this.mouseY - this.offsetY) / (this.tileSize * this.zoom);

        this.gridX = Math.floor(worldX);
        // Flip Y: screen Y increases downward, but grid Y should increase upward
        this.gridY = this.layerManager.height - 1 - Math.floor(worldY);

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
     * Prioritizes the main selected layer (blue outline), then falls back to other visible layers
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

        const key = `${x},${y}`;

        // PRIORITY 1: Check the main selected layer first (blue outline - most recently selected)
        if (this.recentLayerSelections && this.recentLayerSelections.length > 0) {
            const mainSelectedIndex = this.recentLayerSelections[0];
            const mainLayer = this.layerManager.layers[mainSelectedIndex];
            if (mainLayer && mainLayer.visible) {
                const color = mainLayer.tileData.get(key);
                if (color && color !== '#000000') {
                    foundLayerIndex = mainSelectedIndex;
                    foundColor = color;
                }
            }
        }

        // PRIORITY 2: If main selected layer has no data, check secondary selected (green outline)
        if (foundLayerIndex < 0 && this.recentLayerSelections && this.recentLayerSelections.length > 1) {
            const secondaryIndex = this.recentLayerSelections[1];
            const secondaryLayer = this.layerManager.layers[secondaryIndex];
            if (secondaryLayer && secondaryLayer.visible) {
                const color = secondaryLayer.tileData.get(key);
                if (color && color !== '#000000') {
                    foundLayerIndex = secondaryIndex;
                    foundColor = color;
                }
            }
        }

        // PRIORITY 3: Fall back to searching all visible layers in order
        if (foundLayerIndex < 0) {
            for (let i = 0; i < this.layerManager.layers.length; i++) {
                const layer = this.layerManager.layers[i];
                if (!layer.visible) continue;

                const color = layer.tileData.get(key);
                if (color && color !== '#000000') {
                    foundLayerIndex = i;
                    foundColor = color;
                    break;
                }
            }
        }

        // Update the UI to highlight the found layer
        this.updateLayerHoverHighlight(foundLayerIndex);

        // Update status bar with hover info
        if (foundLayerIndex >= 0 && foundColor) {
            const layer = this.layerManager.layers[foundLayerIndex];
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

        // Entrance/Exit pairs for automatic placement
        // Maps entrance color -> exit color and vice versa
        const entranceExitPairs = {
            '#3b82f6': '#1e40af', // SCP Entrance -> SCP Exit
            '#1e40af': '#3b82f6', // SCP Exit -> SCP Entrance
            '#9ca3af': '#4b5563', // Car Park Entrance -> Car Park Exit
            '#4b5563': '#9ca3af'  // Car Park Exit -> Car Park Entrance
        };

        // Entrances go down (place exit on layer below)
        const entranceColors = ['#3b82f6', '#9ca3af'];
        // Exits go up (place entrance on layer above)
        const exitColors = ['#1e40af', '#4b5563'];

        let skippedLocked = 0;
        const placedColor = this.selectedTileset.color.toLowerCase();
        const pairedColor = entranceExitPairs[placedColor];

        for (const tile of tiles) {
            // Check if existing tile has a locked color
            const key = `${tile.x},${tile.y}`;
            const existingColor = layer.tileData.get(key);
            if (existingColor && this.lockedColors.has(existingColor.toLowerCase())) {
                skippedLocked++;
                continue; // Skip tiles with locked colors
            }
            layer.setTile(tile.x, tile.y, this.selectedTileset.value, this.selectedTileset);

            // Auto-place paired entrance/exit on adjacent layer (if enabled)
            const autoEntranceExit = document.getElementById('auto-entrance-exit');
            if (pairedColor && autoEntranceExit && autoEntranceExit.checked) {
                const layerIndex = this.layerManager.layers.indexOf(layer);
                let targetLayerIndex = -1;

                // Determine target layer based on whether this is an entrance or exit
                if (entranceColors.includes(placedColor)) {
                    // Entrance placed - put exit on layer below (higher index)
                    targetLayerIndex = layerIndex + 1;
                } else if (exitColors.includes(placedColor)) {
                    // Exit placed - put entrance on layer above (lower index)
                    targetLayerIndex = layerIndex - 1;
                }

                // Place on target layer if it's a valid biome layer (Sky, Floor, Underground)
                if (targetLayerIndex >= 0 && targetLayerIndex < this.layerManager.layers.length) {
                    const targetLayer = this.layerManager.layers[targetLayerIndex];
                    const validLayerTypes = ['Sky', 'Floor', 'Underground'];

                    if (targetLayer && validLayerTypes.includes(targetLayer.layerType) &&
                        !targetLayer.locked && targetLayer.editable) {
                        // Check if target tile is locked
                        const targetExistingColor = targetLayer.tileData.get(key);
                        if (!targetExistingColor || !this.lockedColors.has(targetExistingColor.toLowerCase())) {
                            targetLayer.setTile(tile.x, tile.y, 0, { color: pairedColor });
                        }
                    }
                }
            }
        }

        // Show feedback if tiles were skipped due to locked colors
        if (skippedLocked > 0 && !this.isDrawing) {
            document.getElementById('status-message').textContent = `Skipped ${skippedLocked} locked tile(s)`;
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
        }

        // Defer layer panel updates during active drawing for performance
        if (this.isDrawing) {
            this.needsLayerPanelUpdate = true;
        } else if (typeof window.updateLayersPanel === 'function') {
            window.updateLayersPanel();
        }
    }

    /**
     * Clear tiles (used by eraser) - paints the layer's default color
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

        // Get the default color for this layer type
        const defaultColor = this.getDefaultColorForLayer(layer.layerType);

        let skippedLocked = 0;
        for (const tile of tiles) {
            // Check if existing tile has a locked color
            const key = `${tile.x},${tile.y}`;
            const existingColor = layer.tileData.get(key);
            if (existingColor && this.lockedColors.has(existingColor.toLowerCase())) {
                skippedLocked++;
                continue; // Skip tiles with locked colors
            }
            // Paint with default color instead of clearing
            layer.setTile(tile.x, tile.y, 0, { color: defaultColor });
        }

        // Show feedback if tiles were skipped due to locked colors
        if (skippedLocked > 0 && !this.isDrawing) {
            document.getElementById('status-message').textContent = `Skipped ${skippedLocked} locked tile(s)`;
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
        }

        // Defer layer panel updates during active drawing for performance
        if (this.isDrawing) {
            this.needsLayerPanelUpdate = true;
        } else if (typeof window.updateLayersPanel === 'function') {
            window.updateLayersPanel();
        }
    }

    /**
     * Toggle lock state for a color
     * @param {string} color - The hex color to lock/unlock (e.g., "#ff0000")
     * @returns {boolean} - New lock state (true = locked)
     */
    toggleColorLock(color) {
        const normalizedColor = color.toLowerCase();
        if (this.lockedColors.has(normalizedColor)) {
            this.lockedColors.delete(normalizedColor);
            return false;
        } else {
            this.lockedColors.add(normalizedColor);
            return true;
        }
    }

    /**
     * Check if a color is locked
     * @param {string} color - The hex color to check
     * @returns {boolean} - True if locked
     */
    isColorLocked(color) {
        return this.lockedColors.has(color.toLowerCase());
    }

    /**
     * Lock a specific color
     * @param {string} color - The hex color to lock
     */
    lockColor(color) {
        this.lockedColors.add(color.toLowerCase());
    }

    /**
     * Unlock a specific color
     * @param {string} color - The hex color to unlock
     */
    unlockColor(color) {
        this.lockedColors.delete(color.toLowerCase());
    }

    /**
     * Clear all color locks
     */
    clearAllColorLocks() {
        this.lockedColors.clear();
        // Update palette UI
        document.querySelectorAll('.color-item').forEach(item => {
            item.classList.remove('locked');
        });
        document.getElementById('status-message').textContent = 'All colors unlocked';
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 1500);
    }

    /**
     * Check if any POI colors are currently locked
     * @returns {boolean} True if at least one POI is locked
     */
    hasLockedPOI() {
        for (const color of this.pointsOfInterest) {
            if (this.lockedColors.has(color)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Lock all Points of Interest colors
     */
    lockAllPOI() {
        for (const color of this.pointsOfInterest) {
            this.lockedColors.add(color);
            // Update palette UI
            const colorItem = document.querySelector(`.color-item[data-color="${color}"]`);
            if (colorItem) {
                colorItem.classList.add('locked');
            }
        }
        document.getElementById('status-message').textContent = `Locked ${this.pointsOfInterest.length} Points of Interest`;
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 2000);
    }

    /**
     * Unlock all Points of Interest colors (but keep other locks)
     */
    unlockAllPOI() {
        let unlocked = 0;
        for (const color of this.pointsOfInterest) {
            if (this.lockedColors.has(color)) {
                this.lockedColors.delete(color);
                unlocked++;
                // Update palette UI
                const colorItem = document.querySelector(`.color-item[data-color="${color}"]`);
                if (colorItem) {
                    colorItem.classList.remove('locked');
                }
            }
        }
        document.getElementById('status-message').textContent = `Unlocked ${unlocked} Points of Interest`;
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 2000);
    }

    /**
     * Pick the color at a specific grid position (eyedropper functionality)
     * Used by right-click on canvas with drawing tools
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     */
    pickColorAtPosition(x, y) {
        const layer = this.layerManager.getActiveLayer();
        if (!layer) {
            document.getElementById('status-message').textContent = 'No active layer';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
            return;
        }

        // Get the color directly from the layer's tile data
        const key = `${x},${y}`;
        const color = layer.tileData.get(key);

        if (color) {
            // Try to find the tileset from the color
            const enumData = window.colorMapper?.getEnumFromColor(color);
            if (enumData) {
                this.selectTileset(enumData.name);
                document.getElementById('status-message').textContent = `Picked: ${enumData.name}`;
            } else {
                // Color exists but no matching tileset - still show the color
                document.getElementById('status-message').textContent = `Picked color: ${color}`;
            }
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

    /**
     * Lock/unlock the color at a specific grid position
     * Used by right-click on canvas
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     */
    lockColorAtPosition(x, y) {
        console.log(`[LOCK] lockColorAtPosition called at (${x}, ${y})`);
        const layer = this.layerManager.getActiveLayer();
        if (!layer) {
            console.log(`[LOCK] No active layer`);
            document.getElementById('status-message').textContent = 'No active layer';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
            return;
        }

        const key = `${x},${y}`;
        const color = layer.tileData.get(key);
        console.log(`[LOCK] Color at position: "${color}"`);

        if (!color || color === '#000000') {
            document.getElementById('status-message').textContent = 'No tile at this position';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
            return;
        }

        // Toggle lock state
        const isLocked = this.toggleColorLock(color);
        console.log(`[LOCK] Color ${color} is now ${isLocked ? 'LOCKED' : 'UNLOCKED'}`);

        // Get tileset name for status message
        const enumData = window.colorMapper ? window.colorMapper.getEnumFromColor(color) : null;
        const displayName = enumData ? enumData.name : color;

        // Update palette UI to reflect lock state
        const colorItem = document.querySelector(`.color-item[data-color="${color.toLowerCase()}"]`);
        console.log(`[LOCK] Found palette item: ${colorItem ? 'yes' : 'no'}`);
        if (colorItem) {
            colorItem.classList.toggle('locked', isLocked);
        }

        // Show status message
        const statusMsg = isLocked
            ? `Locked: ${displayName} (cannot be painted over)`
            : `Unlocked: ${displayName}`;
        document.getElementById('status-message').textContent = statusMsg;
        console.log(`[LOCK] Status: ${statusMsg}`);

        // Update POI button state if available
        if (typeof window.updatePOIButton === 'function') {
            window.updatePOIButton();
        }
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 2000);

        console.log(`[EDITOR] Color ${isLocked ? 'locked' : 'unlocked'}: ${displayName} (${color})`);
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

            // Auto-adjust brush size for POIs
            const isPOI = this.pointsOfInterest.includes(tileset.color.toLowerCase());
            const brushSizeSlider = document.getElementById('brush-size');
            const brushSizeLabel = document.getElementById('brush-size-label');

            if (isPOI) {
                // Save current brush size and set to 1 for POIs
                if (this.brushSize > 1) {
                    this.prePOIBrushSize = this.brushSize;
                }
                this.brushSize = 1;
                if (brushSizeSlider) brushSizeSlider.value = 1;
                if (brushSizeLabel) brushSizeLabel.textContent = 'Brush Size: 1';
            } else if (this.prePOIBrushSize !== null) {
                // Restore previous brush size when selecting non-POI
                this.brushSize = this.prePOIBrushSize;
                if (brushSizeSlider) brushSizeSlider.value = this.prePOIBrushSize;
                if (brushSizeLabel) brushSizeLabel.textContent = `Brush Size: ${this.prePOIBrushSize}`;
                this.prePOIBrushSize = null;
            }
        }
    }

    /**
     * Set current tool
     */
    setTool(toolName) {
        console.log(`[EDITOR] setTool called with: ${toolName}`);
        if (tools[toolName]) {
            // Finalize any floating selection when switching away from selection tool
            if (this.currentTool.name === 'selection' && toolName !== 'selection') {
                if (this.currentTool.isFloating) {
                    console.log(`[EDITOR] Finalizing floating selection before switching tool`);
                    this.currentTool.finalizeSelection(this);
                }
            }

            // Save previous tool when switching to eyedropper (but not if we're already on eyedropper)
            if (toolName === 'eyedropper' && this.currentTool.name !== 'eyedropper') {
                this.previousTool = this.currentTool.name;
            }

            this.currentTool = tools[toolName];
            console.log(`[EDITOR] Tool switched to: ${this.currentTool.name}`);

            // Note: Shape options visibility is now handled by updateToolOptions() in app.js

            // Update cursor based on tool
            const container = document.getElementById('canvas-container');
            if (toolName === 'pan') {
                container.style.cursor = 'grab';
            } else if (toolName === 'selection') {
                container.style.cursor = 'crosshair';
            } else {
                container.style.cursor = 'crosshair';
            }
        } else {
            console.warn(`[EDITOR] setTool: Unknown tool "${toolName}"`);
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

        // Calculate zoom to fit with padding
        const padding = 20; // 20px padding on each side
        const availableWidth = rect.width - (padding * 2);
        const availableHeight = rect.height - (padding * 2);

        const zoomX = availableWidth / gridWidth;
        const zoomY = availableHeight / gridHeight;

        // Use the smaller zoom to ensure entire grid fits
        this.zoom = Math.min(zoomX, zoomY);

        // Center the grid in the container
        this.offsetX = (rect.width - gridWidth * this.zoom) / 2;
        this.offsetY = (rect.height - gridHeight * this.zoom) / 2;

        document.getElementById('zoom-level').textContent = `${Math.round(this.zoom * 100)}%`;
        this.resizeCanvas();
        this.render();
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
        const renderStart = performance.now();
        console.log(`[RENDER] render() STARTING...`);

        const ctx = this.gridCtx;
        const width = this.gridCanvas.width;
        const height = this.gridCanvas.height;

        // Clear background
        console.log(`[RENDER] Step 1: Clearing ${width}x${height} canvas...`);
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(0, 0, width, height);
        console.log(`[RENDER] Step 1: Done in ${(performance.now() - renderStart).toFixed(1)}ms`);

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.zoom, this.zoom);

        // Render layers in selection order (most recently selected on top)
        // Bottom-most visible layer is always full opacity, top layers use global opacity
        const visibleLayers = [];

        // Sort visible layers by recent selection order
        // Start with oldest selections, end with most recent (so most recent renders on top)
        for (let i = this.recentLayerSelections.length - 1; i >= 0; i--) {
            const layerIndex = this.recentLayerSelections[i];
            const layer = this.layerManager.layers[layerIndex];
            if (layer && layer.visible) {
                visibleLayers.push(layer);
            }
        }

        console.log(`[RENDER] Step 2: Rendering ${visibleLayers.length} visible layers...`);
        for (let i = 0; i < visibleLayers.length; i++) {
            const layer = visibleLayers[i];
            // First layer rendered (i===0) is the bottom-most, should be opaque
            // Later layers (i>0) are on top, should use opacity slider
            const isBottomLayer = (i === 0);

            // Bottom layer always at full opacity, others use global opacity
            ctx.globalAlpha = isBottomLayer ? 1.0 : this.topLayerOpacity;
            console.log(`[RENDER] Step 2.${i + 1}: Rendering layer "${layer.name}" (${layer.tileData.size} tiles)...`);
            const layerStart = performance.now();
            this.renderLayer(ctx, layer);
            console.log(`[RENDER] Step 2.${i + 1}: Layer "${layer.name}" done in ${(performance.now() - layerStart).toFixed(1)}ms`);
        }
        console.log(`[RENDER] Step 2: All layers done in ${(performance.now() - renderStart).toFixed(1)}ms`);

        ctx.globalAlpha = 1.0;

        // Render grid boundary (visible border around the actual grid)
        console.log(`[RENDER] Step 3: Rendering grid boundary...`);
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2 / this.zoom;
        ctx.strokeRect(0, 0, this.layerManager.width * this.tileSize, this.layerManager.height * this.tileSize);

        // Render grid lines
        if (this.showGrid && this.zoom >= 0.5) {
            console.log(`[RENDER] Step 4: Rendering grid lines...`);
            this.renderGrid(ctx);
        }

        // Render guide lines (composition grid)
        if (this.showGuides) {
            console.log(`[RENDER] Step 5: Rendering guide lines...`);
            this.renderGuideLines(ctx);
        }

        // Render maze overlay
        if (this.mazeVisualizer && this.mazeVisualizer.enabled) {
            console.log(`[RENDER] Step 6: Rendering maze overlay...`);
            this.mazeVisualizer.renderOverlay(ctx);
        }

        // Render ruler measurement
        if (this.currentTool && this.currentTool.name === 'ruler') {
            this.renderRulerMeasurement(ctx);
        }

        // Render POI labels (if any are enabled in dropdown)
        this.renderPOILabels(ctx);

        ctx.restore();

        // Update statistics
        console.log(`[RENDER] Step 7: Updating statistics...`);
        this.updateStatistics();

        // Log render time
        const renderTime = performance.now() - renderStart;
        console.log(`[RENDER] render() COMPLETE in ${renderTime.toFixed(1)}ms`);
    }

    /**
     * Render a single layer using offscreen canvas caching (like Photoshop)
     * PERFORMANCE: Renders to cache once, then blits cached canvas (extremely fast!)
     */
    renderLayer(ctx, layer) {
        const renderStart = performance.now();

        // Initialize cache canvas if needed
        if (!layer.cacheCanvas) {
            console.log(`[RENDER] Layer "${layer.name}": Initializing cache canvas...`);
            const initStart = performance.now();
            layer.initCacheCanvas(this.tileSize);
            console.log(`[RENDER] Layer "${layer.name}": Cache canvas initialized in ${(performance.now() - initStart).toFixed(1)}ms`);
        }

        // Update cache if dirty (full render) OR if there are dirty tiles (incremental)
        if (layer.cacheDirty || layer.dirtyTiles.size > 0) {
            const cacheStart = performance.now();
            const isDirty = layer.cacheDirty;
            const dirtyCount = layer.dirtyTiles.size;
            console.log(`[RENDER] Layer "${layer.name}": Updating cache (fullRender=${isDirty}, dirtyTiles=${dirtyCount})...`);
            layer.renderToCache();
            console.log(`[RENDER] Layer "${layer.name}": Cache updated in ${(performance.now() - cacheStart).toFixed(1)}ms`);
        }

        // SUPER FAST: Just copy the cached canvas! No tile iteration needed!
        // This is how professional paint programs work (Photoshop, Krita, etc.)
        if (layer.cacheCanvas) {
            ctx.drawImage(layer.cacheCanvas, 0, 0);
        }

        // Only log if render took significant time
        const renderTime = performance.now() - renderStart;
        if (renderTime > 10) {
            console.log(`[RENDER] Layer "${layer.name}": Total render time ${renderTime.toFixed(1)}ms`);
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
     * Render guide lines (composition grid/viewfinder)
     */
    renderGuideLines(ctx) {
        const gridWidth = this.layerManager.width * this.tileSize;
        const gridHeight = this.layerManager.height * this.tileSize;

        ctx.strokeStyle = 'rgba(255, 165, 0, 0.6)'; // Orange with transparency
        ctx.lineWidth = 2 / this.zoom;
        ctx.setLineDash([10 / this.zoom, 10 / this.zoom]); // Dashed line

        ctx.beginPath();

        // Horizontal guide lines
        for (let i = 1; i < this.guideHorizontal; i++) {
            const y = (gridHeight / this.guideHorizontal) * i;
            ctx.moveTo(0, y);
            ctx.lineTo(gridWidth, y);
        }

        // Vertical guide lines
        for (let i = 1; i < this.guideVertical; i++) {
            const x = (gridWidth / this.guideVertical) * i;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, gridHeight);
        }

        ctx.stroke();
        ctx.setLineDash([]); // Reset to solid line
    }

    /**
     * Render ruler measurement line and label
     */
    renderRulerMeasurement(ctx) {
        if (!this.currentTool || this.currentTool.name !== 'ruler') return;

        const measurement = this.currentTool.getMeasurement();
        if (!measurement) return;

        const { x1, y1, x2, y2, distance } = measurement;
        const tileSize = this.tileSize;

        // Calculate pixel positions (center of tiles)
        const px1 = x1 * tileSize + tileSize / 2;
        const py1 = y1 * tileSize + tileSize / 2;
        const px2 = x2 * tileSize + tileSize / 2;
        const py2 = y2 * tileSize + tileSize / 2;

        // Draw measurement line
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 3 / this.zoom;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        ctx.lineTo(px2, py2);
        ctx.stroke();

        // Draw end markers
        const markerSize = 8 / this.zoom;
        ctx.fillStyle = '#ff6b6b';

        // Start marker
        ctx.beginPath();
        ctx.arc(px1, py1, markerSize, 0, Math.PI * 2);
        ctx.fill();

        // End marker
        ctx.beginPath();
        ctx.arc(px2, py2, markerSize, 0, Math.PI * 2);
        ctx.fill();

        // Draw distance label
        const midX = (px1 + px2) / 2;
        const midY = (py1 + py2) / 2;
        const labelText = `${distance} tiles`;

        // Label background
        ctx.font = `bold ${14 / this.zoom}px sans-serif`;
        const textWidth = ctx.measureText(labelText).width;
        const padding = 6 / this.zoom;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(
            midX - textWidth / 2 - padding,
            midY - 10 / this.zoom - padding,
            textWidth + padding * 2,
            20 / this.zoom + padding
        );

        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, midX, midY);
    }

    /**
     * Render POI labels on the canvas
     * Shows names, warnings for unpaired entrances/exits, and metadata for certain POIs
     * Only shows labels for the active (primary) layer
     */
    renderPOILabels(ctx) {
        // Check master toggle first
        const showPOILabels = document.getElementById('show-poi-labels');
        if (showPOILabels && !showPOILabels.checked) return;

        const tileSize = this.tileSize;

        // POI colors and their display names, with dropdown data-poi attribute
        const poiInfo = {
            '#00ff7f': { name: 'Spawn', type: 'poi', poiId: 'spawn' },
            '#f59e0b': { name: 'Map', type: 'poi', poiId: 'map' },
            '#bb8fce': { name: 'Help Point', type: 'metadata', poiId: 'help-point' },
            '#3b82f6': { name: 'SCP Entrance', type: 'entrance', pair: '#1e40af', poiId: 'scp-entrance' },
            '#1e40af': { name: 'SCP Exit', type: 'exit', pair: '#3b82f6', poiId: 'scp-exit' },
            '#fbbf24': { name: 'SCP Power', type: 'poi', poiId: 'scp-power' },
            '#9ca3af': { name: 'Car Park Entrance', type: 'entrance', pair: '#4b5563', poiId: 'carpark-entrance' },
            '#4b5563': { name: 'Car Park Exit', type: 'exit', pair: '#9ca3af', poiId: 'carpark-exit' },
            '#9370db': { name: 'Lost & Found', type: 'metadata', poiId: 'lost-found' },
            '#8b4513': { name: 'Abandoned Camp', type: 'metadata', poiId: 'abandoned-camp' }
        };

        // Get enabled POIs from dropdown
        const enabledPOIs = new Set();
        const poiMenu = document.getElementById('poi-label-menu');
        if (poiMenu) {
            poiMenu.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                enabledPOIs.add(cb.dataset.poi);
            });
        }

        // If no POIs enabled, don't render anything
        if (enabledPOIs.size === 0) return;

        // Difficulty and Height color mappings for metadata display
        const difficultyNames = {
            '#90ee90': 'Easy',
            '#ffd700': 'Normal',
            '#ff8c00': 'Hard',
            '#ff6347': 'Nightmare',
            '#8b0000': 'Apocalypse'
        };

        const heightNames = {
            '#0a0a0a': '0', '#1a1a2e': '1', '#525d6b': '2', '#778994': '3', '#9db5bd': '4',
            '#b0cbd1': '5', '#c3e1e6': '6', '#d6f5fa': '7', '#e8f7fa': '8', '#ffffff': '9'
        };

        // Find Difficulty and Height layers
        const difficultyLayer = this.layerManager.layers.find(l => l.layerType === 'Difficulty');
        const heightLayer = this.layerManager.layers.find(l => l.layerType === 'Height');

        // Only show labels for the active (primary) layer
        const activeLayer = this.layerManager.getActiveLayer();
        if (!activeLayer || !['Sky', 'Floor', 'Underground'].includes(activeLayer.layerType)) {
            return;
        }

        // First, scan ALL biome layers to build entrance/exit position maps for pairing check
        const allEntrancePositions = new Map(); // color -> Set of "x,y" positions
        const allExitPositions = new Map(); // color -> Set of "x,y" positions

        for (const layer of this.layerManager.layers) {
            if (!['Sky', 'Floor', 'Underground'].includes(layer.layerType)) continue;

            for (const [key, color] of layer.tileData.entries()) {
                const normalizedColor = color.toLowerCase();
                const info = poiInfo[normalizedColor];
                if (!info) continue;

                if (info.type === 'entrance') {
                    if (!allEntrancePositions.has(normalizedColor)) {
                        allEntrancePositions.set(normalizedColor, new Set());
                    }
                    allEntrancePositions.get(normalizedColor).add(key);
                } else if (info.type === 'exit') {
                    if (!allExitPositions.has(normalizedColor)) {
                        allExitPositions.set(normalizedColor, new Set());
                    }
                    allExitPositions.get(normalizedColor).add(key);
                }
            }
        }

        // Now collect POIs from active layer only for display
        const pois = [];

        for (const [key, color] of activeLayer.tileData.entries()) {
            const normalizedColor = color.toLowerCase();
            const info = poiInfo[normalizedColor];
            if (!info) continue;

            // Skip if this POI type is not enabled in dropdown
            if (!enabledPOIs.has(info.poiId)) continue;

            const [x, y] = key.split(',').map(Number);

            // Get metadata for certain POIs
            let metadata = '';
            if (info.type === 'metadata') {
                const parts = [];
                if (difficultyLayer) {
                    const diffColor = difficultyLayer.tileData.get(key);
                    if (diffColor) {
                        const diffName = difficultyNames[diffColor.toLowerCase()];
                        if (diffName) parts.push(diffName);
                    }
                }
                if (heightLayer) {
                    const hColor = heightLayer.tileData.get(key);
                    if (hColor) {
                        const hName = heightNames[hColor.toLowerCase()];
                        if (hName !== undefined) parts.push(`H${hName}`);
                    }
                }
                if (parts.length > 0) {
                    metadata = ` (${parts.join(', ')})`;
                }
            }

            pois.push({
                x, y, color: normalizedColor, info, key, metadata, layer: activeLayer.layerType
            });
        }

        // Check for unpaired entrances/exits using ALL layers data
        const warnings = new Set();
        for (const [entranceColor, positions] of allEntrancePositions) {
            const info = poiInfo[entranceColor];
            if (!info || !info.pair) continue;
            const exitColor = info.pair;
            const exits = allExitPositions.get(exitColor) || new Set();

            for (const pos of positions) {
                if (!exits.has(pos)) {
                    warnings.add(pos + ':entrance:' + entranceColor);
                }
            }
        }

        for (const [exitColor, positions] of allExitPositions) {
            const info = poiInfo[exitColor];
            if (!info || !info.pair) continue;
            const entranceColor = info.pair;
            const entrances = allEntrancePositions.get(entranceColor) || new Set();

            for (const pos of positions) {
                if (!entrances.has(pos)) {
                    warnings.add(pos + ':exit:' + exitColor);
                }
            }
        }

        // Render labels
        const fontSize = Math.max(10, 12 / this.zoom);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        for (const poi of pois) {
            const px = poi.x * tileSize + tileSize / 2;
            // Flip Y coordinate (grid Y=0 is bottom, canvas Y=0 is top)
            const flippedY = this.layerManager.height - 1 - poi.y;
            const py = flippedY * tileSize + tileSize + 1;

            // Check for warning
            let hasWarning = false;
            let warningType = '';
            if (poi.info.type === 'entrance') {
                if (warnings.has(poi.key + ':entrance:' + poi.color)) {
                    hasWarning = true;
                    warningType = 'No Exit!';
                }
            } else if (poi.info.type === 'exit') {
                if (warnings.has(poi.key + ':exit:' + poi.color)) {
                    hasWarning = true;
                    warningType = 'No Entrance!';
                }
            }

            // Build label text
            let labelText = poi.info.name + poi.metadata;
            if (hasWarning) {
                labelText += ` [${warningType}]`;
            }

            // Measure text for background
            const textMetrics = ctx.measureText(labelText);
            const textWidth = textMetrics.width;
            const textHeight = fontSize + 2;
            const padding = 2;

            // Position label just below the tile
            const labelX = px - textWidth / 2 - padding;
            const labelY = py - padding;

            // Draw background with tile's color (semi-transparent)
            ctx.fillStyle = poi.color;
            ctx.globalAlpha = 0.4;
            ctx.fillRect(
                labelX,
                labelY,
                textWidth + padding * 2,
                textHeight + padding * 2
            );
            ctx.globalAlpha = 1.0;

            // Draw border - red if warning, otherwise subtle dark
            ctx.strokeStyle = hasWarning ? '#ff0000' : 'rgba(0, 0, 0, 0.5)';
            ctx.lineWidth = hasWarning ? 2 : 1;
            ctx.strokeRect(
                labelX,
                labelY,
                textWidth + padding * 2,
                textHeight + padding * 2
            );

            // Draw text with shadow for readability
            ctx.fillStyle = '#000000';
            ctx.fillText(labelText, px + 1, py + 1);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(labelText, px, py);
        }
    }

    /**
     * Render preview overlay
     * OPTIMIZED: Use Path2D batching for performance
     */
    renderPreview() {
        const ctx = this.previewCtx;
        ctx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);

        // Allow preview rendering even when mouse is outside canvas bounds
        // Tools will naturally handle coordinates appropriately
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
        // Flip Y: grid Y=0 is at bottom, but canvas Y=0 is at top
        if (normalTiles.length > 0) {
            const path = new Path2D();
            for (const tile of normalTiles) {
                path.rect(tile.x * this.tileSize, (this.layerManager.height - 1 - tile.y) * this.tileSize, this.tileSize, this.tileSize);
            }

            if (this.currentTool.name === 'eraser') {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            } else {
                ctx.fillStyle = this.selectedTileset ? this.selectedTileset.color + '80' : 'rgba(255, 255, 255, 0.3)';
            }
            ctx.fill(path);
        }

        // Render floating selection tiles (can't batch due to different colors)
        // Flip Y: grid Y=0 is at bottom, but canvas Y=0 is at top
        for (const tile of floatingTiles) {
            ctx.fillStyle = tile.tileset.color + 'CC';
            ctx.fillRect(tile.x * this.tileSize, (this.layerManager.height - 1 - tile.y) * this.tileSize, this.tileSize, this.tileSize);
        }

        // Render outline tiles (can't batch due to setLineDash)
        // Flip Y: grid Y=0 is at bottom, but canvas Y=0 is at top
        if (outlineTiles.length > 0) {
            ctx.strokeStyle = '#4a9eff';
            ctx.lineWidth = 2 / this.zoom;
            ctx.setLineDash([4 / this.zoom, 4 / this.zoom]);
            for (const tile of outlineTiles) {
                ctx.strokeRect(tile.x * this.tileSize, (this.layerManager.height - 1 - tile.y) * this.tileSize, this.tileSize, this.tileSize);
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

        // Render layers in selection order (same as main canvas)
        // Most recently selected layer renders on top
        const visibleLayers = [];
        for (let i = this.recentLayerSelections.length - 1; i >= 0; i--) {
            const layerIndex = this.recentLayerSelections[i];
            const layer = this.layerManager.layers[layerIndex];
            if (layer && layer.visible) {
                visibleLayers.push(layer);
            }
        }

        for (let layerIdx = 0; layerIdx < visibleLayers.length; layerIdx++) {
            const layer = visibleLayers[layerIdx];
            // First layer rendered (layerIdx===0) is the bottom-most, should be opaque
            // Later layers (layerIdx>0) are on top, should use opacity slider
            const isBottomLayer = (layerIdx === 0);

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
                        // Flip Y for minimap: grid Y=0 is at bottom, but minimap Y=0 is at top
                        ctx.fillRect(
                            x * scaleX,
                            (layer.height - 1 - y) * scaleY,
                            sampleRate * scaleX + 1,
                            sampleRate * scaleY + 1
                        );
                    }
                }
            }
        }

        ctx.globalAlpha = 1.0;

        // Draw viewport rectangle
        // The cache/render space and minimap share the same Y orientation (Y=0 at top)
        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();

        // Calculate viewport bounds in cache tile coordinates
        const rawViewportX = -this.offsetX / (this.tileSize * this.zoom);
        const rawViewportY = -this.offsetY / (this.tileSize * this.zoom);
        const viewportWidthTiles = rect.width / (this.tileSize * this.zoom);
        const viewportHeightTiles = rect.height / (this.tileSize * this.zoom);

        // Clamp to grid bounds for accurate rectangle
        const viewportX = Math.max(0, rawViewportX) * scaleX;
        const viewportY = Math.max(0, rawViewportY) * scaleY;
        const viewportRight = Math.min(this.layerManager.width, rawViewportX + viewportWidthTiles);
        const viewportBottom = Math.min(this.layerManager.height, rawViewportY + viewportHeightTiles);
        const viewportWidth = Math.max(0, viewportRight - Math.max(0, rawViewportX)) * scaleX;
        const viewportHeight = Math.max(0, viewportBottom - Math.max(0, rawViewportY)) * scaleY;

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
     * Save state for undo (per-layer: only saves active layer's state)
     * PERFORMANCE: Direct Map cloning is 10-100x faster than exportData + JSON.stringify
     */
    saveState() {
        const layer = this.layerManager.getActiveLayer();
        if (!layer) return;

        // Save state to the active layer's own undo stack
        const state = {
            // Deep clone the Map - much faster than exporting to array + JSON
            tileData: new Map(layer.tileData)
        };

        layer.undoStack.push(state);

        if (layer.undoStack.length > layer.maxHistorySize) {
            layer.undoStack.shift();
        }

        layer.redoStack = [];
        this.updateUndoRedoButtons();
    }

    /**
     * Undo last action (per-layer: only restores active layer)
     */
    undo() {
        const layer = this.layerManager.getActiveLayer();
        if (!layer || layer.undoStack.length === 0) return;

        // Save current state to redo stack (using optimized Map cloning)
        const currentState = {
            tileData: new Map(layer.tileData)
        };
        layer.redoStack.push(currentState);

        // Restore previous state directly from Maps
        const previousState = layer.undoStack.pop();

        // Clone the Map data
        layer.tileData = new Map(previousState.tileData);

        // CRITICAL: Invalidate cache after restoring data
        layer.cacheDirty = true;

        this.render();
        this.renderMinimap();
        this.updateUndoRedoButtons();
        this.isDirty = true;
    }

    /**
     * Redo last undone action (per-layer: only restores active layer)
     */
    redo() {
        const layer = this.layerManager.getActiveLayer();
        if (!layer || layer.redoStack.length === 0) return;

        // Save current state to undo stack (using optimized Map cloning)
        const currentState = {
            tileData: new Map(layer.tileData)
        };
        layer.undoStack.push(currentState);

        // Restore next state directly from Maps
        const nextState = layer.redoStack.pop();

        // Clone the Map data
        layer.tileData = new Map(nextState.tileData);

        // CRITICAL: Invalidate cache after restoring data
        layer.cacheDirty = true;

        this.render();
        this.renderMinimap();
        this.updateUndoRedoButtons();
        this.isDirty = true;
    }

    /**
     * Update undo/redo button states (per-layer: checks active layer's stacks)
     */
    updateUndoRedoButtons() {
        const layer = this.layerManager.getActiveLayer();
        if (!layer) {
            document.getElementById('btn-undo').disabled = true;
            document.getElementById('btn-redo').disabled = true;
            return;
        }

        document.getElementById('btn-undo').disabled = layer.undoStack.length === 0;
        document.getElementById('btn-redo').disabled = layer.redoStack.length === 0;
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
