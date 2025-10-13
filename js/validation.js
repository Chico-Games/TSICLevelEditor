/**
 * Validation Module
 * Validates layer colors against Unreal Engine mappings and checks export requirements
 */

class ValidationManager {
    constructor(configManager) {
        this.configManager = configManager;
        this.unrealColorMappings = this.buildUnrealColorMappings();
    }

    /**
     * Build Unreal Engine color mappings from config
     * @returns {Object} Mappings by category
     */
    buildUnrealColorMappings() {
        const mappings = {
            biome: {},
            height: {},
            difficulty: {},
            hazards: {}
        };

        const tilesets = this.configManager.getTilesets();

        for (const [name, tileset] of Object.entries(tilesets)) {
            const color = tileset.color.toUpperCase();

            switch (tileset.category) {
                case 'Departments':
                    mappings.biome[color] = {
                        name: name,
                        tag: tileset.tag,
                        category: 'Biome/Department'
                    };
                    break;
                case 'Height':
                    mappings.height[color] = {
                        name: name,
                        tag: tileset.tag,
                        height: tileset.height,
                        category: 'Terrain Height'
                    };
                    break;
                case 'Difficulty':
                    mappings.difficulty[color] = {
                        name: name,
                        tag: tileset.tag,
                        category: 'Difficulty Level'
                    };
                    break;
                case 'Hazards':
                    mappings.hazards[color] = {
                        name: name,
                        tag: tileset.tag,
                        intensity: tileset.intensity,
                        category: 'Environmental Hazard'
                    };
                    break;
            }
        }

        // Add black as valid empty tile color
        mappings.biome['#000000'] = { name: 'Empty', tag: 'Empty', category: 'Empty Tile' };
        mappings.height['#000000'] = { name: 'Empty', tag: 'Empty', category: 'Empty Tile' };
        mappings.difficulty['#000000'] = { name: 'Empty', tag: 'Empty', category: 'Empty Tile' };
        mappings.hazards['#000000'] = { name: 'Empty', tag: 'Empty', category: 'Empty Tile' };

        return mappings;
    }

