/**
 * JSON-RLE World Format Validator
 *
 * Validates exported world data against the TSIC runtime contract implemented by
 * Source/TSIC/Private/WorldGeneration/JsonRLEWorldLoader.cpp. This is the
 * self-contained fallback validator (the config-driven DynamicRLEValidator is the
 * primary). It encodes the loader's hardcoded rules so it stays useful even when
 * config/biomes.json fails to load.
 *
 * Current export schema (Format 2 — palette + RLE):
 * {
 *   "metadata":      { "name", "description"?, "world_size", "maze_generation_seed" },
 *   "layers":        [ { "layer_type", "palette": ["#rrggbb", ...], "color_data": [[paletteIndex, count], ...] } ],
 *   "color_mappings":{ "biomes":{}, "heights":{}, "difficulty":{}, "hazards":{} },  // each: "#rrggbb" -> { value, name?, description? }
 *   "format_info"?:  { ... }
 * }
 *
 * Layer VALUES are resolved at load time by looking each palette colour up in the
 * matching color_mappings category, so this validator cross-checks palette colours
 * against color_mappings and range-checks the resolved values exactly as the loader does.
 */

class RLEValidator {
    constructor() {
        // ValidateWorldSize() in the loader.
        this.validWorldSizes = [256, 512, 1024, 2048];

        // ParseLayerType() accepted strings. "Showfloor" is a loader alias for "Floor".
        this.validLayerTypes = [
            'None', 'Floor', 'Showfloor', 'Sky', 'Underground',
            'Height', 'Difficulty', 'Hazard',
            'SkyHeightOffset', 'UndergroundHeightOffset'
        ];

        // ParseColorMappings() requires all four categories or load fails.
        this.requiredColorMappingCategories = ['biomes', 'heights', 'difficulty', 'hazards'];

        // Maps a layer_type to the color_mappings category its palette resolves against,
        // plus the resolved-value range the loader enforces. `max: null` => no range check
        // (Height is a raw uint8; biome indices are validated by palette membership).
        this.layerTypeInfo = {
            'Floor':                   { category: 'biomes',     max: null,                  label: 'Biome' },
            'Showfloor':               { category: 'biomes',     max: null,                  label: 'Biome' },
            'Sky':                     { category: 'biomes',     max: null,                  label: 'Biome' },
            'Underground':             { category: 'biomes',     max: null,                  label: 'Biome' },
            'Height':                  { category: 'heights',    max: null,                  label: 'Height' },
            'Difficulty':              { category: 'difficulty', max: 4,                     label: 'Difficulty' }, // ECurrentStoreDifficulty::Apocalypse
            'Hazard':                  { category: 'hazards',    max: 2,                     label: 'Hazard' },     // EEnvironmentalHazardType::Freezing
            'SkyHeightOffset':         { category: 'heights',    max: 9,                     label: 'SkyHeightOffset' },
            'UndergroundHeightOffset': { category: 'heights',    max: 9,                     label: 'UndergroundHeightOffset' }
            // 'None' carries no data channel and is skipped.
        };
    }

    /**
     * Validate complete RLE world data.
     * @param {object} rleData
     * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
     */
    validate(rleData) {
        const errors = [];
        const warnings = [];

        if (!rleData || typeof rleData !== 'object') {
            errors.push('Invalid data format: expected an object');
            return { valid: false, errors, warnings };
        }

        errors.push(...this.validateMetadata(rleData.metadata));

        const cm = this.validateColorMappings(rleData.color_mappings);
        errors.push(...cm.errors);
        warnings.push(...cm.warnings);

        const layers = this.validateLayers(rleData.layers, rleData.metadata?.world_size, rleData.color_mappings);
        errors.push(...layers.errors);
        warnings.push(...layers.warnings);

        return { valid: errors.length === 0, errors, warnings };
    }

