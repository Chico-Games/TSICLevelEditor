/**
 * Layer Manager - Simplified Single Data Type System
 * Each layer contains ONE data map with tiles that have color metadata
 * Colors define what they represent (biome, height, difficulty, hazard)
 */

class WorldLayer {
    constructor(name, width, height, options = {}) {
        this.name = name;
        this.width = width;
        this.height = height;
        this.visible = options.visible !== undefined ? options.visible : true;
        this.opacity = options.opacity !== undefined ? options.opacity : 1.0;
        this.locked = options.locked !== undefined ? options.locked : false;
        this.editable = options.editable !== undefined ? options.editable : true;

        // Layer type: "Floor", "Sky", "Underground", "Hazard", etc.
        this.layerType = options.layerType || 'Floor';
        this.worldLayer = options.worldLayer || 'Floor';
        this.required = options.required !== undefined ? options.required : false;

        // Single data map: "x,y" -> color (hex string)
        // The color determines everything via colorMapper
        this.tileData = new Map();

        // Offscreen canvas cache for performance (like Photoshop layer caching)
        this.cacheCanvas = null;
        this.cacheCtx = null;
        this.cacheDirty = true; // Mark as needing full render initially
        this.dirtyTiles = new Set(); // Track individual dirty tiles for incremental updates
        this.tileSize = 16; // Default, will be updated by editor
    }