    /**
     * Validate a layer's colors against Unreal Engine mappings
     * @param {Layer} layer - The layer to validate
     * @returns {Object} Validation result
     */
    validateLayer(layer) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            info: {}
        };

        // Check if layer is empty
        if (layer.tiles.size === 0) {
            if (layer.required) {
                result.valid = false;
                result.errors.push(`Required layer "${layer.name}" is empty`);
            } else {
                result.warnings.push(`Optional layer "${layer.name}" is empty`);
            }
            return result;
        }

        // Get the appropriate color mapping for this layer type
        let colorMapping;
        switch (layer.layerType) {
            case 'biome':
                colorMapping = this.unrealColorMappings.biome;
                break;
            case 'height':
                colorMapping = this.unrealColorMappings.height;
                break;
            case 'difficulty':
                colorMapping = this.unrealColorMappings.difficulty;
                break;
            case 'hazard':
                colorMapping = this.unrealColorMappings.hazards;
                break;
            default:
                result.warnings.push(`Layer "${layer.name}" has unknown type "${layer.layerType}"`);
                return result;
        }

        // Validate all colors in the layer
        const usedColors = new Set();
        const invalidColors = new Set();

        for (const [key, tileset] of layer.tiles.entries()) {
            const color = tileset.color.toUpperCase();
            usedColors.add(color);

            if (!colorMapping[color]) {
                invalidColors.add(color);
            }
        }

        // Report invalid colors
        if (invalidColors.size > 0) {
            result.valid = false;
            result.errors.push(
                `Layer "${layer.name}" contains ${invalidColors.size} invalid color(s) for ${layer.layerType} layer: ${Array.from(invalidColors).join(', ')}`
            );
        }

        // Info
        result.info = {
            tileCount: layer.tiles.size,
            uniqueColors: usedColors.size,
            coverage: ((layer.tiles.size / (layer.width * layer.height)) * 100).toFixed(2) + '%',
            validColors: usedColors.size - invalidColors.size,
            invalidColors: invalidColors.size
        };

        return result;
    }

    /**
     * Validate all layers for a world layer
     * @param {LayerManager} layerManager - The layer manager
     * @param {string} worldLayer - "Floor", "Underground", or "Sky"
     * @returns {Object} Validation results
     */
    validateWorldLayer(layerManager, worldLayer) {
        const layers = layerManager.layers.filter(l => l.worldLayer === worldLayer);
        const results = {
            valid: true,
            worldLayer: worldLayer,
            layerResults: {},
            totalErrors: 0,
            totalWarnings: 0
        };

        for (const layer of layers) {
            const layerResult = this.validateLayer(layer);
            results.layerResults[layer.layerType] = layerResult;

            if (!layerResult.valid) {
                results.valid = false;
            }

            results.totalErrors += layerResult.errors.length;
            results.totalWarnings += layerResult.warnings.length;
        }

        return results;
    }

    /**
     * Validate all world layers
     * @param {LayerManager} layerManager - The layer manager
     * @returns {Object} Complete validation results
     */
    validateAllWorldLayers(layerManager) {
        const worldLayers = ['Floor', 'Underground', 'Sky'];
        const results = {
            valid: true,
            worldLayers: {},
            totalErrors: 0,
            totalWarnings: 0
        };

        for (const worldLayer of worldLayers) {
            const worldResult = this.validateWorldLayer(layerManager, worldLayer);
            results.worldLayers[worldLayer] = worldResult;

            if (!worldResult.valid) {
                results.valid = false;
            }

            results.totalErrors += worldResult.totalErrors;
            results.totalWarnings += worldResult.totalWarnings;
        }

        return results;
    }

    /**
     * Get validation summary HTML
     * @param {Object} validationResult - Result from validateLayer or validateWorldLayer
     * @returns {string} HTML summary
     */
    getValidationSummaryHTML(validationResult) {
        let html = '<div class="validation-summary">';

        if (validationResult.layerResults) {
            // World layer validation
            for (const [layerType, result] of Object.entries(validationResult.layerResults)) {
                html += `<div class="layer-validation">`;
                html += `<h5>${layerType.charAt(0).toUpperCase() + layerType.slice(1)} Layer</h5>`;

                if (result.errors.length > 0) {
                    html += `<ul class="error-list">`;
                    result.errors.forEach(error => {
                        html += `<li class="error">❌ ${error}</li>`;
                    });
                    html += `</ul>`;
                }

                if (result.warnings.length > 0) {
                    html += `<ul class="warning-list">`;
                    result.warnings.forEach(warning => {
                        html += `<li class="warning">⚠️ ${warning}</li>`;
                    });
                    html += `</ul>`;
                }

                if (result.info && result.errors.length === 0 && result.warnings.length === 0) {
                    html += `<p class="success">✅ Valid (${result.info.tileCount} tiles, ${result.info.coverage} coverage)</p>`;
                }

                html += `</div>`;
            }
        } else {
            // Single layer validation
            if (validationResult.errors.length > 0) {
                html += `<ul class="error-list">`;
                validationResult.errors.forEach(error => {
                    html += `<li class="error">❌ ${error}</li>`;
                });
                html += `</ul>`;
            }

            if (validationResult.warnings.length > 0) {
                html += `<ul class="warning-list">`;
                validationResult.warnings.forEach(warning => {
                    html += `<li class="warning">⚠️ ${warning}</li>`;
                });
                html += `</ul>`;
            }

            if (validationResult.info && validationResult.errors.length === 0 && validationResult.warnings.length === 0) {
                html += `<p class="success">✅ Valid (${validationResult.info.tileCount} tiles)</p>`;
            }
        }

        html += '</div>';
        return html;
    }

    /**
     * Check if export is safe to proceed
     * @param {LayerManager} layerManager - The layer manager
     * @param {string} worldLayer - "Floor", "Underground", "Sky", or "All"
     * @returns {Object} Safety check result
     */
    canExport(layerManager, worldLayer) {
        const result = {
            canExport: true,
            blockingErrors: [],
            warnings: []
        };

        const worldLayers = worldLayer === 'All' ? ['Floor', 'Underground', 'Sky'] : [worldLayer];

        for (const wl of worldLayers) {
            const validation = this.validateWorldLayer(layerManager, wl);

            // Check for required empty layers
            for (const [layerType, layerResult] of Object.entries(validation.layerResults)) {
                const layer = layerManager.layers.find(l => l.worldLayer === wl && l.layerType === layerType);

                if (layer && layer.required && layer.tiles.size === 0) {
                    result.canExport = false;
                    result.blockingErrors.push(`${wl} - ${layerType}: Required layer is empty`);
                }

                // Check for invalid colors
                if (!layerResult.valid && layerResult.errors.some(e => e.includes('invalid color'))) {
                    result.canExport = false;
                    result.blockingErrors.push(`${wl} - ${layerType}: Contains invalid colors`);
                }
            }

            // Warnings for optional empty layers
            for (const [layerType, layerResult] of Object.entries(validation.layerResults)) {
                const layer = layerManager.layers.find(l => l.worldLayer === wl && l.layerType === layerType);

                if (layer && !layer.required && layer.tiles.size === 0) {
                    result.warnings.push(`${wl} - ${layerType}: Optional layer is empty`);
                }
            }
        }

        return result;
    }
}