    /**
     * metadata: name (non-empty), world_size (256/512/1024/2048), maze_generation_seed (integer).
     * description is optional in the loader.
     * @returns {string[]}
     */
    validateMetadata(metadata) {
        const errors = [];

        if (!metadata || typeof metadata !== 'object') {
            errors.push('Missing required "metadata" section');
            return errors;
        }

        if (!metadata.name || typeof metadata.name !== 'string' || metadata.name.trim() === '') {
            errors.push('metadata.name must be a non-empty string');
        }

        if (!this.validWorldSizes.includes(metadata.world_size)) {
            errors.push(`metadata.world_size must be one of ${this.validWorldSizes.join(', ')} (got ${metadata.world_size})`);
        }

        if (typeof metadata.maze_generation_seed !== 'number' || !Number.isInteger(metadata.maze_generation_seed)) {
            errors.push('metadata.maze_generation_seed must be an integer (the loader rejects maps without it)');
        }

        return errors;
    }

    /**
     * color_mappings must exist and contain biomes/heights/difficulty/hazards. Each entry maps a
     * hex colour to { value: int }. Biome names are resolved as gameplay tags at load time, so a
     * biome whose name is not a "Tile.Biome.*" tag will silently load as an EMPTY tile in-game.
     * @returns {{ errors: string[], warnings: string[] }}
     */
    validateColorMappings(colorMappings) {
        const errors = [];
        const warnings = [];

        if (!colorMappings || typeof colorMappings !== 'object') {
            errors.push('Missing required "color_mappings" section');
            return { errors, warnings };
        }

        for (const category of this.requiredColorMappingCategories) {
            const table = colorMappings[category];
            if (!table || typeof table !== 'object') {
                errors.push(`color_mappings.${category} is missing (the loader requires all of: ${this.requiredColorMappingCategories.join(', ')})`);
                continue;
            }

            for (const [color, entry] of Object.entries(table)) {
                const where = `color_mappings.${category}["${color}"]`;

                if (!this.isHexColor(color)) {
                    warnings.push(`${where}: key is not a #rrggbb colour`);
                }
                if (!entry || typeof entry !== 'object') {
                    errors.push(`${where}: entry must be an object`);
                    continue;
                }
                if (typeof entry.value !== 'number' || !Number.isInteger(entry.value) || entry.value < 0) {
                    errors.push(`${where}.value must be a non-negative integer (got ${entry.value})`);
                }

                // Guard the biome-name -> gameplay-tag contract. The #000000 fallback ("Empty")
                // is the loader's value-0 default and is exempt.
                if (category === 'biomes' && color.toLowerCase() !== '#000000') {
                    if (typeof entry.name !== 'string' || !entry.name.startsWith('Tile.Biome.')) {
                        errors.push(`${where}.name must be a "Tile.Biome.*" gameplay tag (got "${entry.name}") — otherwise this biome loads as an empty tile in-game`);
                    }
                }
            }
        }

        return { errors, warnings };
    }

    /**
     * layers: non-empty array; each validated against the expected tile count and its layer-type rules.
     * @returns {{ errors: string[], warnings: string[] }}
     */
    validateLayers(layers, worldSize, colorMappings) {
        const errors = [];
        const warnings = [];

        if (!Array.isArray(layers)) {
            errors.push('"layers" must be an array');
            return { errors, warnings };
        }
        if (layers.length === 0) {
            errors.push('"layers" must contain at least one layer');
            return { errors, warnings };
        }

        if (!layers.some(l => l && (l.layer_type === 'Floor' || l.layer_type === 'Showfloor'))) {
            warnings.push('No "Floor" layer found — a Floor layer is normally required for a playable map');
        }

        const expectedTileCount = (typeof worldSize === 'number') ? worldSize * worldSize : null;

        layers.forEach((layer, index) => {
            const res = this.validateLayer(layer, index, expectedTileCount, colorMappings);
            errors.push(...res.errors);
            warnings.push(...res.warnings);
        });

        return { errors, warnings };
    }