    /**
     * Set tile data at position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} value - Tile value (kept for backwards compatibility, not stored)
     * @param {object} tileset - Tileset object with color (only color is stored)
     */
    setTile(x, y, value, tileset = null) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return false;
        }

        const key = `${x},${y}`;
        if (tileset && tileset.color) {
            this.tileData.set(key, tileset.color.toLowerCase());
        } else {
            this.tileData.delete(key); // Remove if no color
        }

        // INCREMENTAL UPDATE: Only mark this specific tile as dirty
        this.dirtyTiles.add(key);
        return true;
    }

    /**
     * Get tile data at position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {object|null} - {value: number, tileset: object} or null (reconstructed from color)
     */
    getTile(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return null;
        }

        const key = `${x},${y}`;
        const color = this.tileData.get(key);

        if (!color || !window.colorMapper) return null;

        // Reconstruct tileset from color using colorMapper
        const enumData = window.colorMapper.getEnumFromColor(color);
        if (!enumData) return null;

        return {
            value: enumData.value,
            tileset: {
                name: enumData.name,
                color: color,
                value: enumData.value,
                category: enumData.category,
                tag: enumData.tag
            }
        };
    }

    /**
     * Clear tile at position
     */
    clearTile(x, y) {
        const key = `${x},${y}`;
        this.tileData.delete(key);

        // INCREMENTAL UPDATE: Only mark this specific tile as dirty
        this.dirtyTiles.add(key);
    }

    /**
     * Clear all tiles in layer
     */
    clear() {
        this.tileData.clear();
        this.cacheDirty = true; // Mark cache as needing update
    }

    /**
     * Resize layer (keeps data within new bounds)
     */
    resize(newWidth, newHeight) {
        const newMap = new Map();
        for (const [key, value] of this.tileData.entries()) {
            const [x, y] = key.split(',').map(Number);
            if (x < newWidth && y < newHeight) {
                newMap.set(key, value);
            }
        }
        this.tileData = newMap;
        this.width = newWidth;
        this.height = newHeight;

        // Cache needs to be resized and re-rendered
        if (this.cacheCanvas) {
            this.cacheCanvas.width = newWidth * this.tileSize;
            this.cacheCanvas.height = newHeight * this.tileSize;
        }
        this.cacheDirty = true;
    }

    /**
     * Get total tile count
     */
    getTileCount() {
        return this.tileData.size;
    }

    /**
     * Export to JSON-RLE format
     * Returns a single RLE array of colors
     */
    exportRLEData() {
        const totalTiles = this.width * this.height;
        const defaultColor = '#000000'; // Default empty color

        // Create color grid
        const colorGrid = new Array(totalTiles).fill(defaultColor);

        // Fill grid from tile data (which now only stores colors)
        for (const [key, color] of this.tileData.entries()) {
            const [x, y] = key.split(',').map(Number);
            const index = y * this.width + x;
            colorGrid[index] = color;
        }

        // Build palette: map of unique colors to indices
        const palette = [];
        const colorToIndex = new Map();

        for (const color of colorGrid) {
            if (!colorToIndex.has(color)) {
                colorToIndex.set(color, palette.length);
                palette.push(color);
            }
        }

        // Compress to RLE using palette indices
        const rle = [];
        let currentColor = colorGrid[0];
        let currentIndex = colorToIndex.get(currentColor);
        let count = 1;

        for (let i = 1; i < colorGrid.length; i++) {
            if (colorGrid[i] === currentColor) {
                count++;
            } else {
                // Store as [paletteIndex, count] array
                rle.push([currentIndex, count]);
                currentColor = colorGrid[i];
                currentIndex = colorToIndex.get(currentColor);
                count = 1;
            }
        }
        // Push last run
        rle.push([currentIndex, count]);

        return {
            layer_type: this.layerType,
            palette: palette,
            color_data: rle
        };
    }

    /**
     * Export to base64-RLE format (ultra-compact)
     * Returns RLE data encoded as base64 string
     */
    exportRLEDataBase64() {
        const totalTiles = this.width * this.height;
        const defaultColor = '#000000'; // Default empty color

        // Create color grid
        const colorGrid = new Array(totalTiles).fill(defaultColor);

        // Fill grid from tile data
        for (const [key, color] of this.tileData.entries()) {
            const [x, y] = key.split(',').map(Number);
            const index = y * this.width + x;
            colorGrid[index] = color;
        }

        // Build palette
        const palette = [];
        const colorToIndex = new Map();

        for (const color of colorGrid) {
            if (!colorToIndex.has(color)) {
                colorToIndex.set(color, palette.length);
                palette.push(color);
            }
        }

        // Compress to RLE using palette indices
        const rle = [];
        let currentColor = colorGrid[0];
        let currentIndex = colorToIndex.get(currentColor);
        let count = 1;

        for (let i = 1; i < colorGrid.length; i++) {
            if (colorGrid[i] === currentColor) {
                count++;
            } else {
                rle.push([currentIndex, count]);
                currentColor = colorGrid[i];
                currentIndex = colorToIndex.get(currentColor);
                count = 1;
            }
        }
        rle.push([currentIndex, count]);

        // Encode to base64 using base64RLEEncoder
        if (typeof base64RLEEncoder !== 'undefined') {
            return base64RLEEncoder.encodeLayer(rle, palette, this.layerType, this.width, this.height);
        } else {
            // Fallback to array format if encoder not available
            console.warn('base64RLEEncoder not available, using array format');
            return {
                layer_type: this.layerType,
                palette: palette,
                color_data: rle
            };
        }
    }

    /**
     * Import from JSON-RLE format (supports both array and base64 formats)
     */
    importRLEData(rleData, configManager) {
        this.clear();

        let colorData = null;
        let palette = null;

        // Check format: base64-RLE, palette-array, or old object format
        if (rleData.encoding === 'rle-base64-v1' && rleData.data_b64) {
            // Base64-RLE format (newest, most compact)
            if (typeof base64RLEEncoder !== 'undefined') {
                const decoded = base64RLEEncoder.decodeLayer(rleData);
                colorData = decoded.color_data;
                palette = decoded.palette;
            } else {
                console.error('base64RLEEncoder not available, cannot decode base64 format');
                return;
            }
        } else if (rleData.color_data) {
            // Array or object format
            colorData = rleData.color_data;
            palette = rleData.palette;
        } else {
            console.warn('[WorldLayer] No color_data or data_b64 in RLE data');
            return;
        }

        // Decompress RLE directly to tileData (avoid building massive intermediate array)
        const hasPalette = palette && Array.isArray(palette);
        const defaultColor = '#000000';
        const maxIndex = this.width * this.height;
        let currentIndex = 0;

        for (const entry of colorData) {
            let color, count;

            if (Array.isArray(entry)) {
                // Palette-array format: [paletteIndex, count]
                const [paletteIndex, runCount] = entry;
                color = hasPalette ? palette[paletteIndex] : defaultColor;
                count = runCount;
            } else {
                // Old object format: { color: "#rrggbb", count: n }
                color = entry.color;
                count = entry.count;
            }

            // Boundary check: silently truncate if we exceed grid size
            if (currentIndex >= maxIndex) {
                return;
            }

            // Clamp count to not exceed grid bounds
            const remainingTiles = maxIndex - currentIndex;
            const actualCount = Math.min(count, remainingTiles);

            // Skip default empty color - just advance the index
            if (color === defaultColor) {
                currentIndex += actualCount;
                continue;
            }

            // Set tiles for this run
            if (color && typeof color === 'string') {
                const normalizedColor = color.toLowerCase();
                for (let i = 0; i < actualCount; i++) {
                    const x = currentIndex % this.width;
                    const y = Math.floor(currentIndex / this.width);
                    const key = `${x},${y}`;
                    this.tileData.set(key, normalizedColor);
                    currentIndex++;
                }
            } else {
                currentIndex += actualCount;
            }
        }

        this.cacheDirty = true; // Invalidate cache after import
    }

    /**
     * Clone layer
     */
    clone() {
        const newLayer = new WorldLayer(this.name + ' Copy', this.width, this.height, {
            visible: this.visible,
            opacity: this.opacity,
            locked: this.locked,
            editable: this.editable,
            layerType: this.layerType,
            worldLayer: this.worldLayer,
            required: this.required
        });

        // Deep copy tile data (now just colors)
        for (const [key, color] of this.tileData.entries()) {
            newLayer.tileData.set(key, color);
        }

        return newLayer;
    }

    /**
     * Initialize or resize the cache canvas
     */
    initCacheCanvas(tileSize) {
        this.tileSize = tileSize;
        const pixelWidth = this.width * tileSize;
        const pixelHeight = this.height * tileSize;

        if (!this.cacheCanvas) {
            this.cacheCanvas = document.createElement('canvas');
            this.cacheCtx = this.cacheCanvas.getContext('2d', {
                willReadFrequently: false,
                alpha: true
            });
        }

        if (this.cacheCanvas.width !== pixelWidth || this.cacheCanvas.height !== pixelHeight) {
            this.cacheCanvas.width = pixelWidth;
            this.cacheCanvas.height = pixelHeight;
            this.cacheDirty = true;
        }
    }

    /**
     * Render this layer to its cache canvas
     * OPTIMIZATION: Incremental updates - only re-render changed tiles!
     */
    renderToCache() {
        if (!this.cacheCanvas) return;

        const ctx = this.cacheCtx;
        const tileSize = this.tileSize;

        // Full render needed (resize, import, etc.)
        if (this.cacheDirty) {
            // Clear the cache
            ctx.clearRect(0, 0, this.cacheCanvas.width, this.cacheCanvas.height);

            // Batch tiles by color for efficient rendering
            const colorBatches = new Map();

            // Iterate through ALL tiles once (expensive, but only on full render!)
            for (const [key, color] of this.tileData.entries()) {
                if (color && color !== '#000000') {
                    if (!colorBatches.has(color)) {
                        colorBatches.set(color, []);
                    }
                    const [x, y] = key.split(',').map(Number);
                    colorBatches.get(color).push({ x, y });
                }
            }

            // Render all tiles of same color together using Path2D
            for (const [color, tiles] of colorBatches.entries()) {
                ctx.fillStyle = color;
                const path = new Path2D();
                for (const tile of tiles) {
                    path.rect(tile.x * tileSize, tile.y * tileSize, tileSize, tileSize);
                }
                ctx.fill(path);
            }

            this.cacheDirty = false;
            this.dirtyTiles.clear(); // All tiles are now rendered
        }
        // Incremental update - only update changed tiles (FAST!)
        else if (this.dirtyTiles.size > 0) {
            // Update only the dirty tiles
            for (const key of this.dirtyTiles) {
                const [x, y] = key.split(',').map(Number);
                const pixelX = x * tileSize;
                const pixelY = y * tileSize;

                // Clear this tile's area
                ctx.clearRect(pixelX, pixelY, tileSize, tileSize);

                // Re-render this tile if it has data
                const color = this.tileData.get(key);
                if (color && color !== '#000000') {
                    ctx.fillStyle = color;
                    ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
                }
            }

            this.dirtyTiles.clear(); // All dirty tiles are now updated
        }
    }

    /**
     * Invalidate the cache (mark as dirty)
     */
    invalidateCache() {
        this.cacheDirty = true;
    }
}

