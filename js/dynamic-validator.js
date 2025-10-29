/**
 * Dynamic RLE Validator
 *
 * Validates JSON-RLE world data against dynamically loaded configuration.
 * Rules are NOT hardcoded - they come from config/biomes.json
 *
 * This allows the validation to adapt when:
 * - New biomes are added
 * - Hazard types change
 * - Value ranges are modified
 * - Layer types are updated
 */

class DynamicRLEValidator {
    constructor() {
        this.config = null;
        this.rules = null;
        this.configLoaded = false;
    }

    /**
     * Load and parse configuration
     */
    async loadConfig(configPath = '../config/biomes.json') {
        try {
            let configData;

            // Check if we're in Node.js or browser
            if (typeof window === 'undefined') {
                // Node.js
                const fs = require('fs');
                const path = require('path');
                const fullPath = path.resolve(__dirname, configPath);
                const fileContent = fs.readFileSync(fullPath, 'utf-8');
                configData = JSON.parse(fileContent);
            } else {
                // Browser
                const response = await fetch(configPath);
                if (!response.ok) {
                    throw new Error(`Failed to load config: ${response.statusText}`);
                }
                configData = await response.json();
            }

            this.config = configData;
            this.parseRules();
            this.configLoaded = true;

            return { success: true, config: this.config };
        } catch (error) {
            return {
                success: false,
                error: `Failed to load configuration: ${error.message}`,
                details: 'Make sure config/biomes.json exists and is valid JSON'
            };
        }
    }

    /**
     * Parse configuration to extract validation rules
     */
    parseRules() {
        this.rules = {
            dataTypes: {},
            tilesets: {},
            layerTypes: [],
            worldSizes: [],
            enumMappings: {}
        };

        // Parse data types and their ranges
        if (this.config.dataTypes && Array.isArray(this.config.dataTypes)) {
            for (const dataType of this.config.dataTypes) {
                this.rules.dataTypes[dataType.type] = {
                    name: dataType.name,
                    description: dataType.description,
                    min: dataType.valueRange[0],
                    max: dataType.valueRange[1],
                    defaultValue: dataType.defaultValue,
                    validValues: []
                };
            }
        }

        // Parse tilesets to get actual valid values and build value list
        if (this.config.tilesets) {
            for (const [tilesetName, tileset] of Object.entries(this.config.tilesets)) {
                const category = tileset.category;

                if (!this.rules.tilesets[category]) {
                    this.rules.tilesets[category] = [];
                }

                this.rules.tilesets[category].push({
                    name: tilesetName,
                    value: tileset.value,
                    color: tileset.color,
                    description: tileset.description,
                    tag: tileset.tag
                });

                // Add to valid values for the corresponding data type
                const dataTypeMap = {
                    'Biomes': 'biome',
                    'Height': 'height',
                    'Difficulty': 'difficulty',
                    'Hazards': 'hazard'
                };

                const dataType = dataTypeMap[category];
                if (dataType && this.rules.dataTypes[dataType]) {
                    this.rules.dataTypes[dataType].validValues.push({
                        value: tileset.value,
                        name: tilesetName,
                        description: tileset.description
                    });
                }
            }

            // Sort valid values by value for each data type
            for (const dataType of Object.keys(this.rules.dataTypes)) {
                this.rules.dataTypes[dataType].validValues.sort((a, b) => a.value - b.value);
            }
        }

        // Parse layer types
        if (this.config.layers && Array.isArray(this.config.layers)) {
            this.rules.layerTypes = this.config.layers.map(layer => ({
                name: layer.name,
                type: layer.worldLayer || layer.layerType,
                description: layer.description,
                required: layer.required || false
            }));
        }

        // Parse available world sizes
        if (this.config.availableSizes && Array.isArray(this.config.availableSizes)) {
            this.rules.worldSizes = this.config.availableSizes.map(size => size.value);
        } else {
            // Fallback to standard sizes
            this.rules.worldSizes = [256, 512, 1024, 2048];
        }

        // Parse enum mappings
        if (this.config.enumMappings) {
            this.rules.enumMappings = this.config.enumMappings;
        }
    }

