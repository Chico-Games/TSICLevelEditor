/**
 * Metadata Export Module
 * Exports map metadata and configuration for TSIC world generation
 */

class MetadataExporter {
    constructor(layerManager, configManager) {
        this.layerManager = layerManager;
        this.configManager = configManager;
    }

    /**
     * Generate metadata for export
     * @param {Object} options - Export options
     * @returns {Object} Metadata object
     */
    generateMetadata(options = {}) {
        const metadata = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            mapInfo: {
                width: this.layerManager.width,
                height: this.layerManager.height,
                seed: options.seed || this.generateSeed(),
                name: options.mapName || 'Unnamed Map'
            },
            worldLayers: {},
            statistics: {},
            compression: {}
        };

        // Generate data for each world layer
        const worldLayers = ['Floor', 'Underground', 'Sky'];
        for (const worldLayer of worldLayers) {
            metadata.worldLayers[worldLayer] = this.getWorldLayerMetadata(worldLayer);
            metadata.statistics[worldLayer] = this.getWorldLayerStatistics(worldLayer);
            metadata.compression[worldLayer] = this.estimateCompression(worldLayer);
        }

        return metadata;
    }

    /**
     * Get metadata for a specific world layer
     * @param {string} worldLayer - "Floor", "Underground", or "Sky"
     * @returns {Object} World layer metadata
     */
    getWorldLayerMetadata(worldLayer) {
        const layers = this.layerManager.layers.filter(l => l.worldLayer === worldLayer);
        const metadata = {
            layers: {},
            files: []
        };

        for (const layer of layers) {
            const filename = `${worldLayer}_${layer.layerType}.png`;
            metadata.layers[layer.layerType] = {
                name: layer.name,
                filename: filename,
                required: layer.required,
                tileCount: layer.tiles.size,
                layerType: layer.layerType
            };
            metadata.files.push(filename);
        }

        return metadata;
    }

    /**
     * Get statistics for a world layer
     * @param {string} worldLayer - "Floor", "Underground", or "Sky"
     * @returns {Object} Statistics
     */
    getWorldLayerStatistics(worldLayer) {
        const layers = this.layerManager.layers.filter(l => l.worldLayer === worldLayer);
        const stats = {
            totalTiles: 0,
            layerStats: {},
            colorDistribution: {}
        };

        for (const layer of layers) {
            const layerStats = {
                tileCount: layer.tiles.size,
                coverage: ((layer.tiles.size / (layer.width * layer.height)) * 100).toFixed(2),
                colors: {}
            };

            // Count color usage
            for (const [key, tileset] of layer.tiles.entries()) {
                const color = tileset.color.toUpperCase();
                layerStats.colors[color] = (layerStats.colors[color] || 0) + 1;
            }

            stats.layerStats[layer.layerType] = layerStats;
            stats.totalTiles += layer.tiles.size;

            // Aggregate color distribution
            for (const [color, count] of Object.entries(layerStats.colors)) {
                stats.colorDistribution[color] = (stats.colorDistribution[color] || 0) + count;
            }
        }

        return stats;
    }

    /**
     * Estimate RLE compression for a world layer
     * @param {string} worldLayer - "Floor", "Underground", or "Sky"
     * @returns {Object} Compression estimates
     */
    estimateCompression(worldLayer) {
        const layers = this.layerManager.layers.filter(l => l.worldLayer === worldLayer);
        const estimates = {
            uncompressed: 0,
            estimatedCompressed: 0,
            compressionRatio: 0,
            savings: 0
        };

        for (const layer of layers) {
            // Uncompressed: width * height * 3 bytes (RGB)
            const uncompressed = layer.width * layer.height * 3;

            // Estimate RLE compression based on tile coverage
            // Sparse maps compress better (more empty runs)
            const coverage = layer.tiles.size / (layer.width * layer.height);
            const estimatedRatio = 0.15 + (coverage * 0.35); // 15-50% of original size
            const estimatedCompressed = Math.ceil(uncompressed * estimatedRatio);

            estimates.uncompressed += uncompressed;
            estimates.estimatedCompressed += estimatedCompressed;
        }

        estimates.compressionRatio = (estimates.estimatedCompressed / estimates.uncompressed * 100).toFixed(2);
        estimates.savings = ((1 - estimates.estimatedCompressed / estimates.uncompressed) * 100).toFixed(2);

        // Format sizes
        estimates.uncompressedFormatted = this.formatBytes(estimates.uncompressed);
        estimates.estimatedCompressedFormatted = this.formatBytes(estimates.estimatedCompressed);

        return estimates;
    }

    /**
     * Generate a random seed for world generation
     * @returns {string} Random seed
     */
    generateSeed() {
        return Math.floor(Math.random() * 1000000000).toString();
    }

    /**
     * Format bytes to human-readable string
     * @param {number} bytes - Number of bytes
     * @returns {string} Formatted string
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Export metadata to JSON file
     * @param {Object} metadata - Metadata object
     * @param {string} filename - Filename to save as
     */
    downloadMetadata(metadata, filename = 'map.json') {
        const json = JSON.stringify(metadata); // Minified for smaller file size
        const blob = new Blob([json], { type: 'application/json' });
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
     * Validate required layers before export
     * @param {string} worldLayer - "Floor", "Underground", or "Sky"
     * @returns {Object} Validation result
     */
    validateRequiredLayers(worldLayer) {
        const layers = this.layerManager.layers.filter(l => l.worldLayer === worldLayer);
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        for (const layer of layers) {
            if (layer.required && layer.tiles.size === 0) {
                result.valid = false;
                result.errors.push(`Required layer "${layer.name}" is empty`);
            } else if (!layer.required && layer.tiles.size === 0) {
                result.warnings.push(`Optional layer "${layer.name}" is empty`);
            }
        }

        return result;
    }

    /**
     * Get export summary for display
     * @param {string} worldLayer - "Floor", "Underground", or "Sky" or "All"
     * @returns {string} HTML formatted summary
     */
    getExportSummary(worldLayer = 'All') {
        const worldLayers = worldLayer === 'All' ? ['Floor', 'Underground', 'Sky'] : [worldLayer];
        let summary = '<div class="export-summary">';

        for (const wl of worldLayers) {
            const validation = this.validateRequiredLayers(wl);
            const stats = this.getWorldLayerStatistics(wl);
            const compression = this.estimateCompression(wl);

            summary += `<div class="world-summary">`;
            summary += `<h4>${wl} Layer</h4>`;
            summary += `<p>Total Tiles: ${stats.totalTiles.toLocaleString()}</p>`;
            summary += `<p>Files: ${Object.keys(stats.layerStats).length} PNG files</p>`;
            summary += `<p>Estimated Size: ${compression.estimatedCompressedFormatted} (compressed)</p>`;

            if (validation.errors.length > 0) {
                summary += `<p class="error">⚠️ ${validation.errors.length} error(s)</p>`;
            }
            if (validation.warnings.length > 0) {
                summary += `<p class="warning">${validation.warnings.length} warning(s)</p>`;
            }

            summary += `</div>`;
        }

        summary += '</div>';
        return summary;
    }
}