    /**
     * A single layer: valid layer_type, a palette of known colours, and RLE color_data whose
     * indices are in range, whose counts are positive, and whose total equals world_size².
     * @returns {{ errors: string[], warnings: string[] }}
     */
    validateLayer(layer, index, expectedTileCount, colorMappings) {
        const errors = [];
        const warnings = [];
        const prefix = `Layer ${index} (${layer && layer.layer_type ? layer.layer_type : 'unknown'})`;

        if (!layer || typeof layer !== 'object') {
            errors.push(`${prefix}: layer must be an object`);
            return { errors, warnings };
        }

        const layerType = layer.layer_type;
        if (!layerType || !this.validLayerTypes.includes(layerType)) {
            errors.push(`${prefix}: invalid layer_type "${layerType}" — must be one of: ${this.validLayerTypes.join(', ')}`);
            return { errors, warnings };
        }

        // "None" has no data channel; nothing further to validate.
        if (layerType === 'None') {
            return { errors, warnings };
        }

        const info = this.layerTypeInfo[layerType];

        // Base64-encoded RLE: structural checks only (decoding mirrors base64-rle-encoder.js and
        // is out of scope here — flag, don't deep-validate).
        if (layer.encoding === 'rle-base64-v1') {
            if (typeof layer.data_b64 !== 'string' || layer.data_b64.length === 0) {
                errors.push(`${prefix}: encoding "rle-base64-v1" requires a non-empty "data_b64" string`);
            }
            if (!Array.isArray(layer.palette) || layer.palette.length === 0) {
                errors.push(`${prefix}: encoding "rle-base64-v1" requires a non-empty "palette" array`);
            }
            warnings.push(`${prefix}: base64-encoded layer — tile count and value ranges not deep-validated`);
            this.checkPaletteColors(layer.palette, info, colorMappings, prefix, errors);
            return { errors, warnings };
        }

        // Array RLE (the editor's default export).
        if (!Array.isArray(layer.color_data)) {
            errors.push(`${prefix}: missing "color_data" array (or "data_b64" with encoding "rle-base64-v1")`);
            return { errors, warnings };
        }
        if (layer.color_data.length === 0) {
            errors.push(`${prefix}: "color_data" must have at least one RLE run`);
            return { errors, warnings };
        }

        const hasPalette = Array.isArray(layer.palette) && layer.palette.length > 0;
        if (hasPalette) {
            this.checkPaletteColors(layer.palette, info, colorMappings, prefix, errors);
            this.validatePaletteRLE(layer, info, expectedTileCount, colorMappings, prefix, errors);
        } else {
            // Format 1 legacy direct RLE: [{ color, count }].
            warnings.push(`${prefix}: no "palette" — validating as legacy direct RLE ({color,count}); the editor exports palette form`);
            this.validateDirectRLE(layer.color_data, expectedTileCount, prefix, errors);
        }

        return { errors, warnings };
    }

    /**
     * Every palette colour must exist in the matching color_mappings category, and (for ranged
     * channels) its resolved value must be within range. Mirrors the loader's MapColorToValue.
     */
    checkPaletteColors(palette, info, colorMappings, prefix, errors) {
        if (!info || !Array.isArray(palette)) {
            return;
        }
        const table = colorMappings && colorMappings[info.category];
        if (!table || typeof table !== 'object') {
            // Missing category already reported by validateColorMappings; can't resolve here.
            return;
        }

        palette.forEach((color, i) => {
            if (typeof color !== 'string' || !this.isHexColor(color)) {
                errors.push(`${prefix}: palette[${i}] "${color}" is not a #rrggbb colour`);
                return;
            }
            const entry = table[color.toLowerCase()];
            if (!entry) {
                errors.push(`${prefix}: palette colour "${color}" is not defined in color_mappings.${info.category}`);
                return;
            }
            if (info.max !== null && typeof entry.value === 'number' && entry.value > info.max) {
                errors.push(`${prefix}: ${info.label} value ${entry.value} (palette colour "${color}") exceeds max ${info.max}`);
            }
        });
    }

