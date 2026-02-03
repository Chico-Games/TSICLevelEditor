/**
 * maze-visualizer.js
 *
 * Visualization layer for maze generation system.
 * Renders flood fill regions and maze data in multiple modes.
 *
 * Technical Spec Reference: Section 5.0 - Visualization
 */

/**
 * Manages visualization of flood fill regions and maze generation.
 * Integrates with editor rendering pipeline to display:
 * - Flood fill regions (color-coded)
 * - Maze direction arrows
 * - Wall visualization
 * - Connection lines
 *
 * @class MazeVisualizerManager
 */
class MazeVisualizerManager {
    /**
     * Creates a new MazeVisualizerManager instance.
     *
     * @param {Object} editor - Reference to the main editor instance
     */
    constructor(editor) {
        this.editor = editor;
        this.enabled = false;
        this.visualizationMode = 'regions'; // 'off', 'regions', 'arrows', 'walls', 'connections'
        this.floodFillResults = new Map(); // layerIndex -> FFloodFillResults
        this.mazeData = new Map();          // layerIndex -> Uint8Array
        this.regionColorCache = new Map();  // regionIndex -> color string

        // Selected layer (only one at a time now)
        this.selectedLayer = null;

        // Find Floor layer and set as default
        const floorLayerIndex = this.editor.layerManager.layers.findIndex(l =>
            l.layerType && l.layerType.toLowerCase() === 'floor'
        );
        if (floorLayerIndex >= 0) {
            this.selectedLayer = floorLayerIndex;
        } else {
            // Fallback to first layer if no Floor layer found
            this.selectedLayer = 0;
        }

        // Maze generation settings
        this.settings = {
            borderBiomes: new Set(['Biome_Blocked', 'Biome_Pit', 'Biome_SkyCeiling']),
            maxHeightDiff: 1,  // Default max height difference (1 for stricter terrain separation)
            seed: 12345,
            treatEdgesAsBorders: false  // World edges already handled by bounds checking
        };
    }

