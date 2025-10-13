/**
 * Layer Manager
 * Manages multiple layers of tile data
 */

class Layer {
    constructor(name, width, height, options = {}) {
        this.name = name;
        this.width = width;
        this.height = height;
        this.visible = options.visible !== undefined ? options.visible : true;
        this.opacity = options.opacity !== undefined ? options.opacity : 1.0;
        this.locked = options.locked !== undefined ? options.locked : false;
        this.editable = options.editable !== undefined ? options.editable : true;
        this.showHeights = options.showHeights !== undefined ? options.showHeights : false;

        // TSIC integration: Layer type system
        this.layerType = options.layerType || 'generic'; // "biome" | "height" | "difficulty" | "hazard" | "generic"
        this.worldLayer = options.worldLayer || null;    // "Floor" | "Underground" | "Sky" | null
        this.required = options.required !== undefined ? options.required : false; // Required for export validation

        // Store tiles as a Map for efficient sparse storage
        // Key: "x,y", Value: { name, color, tag, height (optional) }
        this.tiles = new Map();
    }

    /**
     * Set a tile at position
     */
    setTile(x, y, tileset) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return false;
        }

        const key = `${x},${y}`;
        if (tileset === null) {
            this.tiles.delete(key);
        } else {
            this.tiles.set(key, { ...tileset });
        }
        return true;
    }

    /**
     * Get tile at position
     */
    getTile(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return null;
        }

        const key = `${x},${y}`;
        return this.tiles.get(key) || null;
    }

    /**
     * Clear tile at position
     */
    clearTile(x, y) {
        const key = `${x},${y}`;
        this.tiles.delete(key);
    }

    /**
     * Clear all tiles
     */
    clear() {
        this.tiles.clear();
    }

    /**
     * Resize layer
     */
    resize(newWidth, newHeight) {
        // Keep only tiles within new bounds
        const newTiles = new Map();
        for (const [key, value] of this.tiles.entries()) {
            const [x, y] = key.split(',').map(Number);
            if (x < newWidth && y < newHeight) {
                newTiles.set(key, value);
            }
        }
        this.tiles = newTiles;
        this.width = newWidth;
        this.height = newHeight;
    }

    /**
     * Get tile count
     */
    getTileCount() {
        return this.tiles.size;
    }

    /**
     * Export layer data
     */
    exportData() {
        const tilesArray = [];
        for (const [key, tileset] of this.tiles.entries()) {
            const [x, y] = key.split(',').map(Number);
            const tileData = {
                x,
                y,
                tag: tileset.tag,
                name: tileset.name
            };
            if (tileset.height !== undefined) {
                tileData.height = tileset.height;
            }
            tilesArray.push(tileData);
        }

        return {
            name: this.name,
            visible: this.visible,
            opacity: this.opacity,
            locked: this.locked,
            editable: this.editable,
            showHeights: this.showHeights,
            layerType: this.layerType,
            worldLayer: this.worldLayer,
            required: this.required,
            tiles: tilesArray
        };
    }

    /**
     * Import layer data
     */
    importData(data, configManager) {
        this.visible = data.visible !== undefined ? data.visible : true;
        this.opacity = data.opacity !== undefined ? data.opacity : 1.0;
        this.locked = data.locked !== undefined ? data.locked : false;
        this.editable = data.editable !== undefined ? data.editable : true;
        this.showHeights = data.showHeights !== undefined ? data.showHeights : false;
        this.layerType = data.layerType || 'generic';
        this.worldLayer = data.worldLayer || null;
        this.required = data.required !== undefined ? data.required : false;

        this.tiles.clear();
        if (data.tiles) {
            for (const tile of data.tiles) {
                // Look up tileset by tag or name
                let tileset = configManager.getTilesetByTag(tile.tag);
                if (!tileset) {
                    tileset = configManager.getTileset(tile.name);
                }

                if (tileset) {
                    this.setTile(tile.x, tile.y, tileset);
                }
            }
        }
    }

    /**
     * Clone layer
     */
    clone() {
        const newLayer = new Layer(this.name + ' Copy', this.width, this.height, {
            visible: this.visible,
            opacity: this.opacity,
            locked: this.locked,
            editable: this.editable,
            showHeights: this.showHeights,
            layerType: this.layerType,
            worldLayer: this.worldLayer,
            required: this.required
        });

        for (const [key, value] of this.tiles.entries()) {
            newLayer.tiles.set(key, { ...value });
        }

        return newLayer;
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
        const layer = new Layer(name, this.width, this.height, options);
        this.layers.push(layer);
        return layer;
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
     * Export all layers
     */
    exportData() {
        return {
            width: this.width,
            height: this.height,
            activeLayerIndex: this.activeLayerIndex,
            layers: this.layers.map(layer => layer.exportData())
        };
    }

    /**
     * Import layer data
     */
    importData(data, configManager) {
        this.width = data.width || this.width;
        this.height = data.height || this.height;
        this.layers = [];
        this.activeLayerIndex = data.activeLayerIndex || 0;

        if (data.layers) {
            for (const layerData of data.layers) {
                const layer = new Layer(layerData.name, this.width, this.height);
                layer.importData(layerData, configManager);
                this.layers.push(layer);
            }
        }

        if (this.layers.length === 0) {
            this.addLayer('Layer 1');
        }
    }
}