    /**
     * Palette-form color_data: array of [paletteIndex, count]; indices in range, counts positive,
     * total tiles == world_size².
     */
    validatePaletteRLE(layer, info, expectedTileCount, colorMappings, prefix, errors) {
        const paletteLen = layer.palette.length;
        let total = 0;

        layer.color_data.forEach((run, i) => {
            if (!Array.isArray(run) || run.length !== 2) {
                errors.push(`${prefix}: color_data[${i}] must be a [paletteIndex, count] pair`);
                return;
            }
            const [idx, count] = run;
            if (!Number.isInteger(idx) || idx < 0 || idx >= paletteLen) {
                errors.push(`${prefix}: color_data[${i}] palette index ${idx} out of range [0, ${paletteLen - 1}]`);
            }
            if (!Number.isInteger(count) || count <= 0) {
                errors.push(`${prefix}: color_data[${i}] count must be a positive integer (got ${count})`);
            } else {
                total += count;
            }
        });

        if (expectedTileCount !== null && total !== expectedTileCount) {
            errors.push(`${prefix}: total tile count ${total} does not match expected ${expectedTileCount} (world_size²)`);
        }
    }

    /**
     * Legacy direct RLE: array of { color, count }.
     */
    validateDirectRLE(colorData, expectedTileCount, prefix, errors) {
        let total = 0;
        colorData.forEach((run, i) => {
            if (!run || typeof run !== 'object') {
                errors.push(`${prefix}: color_data[${i}] must be a { color, count } object`);
                return;
            }
            if (typeof run.color !== 'string' || !this.isHexColor(run.color)) {
                errors.push(`${prefix}: color_data[${i}].color must be a #rrggbb colour`);
            }
            if (!Number.isInteger(run.count) || run.count <= 0) {
                errors.push(`${prefix}: color_data[${i}].count must be a positive integer (got ${run.count})`);
            } else {
                total += run.count;
            }
        });

        if (expectedTileCount !== null && total !== expectedTileCount) {
            errors.push(`${prefix}: total tile count ${total} does not match expected ${expectedTileCount} (world_size²)`);
        }
    }

    /** #rgb or #rrggbb hex colour. */
    isHexColor(value) {
        return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
    }

    /**
     * Format a validation result as a human-readable report.
     */
    generateReport(result) {
        const lines = ['=== JSON-RLE Validation Report ===\n'];
        lines.push(result.valid ? '✅ VALIDATION PASSED\n' : '❌ VALIDATION FAILED\n');

        if (result.errors.length > 0) {
            lines.push(`\nErrors (${result.errors.length}):`);
            result.errors.forEach((e, i) => lines.push(`  ${i + 1}. ${e}`));
        }
        if (result.warnings.length > 0) {
            lines.push(`\nWarnings (${result.warnings.length}):`);
            result.warnings.forEach((w, i) => lines.push(`  ${i + 1}. ${w}`));
        }
        if (result.valid && result.warnings.length === 0) {
            lines.push('\nNo errors or warnings detected.');
            lines.push('World data conforms to the TSIC JSON-RLE specification.');
        }
        return lines.join('\n');
    }

    validateWithReport(rleData) {
        const result = this.validate(rleData);
        return { ...result, report: this.generateReport(result) };
    }

    isValid(rleData) {
        return this.validate(rleData).valid;
    }

    /**
     * RLE compression stats for the palette-form export (one channel per layer).
     */
    getCompressionStats(rleData) {
        if (!rleData || !rleData.metadata || !Array.isArray(rleData.layers)) {
            return null;
        }

        const worldSize = rleData.metadata.world_size;
        const layerCount = rleData.layers.length;
        const totalTiles = worldSize * worldSize * layerCount;

        let totalRLEEntries = 0;
        rleData.layers.forEach(layer => {
            totalRLEEntries += Array.isArray(layer.color_data) ? layer.color_data.length : 0;
        });

        const compressionRatio = totalTiles > 0 ? (totalRLEEntries / totalTiles) * 100 : 0;

        return {
            worldSize,
            layerCount,
            totalTiles,
            totalRLEEntries,
            compressionRatio: compressionRatio.toFixed(2) + '%',
            efficiency: compressionRatio < 50 ? 'Excellent' :
                        compressionRatio < 75 ? 'Good' :
                        compressionRatio < 90 ? 'Fair' : 'Poor'
        };
    }
}

// Singleton (referenced as a global by app.js) plus standard exports for tests/modules.
const rleValidator = new RLEValidator();

if (typeof window !== 'undefined') {
    window.RLEValidator = RLEValidator;
    window.rleValidator = rleValidator;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RLEValidator, rleValidator };
}