    /**
     * Get configuration summary for display
     */
    getConfigSummary() {
        if (!this.configLoaded) {
            return 'Configuration not loaded';
        }

        const summary = [];
        summary.push('=== Configuration Summary ===\n');

        // Data types
        summary.push('Data Types:');
        for (const [type, info] of Object.entries(this.rules.dataTypes)) {
            summary.push(`  ${info.name} (${type}): ${info.min}-${info.max} (${info.validValues.length} values defined)`);
        }

        // World sizes
        summary.push(`\nValid World Sizes: ${this.rules.worldSizes.join(', ')}`);

        // Layer types
        summary.push(`\nLayer Types: ${this.rules.layerTypes.map(l => l.type).join(', ')}`);

        // Tilesets per category
        summary.push('\nTileset Categories:');
        for (const [category, tilesets] of Object.entries(this.rules.tilesets)) {
            summary.push(`  ${category}: ${tilesets.length} tilesets`);
        }

        return summary.join('\n');
    }

    /**
     * Validate RLE world data against dynamic configuration
     */
    validate(data) {
        if (!this.configLoaded) {
            return {
                valid: false,
                errors: ['Configuration not loaded. Call loadConfig() first.'],
                warnings: []
            };
        }

        const errors = [];
        const warnings = [];

        // Basic structure validation
        if (!data || typeof data !== 'object') {
            errors.push('Invalid data: must be a JSON object');
            return { valid: false, errors, warnings };
        }

        // Validate metadata
        const metadataErrors = this.validateMetadata(data.metadata);
        errors.push(...metadataErrors);

        // Validate layers
        if (!data.layers) {
            errors.push('Missing "layers" array');
            errors.push(`💡 Tip: Add at least one layer with type: ${this.rules.layerTypes.map(l => l.type).join(', ')}`);
            return { valid: false, errors, warnings };
        }

        if (!Array.isArray(data.layers)) {
            errors.push('"layers" must be an array');
            return { valid: false, errors, warnings };
        }

        if (data.layers.length === 0) {
            errors.push('layers array is empty - at least one layer is required');
            errors.push(`💡 Tip: Valid layer types from config: ${this.rules.layerTypes.map(l => l.type).join(', ')}`);
            return { valid: false, errors, warnings };
        }

        // Validate each layer
        const worldSize = data.metadata?.world_size || 256;
        for (let i = 0; i < data.layers.length; i++) {
            const layerErrors = this.validateLayer(data.layers[i], i, worldSize);
            errors.push(...layerErrors.errors);
            warnings.push(...layerErrors.warnings);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate metadata against config
     */
    validateMetadata(metadata) {
        const errors = [];

        if (!metadata) {
            errors.push('Missing "metadata" object');
            errors.push('💡 Tip: metadata should include: name, description, world_size, maze_generation_seed');
            return errors;
        }

        // Name validation
        if (!metadata.name || typeof metadata.name !== 'string' || metadata.name.trim() === '') {
            errors.push('metadata.name is missing or invalid');
            errors.push('💡 Tip: name should be a non-empty string (e.g., "TSIC_Mall")');
        }

        // World size validation
        if (!metadata.world_size) {
            errors.push('metadata.world_size is missing');
            errors.push(`💡 Tip: Valid sizes from config: ${this.rules.worldSizes.join(', ')}`);
        } else if (!this.rules.worldSizes.includes(metadata.world_size)) {
            errors.push(`metadata.world_size must be one of: ${this.rules.worldSizes.join(', ')} (got ${metadata.world_size})`);
            errors.push('💡 Tip: These sizes are defined in config/biomes.json under "availableSizes"');
        }

        // Seed validation
        if (metadata.maze_generation_seed !== undefined) {
            if (typeof metadata.maze_generation_seed !== 'number') {
                errors.push('metadata.maze_generation_seed must be a number');
            } else if (metadata.maze_generation_seed < 0 || metadata.maze_generation_seed > 2147483647) {
                errors.push('metadata.maze_generation_seed must be between 0 and 2147483647 (int32 range)');
            }
        }

        return errors;
    }

    /**
     * Validate a single layer
     */
    validateLayer(layer, layerIdx, worldSize) {
        const errors = [];
        const warnings = [];
        const prefix = `Layer ${layerIdx}`;

        if (!layer || typeof layer !== 'object') {
            errors.push(`${prefix}: Invalid layer object`);
            return { errors, warnings };
        }

        // Validate layer_type
        const validLayerTypes = this.rules.layerTypes.map(l => l.type);

        if (!layer.layer_type) {
            errors.push(`${prefix}: Missing "layer_type" field`);
            errors.push(`💡 Tip: Valid types from config: ${validLayerTypes.join(', ')}`);
        } else if (!validLayerTypes.includes(layer.layer_type)) {
            errors.push(`${prefix}: Invalid layer_type "${layer.layer_type}"`);
            errors.push(`💡 Tip: Valid types from config: ${validLayerTypes.join(', ')} (case-sensitive)`);

            // Check if it's a case mismatch
            const lowerCaseType = layer.layer_type.toLowerCase();
            const match = validLayerTypes.find(t => t.toLowerCase() === lowerCaseType);
            if (match) {
                errors.push(`💡 Did you mean "${match}"? (case matters)`);
            }
        }

        // Validate each data type array
        for (const [dataTypeName, dataTypeInfo] of Object.entries(this.rules.dataTypes)) {
            const dataKey = `${dataTypeName}_data`;
            const dataErrors = this.validateDataArray(
                layer[dataKey],
                dataTypeName,
                dataTypeInfo,
                worldSize,
                `${prefix}`
            );
            errors.push(...dataErrors);
        }

        return { errors, warnings };
    }

    /**
     * Validate a data array (biome_data, height_data, etc.)
     */
    validateDataArray(dataArray, dataTypeName, dataTypeInfo, worldSize, prefix) {
        const errors = [];
        const dataKey = `${dataTypeName}_data`;

        // Check if array exists
        if (!dataArray) {
            errors.push(`${prefix}: Missing "${dataKey}" array`);
            errors.push(`💡 Tip: All layers must have: ${Object.keys(this.rules.dataTypes).map(t => t + '_data').join(', ')}`);
            return errors;
        }

        if (!Array.isArray(dataArray)) {
            errors.push(`${prefix}: "${dataKey}" must be an array`);
            return errors;
        }

        if (dataArray.length === 0) {
            errors.push(`${prefix}: "${dataKey}" is empty - at least one RLE entry required`);
            errors.push(`💡 Tip: Example: [{"value": ${dataTypeInfo.defaultValue}, "count": ${worldSize * worldSize}}]`);
            return errors;
        }

        // Validate each RLE entry
        let totalCount = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const entry = dataArray[i];
            const entryPrefix = `${prefix} ${dataKey}[${i}]`;

            if (!entry || typeof entry !== 'object') {
                errors.push(`${entryPrefix}: Invalid RLE entry (must be an object)`);
                continue;
            }

            // Check required fields
            if (!entry.hasOwnProperty('value')) {
                errors.push(`${entryPrefix}: Missing "value" field`);
                errors.push(`💡 Tip: Each RLE entry needs: {"value": <number>, "count": <number>}`);
            }

            if (!entry.hasOwnProperty('count')) {
                errors.push(`${entryPrefix}: Missing "count" field`);
                errors.push(`💡 Tip: Each RLE entry needs: {"value": <number>, "count": <number>}`);
            }

            // Validate value
            if (entry.hasOwnProperty('value')) {
                const valueErrors = this.validateValue(
                    entry.value,
                    dataTypeName,
                    dataTypeInfo,
                    entryPrefix
                );
                errors.push(...valueErrors);
            }

            // Validate count
            if (entry.hasOwnProperty('count')) {
                const count = entry.count;

                if (typeof count !== 'number') {
                    errors.push(`${entryPrefix}: "count" must be a number (got ${typeof count})`);
                } else if (!Number.isInteger(count)) {
                    errors.push(`${entryPrefix}: "count" must be an integer (got ${count})`);
                } else if (count < 0) {
                    errors.push(`${entryPrefix}: "count" cannot be negative (got ${count})`);
                } else if (count === 0) {
                    errors.push(`${entryPrefix}: "count" cannot be zero`);
                    errors.push(`💡 Tip: Remove entries with count=0, they're unnecessary`);
                } else {
                    totalCount += count;
                }
            }
        }

        // Validate total tile count
        const expectedTotal = worldSize * worldSize;
        if (totalCount !== expectedTotal) {
            errors.push(`${prefix} ${dataKey}: Tile count mismatch`);
            errors.push(`  Expected: ${expectedTotal} tiles (${worldSize}×${worldSize})`);
            errors.push(`  Got: ${totalCount} tiles`);
            errors.push(`  Difference: ${totalCount - expectedTotal} tiles`);

            if (totalCount < expectedTotal) {
                errors.push(`💡 Tip: Missing ${expectedTotal - totalCount} tiles. Add more RLE entries or increase counts.`);
            } else {
                errors.push(`💡 Tip: ${totalCount - expectedTotal} too many tiles. Reduce RLE entry counts.`);
            }
        }

        return errors;
    }

    /**
     * Validate a single value against config rules
     */
    validateValue(value, dataTypeName, dataTypeInfo, prefix) {
        const errors = [];

        // Type check
        if (typeof value !== 'number') {
            errors.push(`${prefix}: "value" must be a number (got ${typeof value})`);
            return errors;
        }

        if (!Number.isInteger(value)) {
            errors.push(`${prefix}: "value" must be an integer (got ${value})`);
            return errors;
        }

        // Range check
        if (value < dataTypeInfo.min || value > dataTypeInfo.max) {
            errors.push(`${prefix}: value ${value} is out of range [${dataTypeInfo.min}, ${dataTypeInfo.max}]`);

            // Find valid values from config
            const validValues = dataTypeInfo.validValues;
            if (validValues && validValues.length > 0) {
                errors.push(`💡 Valid ${dataTypeInfo.name} values from config:`);

                // Show a subset if there are too many
                if (validValues.length <= 10) {
                    validValues.forEach(v => {
                        errors.push(`   ${v.value}: ${v.name} - ${v.description}`);
                    });
                } else {
                    // Show first 3, last 3, and total count
                    errors.push(`   ${validValues[0].value}: ${validValues[0].name}`);
                    errors.push(`   ${validValues[1].value}: ${validValues[1].name}`);
                    errors.push(`   ${validValues[2].value}: ${validValues[2].name}`);
                    errors.push(`   ... (${validValues.length - 6} more values) ...`);
                    errors.push(`   ${validValues[validValues.length - 3].value}: ${validValues[validValues.length - 3].name}`);
                    errors.push(`   ${validValues[validValues.length - 2].value}: ${validValues[validValues.length - 2].name}`);
                    errors.push(`   ${validValues[validValues.length - 1].value}: ${validValues[validValues.length - 1].name}`);
                }
            } else {
                errors.push(`💡 Tip: Valid range is ${dataTypeInfo.min} to ${dataTypeInfo.max}`);
            }

            // Special handling for common mistakes
            if (dataTypeName === 'hazard') {
                // Check if it's an old hazard value that's no longer in config
                const maxHazardInConfig = Math.max(...validValues.map(v => v.value));
                if (value > maxHazardInConfig) {
                    errors.push(`💡 Common Mistake: This hazard value is not in the current config.`);
                    errors.push(`   Config only defines hazards 0-${maxHazardInConfig}.`);
                    errors.push(`   Check config/biomes.json to see available hazards.`);
                }
            }
        }

        return errors;
    }

    /**
     * Generate compression statistics
     */
    getCompressionStats(data) {
        if (!data || !data.layers) return null;

        const worldSize = data.metadata?.world_size || 256;
        let totalRLEEntries = 0;
        let totalTiles = 0;

        for (const layer of data.layers) {
            for (const dataType of ['biome', 'height', 'difficulty', 'hazard']) {
                const dataKey = `${dataType}_data`;
                if (layer[dataKey] && Array.isArray(layer[dataKey])) {
                    totalRLEEntries += layer[dataKey].length;
                    totalTiles += worldSize * worldSize;
                }
            }
        }

        const compressionRatio = ((totalRLEEntries / totalTiles) * 100).toFixed(2);
        let efficiency;
        if (compressionRatio < 25) efficiency = 'Excellent';
        else if (compressionRatio < 50) efficiency = 'Good';
        else if (compressionRatio < 75) efficiency = 'Fair';
        else efficiency = 'Poor';

        return {
            worldSize,
            layerCount: data.layers.length,
            totalTiles,
            totalRLEEntries,
            compressionRatio: compressionRatio + '%',
            efficiency
        };
    }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DynamicRLEValidator;
} else {
    window.DynamicRLEValidator = DynamicRLEValidator;
}