class LayerManager {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.layers = [];
        this.activeLayerIndex = 0;
    }

    /**
     * Add a new layer
     */
    addLayer(name, options = {}) {
        const layer = new WorldLayer(name, this.width, this.height, options);
        this.layers.push(layer);
        return layer;
    }

    /**
     * Fill layer with default color
     * @param {WorldLayer} layer - The layer to fill
     * @param {string} defaultColor - The color to fill with (hex string)
     */
    fillLayerWithDefault(layer, defaultColor) {
        if (!layer || !defaultColor) return;

        for (let y = 0; y < layer.height; y++) {
            for (let x = 0; x < layer.width; x++) {
                const key = `${x},${y}`;
                layer.tileData.set(key, defaultColor.toLowerCase());
            }
        }

        // Mark cache as dirty after filling
        layer.cacheDirty = true;
    }

    /**
     * Remove layer by index
     */
    removeLayer(index) {
        if (index >= 0 && index < this.layers.length && this.layers.length > 1) {
            this.layers.splice(index, 1);
            if (this.activeLayerIndex >= this.layers.length) {
                this.activeLayerIndex = this.layers.length - 1;
            }
            return true;
        }
        return false;
    }

    /**
     * Get layer by index
     */
    getLayer(index) {
        return this.layers[index] || null;
    }

    /**
     * Get active layer
     */
    getActiveLayer() {
        return this.layers[this.activeLayerIndex] || null;
    }

    /**
     * Set active layer
     */
    setActiveLayer(index) {
        if (index >= 0 && index < this.layers.length) {
            this.activeLayerIndex = index;
            return true;
        }
        return false;
    }

    /**
     * Move layer
     */
    moveLayer(fromIndex, toIndex) {
        if (fromIndex >= 0 && fromIndex < this.layers.length &&
            toIndex >= 0 && toIndex < this.layers.length) {
            const layer = this.layers.splice(fromIndex, 1)[0];
            this.layers.splice(toIndex, 0, layer);

            if (this.activeLayerIndex === fromIndex) {
                this.activeLayerIndex = toIndex;
            }
            return true;
        }
        return false;
    }

    /**
     * Resize all layers
     */
    resize(newWidth, newHeight) {
        this.width = newWidth;
        this.height = newHeight;

        for (const layer of this.layers) {
            layer.resize(newWidth, newHeight);
        }
    }

    /**
     * Clear all layers
     */
    clearAll() {
        for (const layer of this.layers) {
            layer.clear();
        }
    }

    /**
     * Get total tile count across all layers
     */
    getTotalTileCount() {
        return this.layers.reduce((sum, layer) => sum + layer.getTileCount(), 0);
    }

    /**
     * Export to JSON-RLE format
     */
    exportRLEData(mapName = 'TSIC_Mall', description = 'Generated by Biome Level Editor', seed = null) {
        const metadata = {
            name: mapName,
            description: description,
            world_size: this.width,
            maze_generation_seed: seed || Math.floor(Math.random() * 2147483647)
        };

        const layers = this.layers.map(layer => layer.exportRLEData());

        return {
            metadata,
            layers
        };
    }

    /**
     * Export to base64-RLE format (ultra-compact)
     */
    exportRLEDataBase64(mapName = 'TSIC_Mall', description = 'Generated by Biome Level Editor', seed = null) {
        const metadata = {
            name: mapName,
            description: description,
            world_size: this.width,
            maze_generation_seed: seed || Math.floor(Math.random() * 2147483647),
            format_version: '2.0-base64'
        };

        const layers = this.layers.map(layer => layer.exportRLEDataBase64());

        return {
            metadata,
            layers
        };
    }

    /**
     * Import from JSON-RLE format (supports both array and base64 formats)
     */
    importRLEData(rleData, configManager) {
        if (!rleData || !rleData.metadata || !rleData.layers) {
            console.error('Invalid RLE data format');
            return false;
        }

        // Set grid size from metadata
        this.width = rleData.metadata.world_size;
        this.height = rleData.metadata.world_size;

        // Clear existing layers
        this.layers = [];
        this.activeLayerIndex = 0;

        // Import layers
        for (const layerData of rleData.layers) {
            const layerType = layerData.layer_type;
            const layer = new WorldLayer(layerType, this.width, this.height, {
                layerType: layerType,
                worldLayer: layerType,
                visible: true,
                opacity: 0.8
            });

            layer.importRLEData(layerData, configManager);
            this.layers.push(layer);
        }

        if (this.layers.length === 0) {
            this.addLayer('Floor', { layerType: 'Floor', worldLayer: 'Floor' });
        }

        return true;
    }

    /**
     * Export legacy format (for backwards compatibility)
     */
    exportData() {
        return {
            width: this.width,
            height: this.height,
            activeLayerIndex: this.activeLayerIndex,
            layers: this.layers.map(layer => ({
                name: layer.name,
                // visible: layer.visible,  // REMOVED: visibility is UI state, not data state
                opacity: layer.opacity,
                locked: layer.locked,
                editable: layer.editable,
                layerType: layer.layerType,
                worldLayer: layer.worldLayer,
                required: layer.required,
                tiles: Array.from(layer.tileData.entries()).map(([key, color]) => {
                    const [x, y] = key.split(',').map(Number);
                    // In color-only system, we store just colors
                    // Reconstruct value and tileset from color for backwards compatibility
                    let value = 0;
                    let tileset = null;
                    if (color && window.colorMapper) {
                        const enumData = window.colorMapper.getEnumFromColor(color);
                        if (enumData) {
                            value = enumData.value;
                            tileset = { color: color, ...enumData };
                        }
                    }
                    if (!tileset) {
                        tileset = { color: color };
                    }
                    return {
                        x,
                        y,
                        value,
                        tileset
                    };
                })
            }))
        };
    }

    /**
     * Import legacy format
     */
    importData(data, configManager) {
        this.width = data.width || this.width;
        this.height = data.height || this.height;
        this.layers = [];
        this.activeLayerIndex = data.activeLayerIndex || 0;

        if (data.layers) {
            for (const layerData of data.layers) {
                const layer = new WorldLayer(layerData.name, this.width, this.height, {
                    visible: layerData.visible !== undefined ? layerData.visible : true,
                    opacity: layerData.opacity !== undefined ? layerData.opacity : 1.0,
                    locked: layerData.locked !== undefined ? layerData.locked : false,
                    editable: layerData.editable !== undefined ? layerData.editable : true,
                    layerType: layerData.layerType || 'Floor',
                    worldLayer: layerData.worldLayer || 'Floor',
                    required: layerData.required !== undefined ? layerData.required : false
                });

                if (layerData.tiles) {
                    for (const tile of layerData.tiles) {
                        layer.setTile(tile.x, tile.y, tile.value, tile.tileset);
                    }
                }

                this.layers.push(layer);
            }
        }

        if (this.layers.length === 0) {
            this.addLayer('Floor', { layerType: 'Floor', worldLayer: 'Floor' });
        }
    }
}

// Backwards compatibility aliases
const Layer = WorldLayer;

// Export for testing
if (typeof window !== 'undefined') {
    window.WorldLayer = WorldLayer;
    window.Layer = Layer;
    window.LayerManager = LayerManager;
}
