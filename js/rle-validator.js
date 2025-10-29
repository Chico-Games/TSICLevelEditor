/**
 * JSON-RLE World Format Validator
 * Validates exported world data according to TSIC specification
 */

class RLEValidator {
    constructor() {
        // Valid world sizes
        this.validWorldSizes = [256, 512, 1024, 2048];

        // Value ranges per data type
        this.valueRanges = {
            biome: { min: 0, max: 22, name: 'Biome' },
            height: { min: 0, max: 255, name: 'Height' },
            difficulty: { min: 0, max: 4, name: 'Difficulty' },
            hazard: { min: 0, max: 6, name: 'Hazard' }
        };

        // Valid layer types
        this.validLayerTypes = ['None', 'Floor', 'Sky', 'Underground', 'Hazard'];

        // Required data arrays per layer
        this.requiredDataArrays = ['biome_data', 'height_data', 'difficulty_data', 'hazard_data'];
    }

    /**
     * Validate complete RLE world data
     * @param {object} rleData - World data to validate
     * @returns {object} - { valid: boolean, errors: string[], warnings: string[] }
     */
    validate(rleData) {
        const errors = [];
        const warnings = [];

        // Validate structure
        if (!rleData || typeof rleData !== 'object') {
            errors.push('Invalid data format: Expected object');
            return { valid: false, errors, warnings };
        }

        // Validate metadata
        const metadataErrors = this.validateMetadata(rleData.metadata);
        errors.push(...metadataErrors);

        // Validate layers
        const layersErrors = this.validateLayers(rleData.layers, rleData.metadata?.world_size);
        errors.push(...layersErrors.errors);
        warnings.push(...layersErrors.warnings);

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate metadata section
     * @param {object} metadata
     * @returns {string[]} - Array of error messages
     */
    validateMetadata(metadata) {
        const errors = [];

        if (!metadata) {
            errors.push('Missing metadata section');
            return errors;
        }

        // Validate name
        if (!metadata.name || typeof metadata.name !== 'string' || metadata.name.trim() === '') {
            errors.push('Metadata: "name" must be a non-empty string');
        }

        // Validate description
        if (!metadata.description || typeof metadata.description !== 'string') {
            errors.push('Metadata: "description" must be a string');
        }

        // Validate world_size
        if (!this.validWorldSizes.includes(metadata.world_size)) {
            errors.push(`Metadata: "world_size" must be one of: ${this.validWorldSizes.join(', ')} (got ${metadata.world_size})`);
        }

        // Validate maze_generation_seed
        if (typeof metadata.maze_generation_seed !== 'number') {
            errors.push('Metadata: "maze_generation_seed" must be a number');
        } else if (!Number.isInteger(metadata.maze_generation_seed)) {
            errors.push('Metadata: "maze_generation_seed" must be an integer');
        }

        return errors;
    }

    /**
     * Validate layers array
     * @param {array} layers
     * @param {number} worldSize
     * @returns {object} - { errors: string[], warnings: string[] }
     */
    validateLayers(layers, worldSize) {
        const errors = [];
        const warnings = [];

        // Check layers exist
        if (!Array.isArray(layers)) {
            errors.push('Layers must be an array');
            return { errors, warnings };
        }

        // Check at least one layer
        if (layers.length === 0) {
            errors.push('At least one layer must be present');
            return { errors, warnings };
        }

        // Check for Floor layer (recommended)
        const hasFloorLayer = layers.some(layer => layer.layer_type === 'Floor');
        if (!hasFloorLayer) {
            warnings.push('No "Floor" layer found - at least one Floor layer is recommended');
        }

        // Validate each layer
        const expectedTileCount = worldSize * worldSize;
        layers.forEach((layer, index) => {
            const layerErrors = this.validateLayer(layer, index, expectedTileCount);
            errors.push(...layerErrors);
        });

        return { errors, warnings };
    }

    /**
     * Validate a single layer
     * @param {object} layer
     * @param {number} index
     * @param {number} expectedTileCount
     * @returns {string[]} - Array of error messages
     */
    validateLayer(layer, index, expectedTileCount) {
        const errors = [];
        const prefix = `Layer ${index} (${layer.layer_type || 'unknown'})`;

        // Validate layer_type
        if (!layer.layer_type || !this.validLayerTypes.includes(layer.layer_type)) {
            errors.push(`${prefix}: Invalid layer_type "${layer.layer_type}" - must be one of: ${this.validLayerTypes.join(', ')}`);
        }

        // Validate each required data array
        this.requiredDataArrays.forEach(dataArrayName => {
            const dataType = dataArrayName.replace('_data', ''); // Extract 'biome', 'height', etc.
            const dataErrors = this.validateDataArray(
                layer[dataArrayName],
                dataType,
                expectedTileCount,
                `${prefix}: ${dataArrayName}`
            );
            errors.push(...dataErrors);
        });

        return errors;
    }

    /**
     * Validate a data array (RLE format)
     * @param {array} dataArray
     * @param {string} dataType - 'biome', 'height', 'difficulty', 'hazard'
     * @param {number} expectedTileCount
     * @param {string} prefix - Error message prefix
     * @returns {string[]} - Array of error messages
     */
    validateDataArray(dataArray, dataType, expectedTileCount, prefix) {
        const errors = [];

        // Check array exists
        if (!Array.isArray(dataArray)) {
            errors.push(`${prefix}: Must be an array`);
            return errors;
        }

        // Check array has at least one entry
        if (dataArray.length === 0) {
            errors.push(`${prefix}: Must have at least one RLE entry`);
            return errors;
        }

        // Validate RLE entries and count tiles
        let totalCount = 0;
        const range = this.valueRanges[dataType];

        dataArray.forEach((entry, entryIndex) => {
            // Validate RLE entry structure
            if (typeof entry !== 'object' || entry === null) {
                errors.push(`${prefix}[${entryIndex}]: RLE entry must be an object`);
                return;
            }

            if (!('value' in entry)) {
                errors.push(`${prefix}[${entryIndex}]: Missing "value" field`);
            }
            if (!('count' in entry)) {
                errors.push(`${prefix}[${entryIndex}]: Missing "count" field`);
            }

            // Validate value type and range
            if (typeof entry.value !== 'number') {
                errors.push(`${prefix}[${entryIndex}]: "value" must be a number (got ${typeof entry.value})`);
            } else if (!Number.isInteger(entry.value)) {
                errors.push(`${prefix}[${entryIndex}]: "value" must be an integer (got ${entry.value})`);
            } else if (entry.value < range.min || entry.value > range.max) {
                errors.push(`${prefix}[${entryIndex}]: ${range.name} value ${entry.value} out of range [${range.min}-${range.max}]`);
            }

            // Validate count type and value
            if (typeof entry.count !== 'number') {
                errors.push(`${prefix}[${entryIndex}]: "count" must be a number (got ${typeof entry.count})`);
            } else if (!Number.isInteger(entry.count)) {
                errors.push(`${prefix}[${entryIndex}]: "count" must be an integer (got ${entry.count})`);
            } else if (entry.count <= 0) {
                errors.push(`${prefix}[${entryIndex}]: "count" must be positive (got ${entry.count})`);
            }

            totalCount += entry.count || 0;
        });

        // Validate total tile count
        if (totalCount !== expectedTileCount) {
            errors.push(`${prefix}: Total tile count ${totalCount} does not match expected ${expectedTileCount} (world_size²)`);
        }

        return errors;
    }

    /**
     * Generate validation report
     * @param {object} result - Validation result
     * @returns {string} - Formatted report
     */
    generateReport(result) {
        const lines = [];

        lines.push('=== JSON-RLE Validation Report ===\n');

        if (result.valid) {
            lines.push('✅ VALIDATION PASSED\n');
        } else {
            lines.push('❌ VALIDATION FAILED\n');
        }

        if (result.errors.length > 0) {
            lines.push(`\nErrors (${result.errors.length}):`);
            result.errors.forEach((error, i) => {
                lines.push(`  ${i + 1}. ${error}`);
            });
        }

        if (result.warnings.length > 0) {
            lines.push(`\nWarnings (${result.warnings.length}):`);
            result.warnings.forEach((warning, i) => {
                lines.push(`  ${i + 1}. ${warning}`);
            });
        }

        if (result.valid && result.warnings.length === 0) {
            lines.push('\nNo errors or warnings detected.');
            lines.push('World data conforms to TSIC JSON-RLE specification.');
        }

        return lines.join('\n');
    }

    /**
     * Validate and generate detailed report
     * @param {object} rleData
     * @returns {object} - { valid, errors, warnings, report }
     */
    validateWithReport(rleData) {
        const result = this.validate(rleData);
        const report = this.generateReport(result);

        return {
            ...result,
            report
        };
    }

    /**
     * Quick validation (just return boolean)
     * @param {object} rleData
     * @returns {boolean}
     */
    isValid(rleData) {
        return this.validate(rleData).valid;
    }

    /**
     * Get compression statistics
     * @param {object} rleData
     * @returns {object} - Compression statistics
     */
    getCompressionStats(rleData) {
        if (!rleData || !rleData.metadata || !rleData.layers) {
            return null;
        }

        const worldSize = rleData.metadata.world_size;
        const totalTiles = worldSize * worldSize * rleData.layers.length * 4; // 4 data types per layer

        let totalRLEEntries = 0;
        rleData.layers.forEach(layer => {
            totalRLEEntries += (layer.biome_data?.length || 0);
            totalRLEEntries += (layer.height_data?.length || 0);
            totalRLEEntries += (layer.difficulty_data?.length || 0);
            totalRLEEntries += (layer.hazard_data?.length || 0);
        });

        const compressionRatio = (totalRLEEntries / totalTiles) * 100;

        return {
            worldSize,
            layerCount: rleData.layers.length,
            totalTiles,
            totalRLEEntries,
            compressionRatio: compressionRatio.toFixed(2) + '%',
            efficiency: compressionRatio < 50 ? 'Excellent' :
                       compressionRatio < 75 ? 'Good' :
                       compressionRatio < 90 ? 'Fair' : 'Poor'
        };
    }
}

// Export singleton instance
const rleValidator = new RLEValidator();