    /**
     * Regenerate flood fill and maze data for a specific layer.
     *
     * Technical Spec Reference: Section 3.1 - Flood Fill Algorithm
     * Technical Spec Reference: Section 4.0 - Maze Generation
     *
     * @param {number} layerIndex - Index of layer to regenerate
     */
    regenerateForLayer(layerIndex) {
        try {
            const layer = this.editor.layerManager.layers[layerIndex];
            if (!layer) {
                console.warn(`Layer ${layerIndex} not found`);
                return;
            }

            // Extract layer data (biomes)
            const { biomeMap, width, height } = this.extractLayerData(layer);

            // Extract height data from Height layer
            const heightMap = this.extractHeightFromLayers();

            // Debug: Log biome distribution
            const biomeCount = {};
            for (const biome of biomeMap) {
                biomeCount[biome] = (biomeCount[biome] || 0) + 1;
            }
            console.log(`[Maze Visualizer] Layer ${layerIndex} (${layer.name}) biome distribution:`, biomeCount);
            console.log(`[Maze Visualizer] Border biomes:`, Array.from(this.settings.borderBiomes));
            console.log(`[Maze Visualizer] Max height diff:`, this.settings.maxHeightDiff);

            // Check if any biomes in the map match border biomes
            const matchingBorderBiomes = Object.keys(biomeCount).filter(b =>
                this.settings.borderBiomes.has(b)
            );
            console.log(`[Maze Visualizer] Border biomes found in map:`, matchingBorderBiomes);
            if (matchingBorderBiomes.length === 0) {
                console.warn(`[Maze Visualizer] WARNING: No border biomes found in map! All biomes will connect.`);
                console.warn(`[Maze Visualizer] Consider adding some biomes to border list, or reduce maxHeightDiff`);
            }

            // Check height distribution
            const heightCounts = {};
            for (const h of heightMap) {
                heightCounts[h] = (heightCounts[h] || 0) + 1;
            }
            const uniqueHeights = Object.keys(heightCounts).length;
            console.log(`[Maze Visualizer] Height distribution: ${uniqueHeights} unique heights`, heightCounts);

            // Calculate min adjacent height difference
            let minAdjDiff = Infinity;
            const sortedHeights = Object.keys(heightCounts).map(Number).sort((a, b) => a - b);
            for (let i = 1; i < sortedHeights.length; i++) {
                const diff = sortedHeights[i] - sortedHeights[i-1];
                minAdjDiff = Math.min(minAdjDiff, diff);
            }
            console.log(`[Maze Visualizer] Minimum adjacent height difference: ${minAdjDiff}`);
            console.log(`[Maze Visualizer] With maxHeightDiff=${this.settings.maxHeightDiff}, heights differing by >${this.settings.maxHeightDiff} won't connect`);

            // Run flood fill
            const floodFillEngine = new FloodFillEngine();
            const settings = {
                borderBiomes: this.settings.borderBiomes,
                maxHeightDiff: this.settings.maxHeightDiff,
                treatEdgesAsBorders: this.settings.treatEdgesAsBorders
            };
            const floodFillResults = floodFillEngine.performFloodFill(
                heightMap,
                biomeMap,
                settings,
                width
            );

            console.log(`[Maze Visualizer] Flood fill complete: ${floodFillResults.regions.length} regions found`);

            // Build regionMap for rendering (maps tile index -> region index)
            const totalTiles = width * height;
            const regionMap = new Int32Array(totalTiles);
            regionMap.fill(-1); // -1 = not in any region
            for (let regionIndex = 0; regionIndex < floodFillResults.regions.length; regionIndex++) {
                const region = floodFillResults.regions[regionIndex];
                for (const tileIndex of region.tileIndices) {
                    regionMap[tileIndex] = regionIndex;
                }
            }

            // Build regionSizes array for quick lookup
            const regionSizes = floodFillResults.regions.map(r => r.regionSize);

            // Add regionMap and regionSizes to results
            floodFillResults.regionMap = regionMap;
            floodFillResults.regionSizes = regionSizes;

            // Store flood fill results
            this.floodFillResults.set(layerIndex, floodFillResults);

            // Generate maze data for each region
            const mazeGenerator = new MazeGenerator();
            const mazeData = new Uint8Array(totalTiles); // Initialize with all zeros

            // Generate maze for each region
            for (const region of floodFillResults.regions) {
                console.log(`[Maze Visualizer] Generating maze for region with ${region.tileIndices.length} tiles...`);

                try {
                    const regionMazeData = mazeGenerator.generateMaze(
                        region.tileIndices,
                        width,
                        height,
                        this.settings.seed
                    );

                    // Copy region maze data into the full maze array
                    for (let i = 0; i < regionMazeData.length; i++) {
                        if (regionMazeData[i] !== 0) {
                            mazeData[i] = regionMazeData[i];
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to generate maze for region with ${region.tileIndices.length} tiles:`, error.message);
                }
            }

            // Store maze data
            this.mazeData.set(layerIndex, mazeData);

            // Count how many tiles have maze data
            let tilesWithMaze = 0;
            for (let i = 0; i < mazeData.length; i++) {
                if (mazeData[i] !== 0) {
                    tilesWithMaze++;
                }
            }

            console.log(`[Maze Visualizer] Generated maze for layer ${layerIndex}:`);
            console.log(`  - Total tiles in world: ${totalTiles}`);
            console.log(`  - Tiles in regions: ${floodFillResults.tilesInRegions}`);
            console.log(`  - Tiles with maze data: ${tilesWithMaze}`);
            console.log(`  - Coverage: ${(tilesWithMaze / totalTiles * 100).toFixed(1)}%`);
        } catch (error) {
            console.error(`Error regenerating layer ${layerIndex}:`, error);
        }
    }

    /**
     * Regenerate flood fill and maze data for the selected layer.
     */
    regenerateAll() {
        if (this.selectedLayer !== null) {
            this.regenerateForLayer(this.selectedLayer);
        }
    }

    /**
     * Set which layer to visualize (by layer type name).
     * @param {string} layerType - 'floor', 'underground', or 'sky'
     */
    setSelectedLayer(layerType) {
        const layerIndex = this.editor.layerManager.layers.findIndex(l =>
            l.layerType && l.layerType.toLowerCase() === layerType.toLowerCase()
        );

        if (layerIndex >= 0) {
            this.selectedLayer = layerIndex;
            console.log(`[Maze Visualizer] Switched to layer: ${layerType} (index ${layerIndex})`);
        } else {
            console.warn(`[Maze Visualizer] Layer type '${layerType}' not found`);
        }
    }

    /**
     * Extract biome data from a layer.
     * Uses sparse Map iteration for efficiency.
     *
     * Technical Spec Reference: Section 2.1 - Layer Data Extraction
     *
     * @param {Object} layer - Layer object to extract from
     * @returns {{biomeMap: Array<string>, width: number, height: number}} Extracted data
     */
    extractLayerData(layer) {
        const width = layer.width;
        const height = layer.height;
        const totalTiles = width * height;

        // Initialize with defaults
        const biomeMap = new Array(totalTiles);
        biomeMap.fill('Biome_None');

        // Extract biome data using sparse iteration
        for (const [key, color] of layer.tileData.entries()) {
            const [x, y] = key.split(',').map(Number);
            const index = y * width + x;

            const enumData = window.colorMapper.getEnumFromColor(color);
            if (enumData && enumData.category === 'Biomes') {
                biomeMap[index] = enumData.name;
            }
        }

        return { biomeMap, width, height };
    }

    /**
     * Extract height data from the Height layer if it exists.
     * Returns default heights if no Height layer is present.
     *
     * Technical Spec Reference: Section 2.2 - Height Data Extraction
     *
     * @returns {Uint8Array} Height values for each tile
     */
    extractHeightFromLayers() {
        const heightLayer = this.editor.layerManager.layers.find(l =>
            l.layerType && l.layerType.toLowerCase() === 'height'
        );

        if (!heightLayer) {
            // No height layer - return default heights
            console.warn('[Maze Visualizer] No Height layer found - using default height 64');
            const totalTiles = this.editor.layerManager.width * this.editor.layerManager.height;
            const heightMap = new Uint8Array(totalTiles);
            heightMap.fill(64); // Default to ground level
            return heightMap;
        }

        const width = heightLayer.width;
        const height = heightLayer.height;
        const totalTiles = width * height;
        const heightMap = new Uint8Array(totalTiles);
        heightMap.fill(64); // Default fill

        console.log(`[Maze Visualizer] Height layer found: ${heightLayer.name}`);
        console.log(`[Maze Visualizer] Height layer has ${heightLayer.tileData.size} tiles`);

        let tilesExtracted = 0;
        const heightValueCounts = {};

        for (const [key, color] of heightLayer.tileData.entries()) {
            const [x, y] = key.split(',').map(Number);
            const index = y * width + x;

            const enumData = window.colorMapper.getEnumFromColor(color);
            if (enumData && enumData.category === 'Height') {
                heightMap[index] = enumData.value;
                heightValueCounts[enumData.value] = (heightValueCounts[enumData.value] || 0) + 1;
                tilesExtracted++;
            } else {
                // Log why it failed (first 5 only)
                if (tilesExtracted < 5) {
                    console.warn(`[Maze Visualizer] Failed to extract height for tile at (${x},${y}), color=${color}, enumData=`, enumData);
                }
            }
        }

        console.log(`[Maze Visualizer] Extracted heights from ${tilesExtracted} tiles`);
        console.log(`[Maze Visualizer] Height value distribution:`, heightValueCounts);
        console.log(`[Maze Visualizer] Remaining ${totalTiles - tilesExtracted} tiles have default height 64`);

        return heightMap;
    }

    /**
     * Main rendering function called from editor.render().
     * Handles viewport culling and mode dispatching.
     *
     * Technical Spec Reference: Section 5.1 - Rendering Pipeline
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context to render to
     */
    renderOverlay(ctx) {
        if (!this.enabled || this.visualizationMode === 'off') return;

        const editor = this.editor;
        const worldHeight = editor.layerManager.height;

        // Calculate visible tile bounds (viewport culling)
        // Note: Rendering uses Y-flip (grid Y=0 at bottom, canvas Y=0 at top)
        // Canvas Y = (worldHeight - 1 - gridY) * tileSize * zoom + offsetY
        // So gridY = worldHeight - 1 - (canvasY - offsetY) / (tileSize * zoom)

        const startX = Math.max(0, Math.floor(-editor.offsetX / (editor.tileSize * editor.zoom)));
        const endX = Math.min(editor.layerManager.width,
                     startX + Math.ceil(editor.gridCanvas.width / (editor.tileSize * editor.zoom)) + 1);

        // For Y, we need to account for the flip
        // Canvas top (Y=0) corresponds to high grid Y
        // Canvas bottom (Y=canvas.height) corresponds to low grid Y
        const canvasTopGridY = worldHeight - 1 - Math.floor(-editor.offsetY / (editor.tileSize * editor.zoom));
        const canvasBottomGridY = worldHeight - 1 - Math.floor((-editor.offsetY + editor.gridCanvas.height) / (editor.tileSize * editor.zoom));

        const startY = Math.max(0, Math.min(canvasBottomGridY, canvasTopGridY) - 1);
        const endY = Math.min(worldHeight, Math.max(canvasBottomGridY, canvasTopGridY) + 2);

        // Render based on mode
        switch (this.visualizationMode) {
            case 'regions':
                this.renderRegionsMode(ctx, startX, startY, endX, endY);
                break;
            case 'arrows':
                this.renderArrowsMode(ctx, startX, startY, endX, endY);
                break;
            case 'walls':
                this.renderWallsMode(ctx, startX, startY, endX, endY);
                break;
            case 'connections':
                this.renderConnectionsMode(ctx, startX, startY, endX, endY);
                break;
        }
    }

    /**
     * Render flood fill regions as color-coded tiles.
     * Uses golden angle hue spacing for distinct colors.
     *
     * Technical Spec Reference: Section 5.2 - Region Visualization
     * Uses bottom-left origin: Y=0 at BOTTOM, Y increases UPWARD
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} startX - Visible start X tile
     * @param {number} startY - Visible start Y tile
     * @param {number} endX - Visible end X tile
     * @param {number} endY - Visible end Y tile
     */
    renderRegionsMode(ctx, startX, startY, endX, endY) {
        const editor = this.editor;
        const tileSize = editor.tileSize;  // Use base tile size (context is already scaled)
        const width = editor.layerManager.width;
        const height = editor.layerManager.height;

        // Render only the selected layer
        const layerIndex = this.selectedLayer;
        if (layerIndex === null) return;

        const floodFillResults = this.floodFillResults.get(layerIndex);
        if (!floodFillResults || !floodFillResults.regionMap) return;

        // Render visible tiles
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const index = y * width + x;
                const regionIndex = floodFillResults.regionMap[index];

                // Skip tiles not in any region
                if (regionIndex === -1) continue;

                // Get color for this region
                const color = this.getRegionColor(regionIndex);

                // Calculate world position (context already has transform applied)
                // Flip Y: grid Y=0 is at bottom, but canvas Y=0 is at top
                const worldX = x * tileSize;
                const worldY = (height - 1 - y) * tileSize;

                // Draw filled rectangle
                ctx.fillStyle = color;
                ctx.fillRect(worldX, worldY, tileSize, tileSize);
            }
        }
    }

    /**
     * Render maze directions as colored arrows.
     * Each direction has a unique color:
     * - North (bit 0): Green - points UP visually (toward larger grid Y)
     * - South (bit 1): Blue - points DOWN visually (toward smaller grid Y)
     * - East (bit 2): Red
     * - West (bit 3): Yellow
     *
     * Technical Spec Reference: Section 5.3 - Arrow Visualization
     * Uses bottom-left origin: Y=0 at BOTTOM, Y increases UPWARD
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} startX - Visible start X tile
     * @param {number} startY - Visible start Y tile
     * @param {number} endX - Visible end X tile
     * @param {number} endY - Visible end Y tile
     */
    renderArrowsMode(ctx, startX, startY, endX, endY) {
        const editor = this.editor;
        const tileSize = editor.tileSize;  // Use base tile size (context is already scaled)
        const width = editor.layerManager.width;
        const height = editor.layerManager.height;
        const arrowLength = tileSize * 0.3;

        // Render for each selected layer
        const layerIndex = this.selectedLayer;
        if (layerIndex === null) return;

        const mazeData = this.mazeData.get(layerIndex);
        if (!mazeData) return;

        // Render visible tiles
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const index = y * width + x;
                const directions = mazeData[index];

                // Skip tiles with no connections
                if (directions === 0) continue;

                // Calculate tile center in world coordinates
                // Flip Y: grid Y=0 is at bottom, but canvas Y=0 is at top
                const centerX = x * tileSize + tileSize / 2;
                const centerY = (height - 1 - y) * tileSize + tileSize / 2;

                // Draw arrows for each direction
                ctx.lineWidth = 2;

                // North (bit 0) - Green arrow pointing UP visually (negative canvas Y)
                // In bottom-up coords, North = toward larger grid Y = toward top of screen
                if (directions & 0b0001) {
                    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
                    this.drawArrow(ctx, centerX, centerY, centerX, centerY - arrowLength);
                }

                // South (bit 1) - Blue arrow pointing DOWN visually (positive canvas Y)
                // In bottom-up coords, South = toward smaller grid Y = toward bottom of screen
                if (directions & 0b0010) {
                    ctx.strokeStyle = 'rgba(0, 100, 255, 0.8)';
                    this.drawArrow(ctx, centerX, centerY, centerX, centerY + arrowLength);
                }

                // East (bit 2) - Red arrow right
                if (directions & 0b0100) {
                    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
                    this.drawArrow(ctx, centerX, centerY, centerX + arrowLength, centerY);
                }

                // West (bit 3) - Yellow arrow left
                if (directions & 0b1000) {
                    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
                    this.drawArrow(ctx, centerX, centerY, centerX - arrowLength, centerY);
                }
            }
        }
    }

    /**
     * Draw an arrow from (x1, y1) to (x2, y2).
     * Helper function for renderArrowsMode.
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x1 - Start X
     * @param {number} y1 - Start Y
     * @param {number} x2 - End X
     * @param {number} y2 - End Y
     */
    drawArrow(ctx, x1, y1, x2, y2) {
        const headLength = 5;  // Fixed size (context is already scaled)
        const angle = Math.atan2(y2 - y1, x2 - x1);

        // Draw line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Draw arrowhead
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
            x2 - headLength * Math.cos(angle - Math.PI / 6),
            y2 - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(x2, y2);
        ctx.lineTo(
            x2 - headLength * Math.cos(angle + Math.PI / 6),
            y2 - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
    }

    /**
     * Render walls where connections DON'T exist.
     * Draws black lines on edges without connections.
     *
     * Technical Spec Reference: Section 5.4 - Wall Visualization
     * Uses bottom-left origin: Y=0 at BOTTOM, Y increases UPWARD
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} startX - Visible start X tile
     * @param {number} startY - Visible start Y tile
     * @param {number} endX - Visible end X tile
     * @param {number} endY - Visible end Y tile
     */
    renderWallsMode(ctx, startX, startY, endX, endY) {
        const editor = this.editor;
        const tileSize = editor.tileSize;  // Use base tile size (context is already scaled)
        const width = editor.layerManager.width;
        const height = editor.layerManager.height;

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 2;

        // Render for each selected layer
        const layerIndex = this.selectedLayer;
        if (layerIndex === null) return;

        const mazeData = this.mazeData.get(layerIndex);
        if (!mazeData) return;

        ctx.beginPath();

        // Render visible tiles
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const index = y * width + x;
                const directions = mazeData[index];

                // Calculate world position
                // Flip Y: grid Y=0 is at bottom, but canvas Y=0 is at top
                const worldX = x * tileSize;
                const worldY = (height - 1 - y) * tileSize;

                // Draw wall on North edge if no North connection
                // North = top edge visually (smaller canvas Y)
                if (!(directions & 0b0001)) {
                    ctx.moveTo(worldX, worldY);
                    ctx.lineTo(worldX + tileSize, worldY);
                }

                // Draw wall on South edge if no South connection
                // South = bottom edge visually (larger canvas Y)
                if (!(directions & 0b0010)) {
                    ctx.moveTo(worldX, worldY + tileSize);
                    ctx.lineTo(worldX + tileSize, worldY + tileSize);
                }

                // Draw wall on East edge if no East connection
                if (!(directions & 0b0100)) {
                    ctx.moveTo(worldX + tileSize, worldY);
                    ctx.lineTo(worldX + tileSize, worldY + tileSize);
                }

                // Draw wall on West edge if no West connection
                if (!(directions & 0b1000)) {
                    ctx.moveTo(worldX, worldY);
                    ctx.lineTo(worldX, worldY + tileSize);
                }
            }
        }

        ctx.stroke();
    }

    /**
     * Render lines between connected tiles.
     * Only draws North and East connections to avoid duplication.
     *
     * Technical Spec Reference: Section 5.5 - Connection Visualization
     * Uses bottom-left origin: Y=0 at BOTTOM, Y increases UPWARD
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} startX - Visible start X tile
     * @param {number} startY - Visible start Y tile
     * @param {number} endX - Visible end X tile
     * @param {number} endY - Visible end Y tile
     */
    renderConnectionsMode(ctx, startX, startY, endX, endY) {
        const editor = this.editor;
        const tileSize = editor.tileSize;  // Use base tile size (context is already scaled)
        const width = editor.layerManager.width;
        const height = editor.layerManager.height;

        ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
        ctx.lineWidth = 1.5;

        // Render for each selected layer
        const layerIndex = this.selectedLayer;
        if (layerIndex === null) return;

        const mazeData = this.mazeData.get(layerIndex);
        if (!mazeData) return;

        ctx.beginPath();

        // Render visible tiles
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const index = y * width + x;
                const directions = mazeData[index];

                // Calculate tile center in world coordinates
                // Flip Y: grid Y=0 is at bottom, but canvas Y=0 is at top
                const centerX = x * tileSize + tileSize / 2;
                const centerY = (height - 1 - y) * tileSize + tileSize / 2;

                // Draw North connection (toward larger grid Y = toward top of screen)
                if ((directions & 0b0001) && y < height - 1) {
                    const neighborCenterY = (height - 1 - (y + 1)) * tileSize + tileSize / 2;
                    ctx.moveTo(centerX, centerY);
                    ctx.lineTo(centerX, neighborCenterY);
                }

                // Draw East connection
                if ((directions & 0b0100) && x < width - 1) {
                    const neighborCenterX = (x + 1) * tileSize + tileSize / 2;
                    ctx.moveTo(centerX, centerY);
                    ctx.lineTo(neighborCenterX, centerY);
                }
            }
        }

        ctx.stroke();
    }

    /**
     * Set the visualization mode.
     *
     * @param {string} mode - Mode to set ('off', 'regions', 'arrows', 'walls', 'connections')
     */
    setVisualizationMode(mode) {
        const validModes = ['off', 'regions', 'arrows', 'walls', 'connections'];
        if (!validModes.includes(mode)) {
            console.warn(`Invalid visualization mode: ${mode}`);
            return;
        }

        this.visualizationMode = mode;
        this.enabled = mode !== 'off';

        // Trigger redraw
        if (this.editor && this.editor.render) {
            this.editor.render();
        }
    }

    /**
     * Get region information at a specific tile position.
     * Used by tile inspector to show region data.
     *
     * @param {number} x - Tile X coordinate
     * @param {number} y - Tile Y coordinate
     * @param {number} layerIndex - Layer index
     * @returns {{regionIndex: number, regionSize: number}|null} Region info or null
     */
    getRegionAtPosition(x, y, layerIndex) {
        const floodFillResults = this.floodFillResults.get(layerIndex);
        if (!floodFillResults || !floodFillResults.regionMap) return null;

        const width = this.editor.layerManager.width;
        const index = y * width + x;
        const regionIndex = floodFillResults.regionMap[index];

        if (regionIndex === -1) return null;

        // Get region size
        const regionSize = floodFillResults.regionSizes[regionIndex] || 0;

        return {
            regionIndex,
            regionSize
        };
    }

    /**
     * Get maze direction data at a specific tile index.
     *
     * @param {number} index - Tile index
     * @param {number} layerIndex - Layer index
     * @returns {number} Direction bits (0-15)
     */
    getMazeDataAtIndex(index, layerIndex) {
        const mazeData = this.mazeData.get(layerIndex);
        if (!mazeData || index < 0 || index >= mazeData.length) return 0;

        return mazeData[index];
    }

    /**
     * Get a color for a region using golden angle hue spacing.
     * Colors are cached for performance.
     *
     * Technical Spec Reference: Section 5.6 - Color Generation
     *
     * @param {number} regionIndex - Region index
     * @returns {string} CSS color string
     */
    getRegionColor(regionIndex) {
        // Check cache
        if (this.regionColorCache.has(regionIndex)) {
            return this.regionColorCache.get(regionIndex);
        }

        // Golden angle hue spacing for distinct colors
        const hue = (regionIndex * 137.5) % 360;
        const saturation = 70;
        const lightness = 60;
        const alpha = 0.4;

        // Convert HSL to RGB
        const c = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
        const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
        const m = lightness / 100 - c / 2;

        let r, g, b;
        if (hue < 60) {
            [r, g, b] = [c, x, 0];
        } else if (hue < 120) {
            [r, g, b] = [x, c, 0];
        } else if (hue < 180) {
            [r, g, b] = [0, c, x];
        } else if (hue < 240) {
            [r, g, b] = [0, x, c];
        } else if (hue < 300) {
            [r, g, b] = [x, 0, c];
        } else {
            [r, g, b] = [c, 0, x];
        }

        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);

        const color = `rgba(${r}, ${g}, ${b}, ${alpha})`;

        // Cache the color
        this.regionColorCache.set(regionIndex, color);

        return color;
    }
}

// Export for use in browser
window.MazeVisualizerManager = MazeVisualizerManager;
