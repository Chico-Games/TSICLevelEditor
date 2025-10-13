/**
 * PNG Export Module
 * Exports layers to PNG format for Unreal Engine world generation
 */

class PNGExporter {
    constructor(layerManager) {
        this.layerManager = layerManager;
    }

    /**
     * Export a single layer to PNG
     * @param {Layer} layer - The layer to export
     * @returns {Promise<Blob>} PNG blob
     */
    async exportLayerToPNG(layer) {
        const canvas = document.createElement('canvas');
        canvas.width = layer.width;
        canvas.height = layer.height;
        const ctx = canvas.getContext('2d', { alpha: false });

        // Fill with black background (empty tiles)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw tiles at 1:1 pixel ratio (each tile = 1 pixel)
        for (const [key, tileset] of layer.tiles.entries()) {
            const [x, y] = key.split(',').map(Number);
            ctx.fillStyle = tileset.color;
            ctx.fillRect(x, y, 1, 1);
        }

        // Convert canvas to PNG blob
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create PNG blob'));
                }
            }, 'image/png');
        });
    }

    /**
     * Export multiple layers by world layer
     * @param {string} worldLayer - "Floor", "Underground", or "Sky"
     * @returns {Promise<Object>} Map of layer types to PNG blobs
     */
    async exportWorldLayerToPNG(worldLayer) {
        const layers = this.layerManager.layers.filter(l => l.worldLayer === worldLayer);
        const exports = {};

        for (const layer of layers) {
            const blob = await this.exportLayerToPNG(layer);
            exports[layer.layerType] = {
                blob: blob,
                filename: `${worldLayer}_${layer.layerType}.png`,
                layer: layer
            };
        }

        return exports;
    }

    /**
     * Export all world layers to PNG files
     * @returns {Promise<Object>} Map of world layers to their PNG exports
     */
    async exportAllWorldLayers() {
        const worldLayers = ['Floor', 'Underground', 'Sky'];
        const exports = {};

        for (const worldLayer of worldLayers) {
            exports[worldLayer] = await this.exportWorldLayerToPNG(worldLayer);
        }

        return exports;
    }

    /**
     * Download a PNG blob as a file
     * @param {Blob} blob - The PNG blob
     * @param {string} filename - The filename to save as
     */
    downloadPNG(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Download all PNG files for a world layer
     * @param {string} worldLayer - "Floor", "Underground", or "Sky"
     */
    async downloadWorldLayer(worldLayer) {
        const exports = await this.exportWorldLayerToPNG(worldLayer);

        for (const [layerType, data] of Object.entries(exports)) {
            this.downloadPNG(data.blob, data.filename);

            // Small delay to prevent browser blocking multiple downloads
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    /**
     * Download all PNG files for all world layers
     */
    async downloadAllLayers() {
        const exports = await this.exportAllWorldLayers();

        for (const [worldLayer, layerExports] of Object.entries(exports)) {
            for (const [layerType, data] of Object.entries(layerExports)) {
                this.downloadPNG(data.blob, data.filename);

                // Small delay to prevent browser blocking multiple downloads
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    /**
     * Validate layer colors against Unreal Engine mappings
     * @param {Layer} layer - The layer to validate
     * @returns {Object} Validation result { valid: boolean, errors: [] }
     */
    validateLayerColors(layer) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        // Check if layer is empty
        if (layer.tiles.size === 0) {
            result.warnings.push(`Layer "${layer.name}" is empty`);
            return result;
        }

        // Get all unique colors used in the layer
        const usedColors = new Set();
        for (const [key, tileset] of layer.tiles.entries()) {
            usedColors.add(tileset.color.toUpperCase());
        }

        // TODO: Add validation against Unreal Engine color mappings
        // For now, just report what colors are used
        result.info = {
            tileCount: layer.tiles.size,
            uniqueColors: Array.from(usedColors)
        };

        return result;
    }

    /**
     * Get export statistics for a world layer
     * @param {string} worldLayer - "Floor", "Underground", or "Sky"
     * @returns {Object} Statistics about the export
     */
    getWorldLayerStats(worldLayer) {
        const layers = this.layerManager.layers.filter(l => l.worldLayer === worldLayer);
        const stats = {
            worldLayer: worldLayer,
            layers: {},
            totalTiles: 0,
            coverage: 0
        };

        for (const layer of layers) {
            const tileCount = layer.tiles.size;
            const maxTiles = layer.width * layer.height;
            const coverage = maxTiles > 0 ? (tileCount / maxTiles * 100).toFixed(2) : 0;

            stats.layers[layer.layerType] = {
                name: layer.name,
                tileCount: tileCount,
                coverage: coverage + '%',
                required: layer.required,
                isEmpty: tileCount === 0
            };

            stats.totalTiles += tileCount;
        }

        const maxTiles = this.layerManager.width * this.layerManager.height;
        stats.coverage = (stats.totalTiles / (maxTiles * layers.length) * 100).toFixed(2) + '%';

        return stats;
    }
}
