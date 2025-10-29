/**
 * Color-to-Enum Mapping System
 * Maps hex colors to enum values and provides reverse lookup
 */

class ColorMapper {
    constructor() {
        // Maps: color hex -> {value, category, tag, name}
        this.colorToEnum = new Map();

        // Maps: value + category -> {color, tag, name}
        this.enumToColor = new Map();

        // Maps: category -> default color
        this.categoryDefaults = new Map();
    }

    /**
     * Load mappings from config
     * @param {object} config - Config object from biomes.json
     */
    loadFromConfig(config) {
        if (!config || !config.tilesets) {
            console.error('[ColorMapper] Invalid config');
            return false;
        }

        this.colorToEnum.clear();
        this.enumToColor.clear();
        this.categoryDefaults.clear();

        // Build bidirectional mappings
        for (const [name, tileset] of Object.entries(config.tilesets)) {
            const color = tileset.color.toLowerCase();
            const value = tileset.value;
            const category = tileset.category;
            const tag = tileset.tag;

            // Color -> Enum
            this.colorToEnum.set(color, {
                value,
                category,
                tag,
                name
            });

            // Enum -> Color (keyed by "category:value")
            const enumKey = `${category}:${value}`;
            this.enumToColor.set(enumKey, {
                color,
                tag,
                name
            });

            // Store defaults (value 0 for each category)
            if (value === 0 || (category === 'Height' && value === 64)) {
                this.categoryDefaults.set(category, color);
            }
        }

        console.log(`[ColorMapper] Loaded ${this.colorToEnum.size} color mappings`);
        return true;
    }

    /**
     * Get enum value and metadata from color
     * @param {string} color - Hex color (e.g., "#FF6B6B")
     * @returns {object|null} - {value, category, tag, name} or null
     */
    getEnumFromColor(color) {
        if (!color) return null;
        return this.colorToEnum.get(color.toLowerCase()) || null;
    }

    /**
     * Get color from enum value and category
     * @param {string} category - Category name (e.g., "Biomes")
     * @param {number} value - Enum value
     * @returns {object|null} - {color, tag, name} or null
     */
    getColorFromEnum(category, value) {
        const key = `${category}:${value}`;
        return this.enumToColor.get(key) || null;
    }

    /**
     * Get default color for a category
     * @param {string} category - Category name
     * @returns {string|null} - Hex color or null
     */
    getDefaultColor(category) {
        return this.categoryDefaults.get(category) || null;
    }

    /**
     * Get all colors for a category
     * @param {string} category - Category name
     * @returns {Array} - Array of {color, value, tag, name}
     */
    getColorsForCategory(category) {
        const colors = [];
        for (const [color, data] of this.colorToEnum.entries()) {
            if (data.category === category) {
                colors.push({
                    color,
                    value: data.value,
                    tag: data.tag,
                    name: data.name
                });
            }
        }
        return colors.sort((a, b) => a.value - b.value);
    }

    /**
     * Check if a color exists in mappings
     * @param {string} color - Hex color
     * @returns {boolean}
     */
    hasColor(color) {
        return this.colorToEnum.has(color.toLowerCase());
    }

    /**
     * Get summary of loaded mappings
     * @returns {object} - Statistics
     */
    getSummary() {
        const categories = {};
        for (const data of this.colorToEnum.values()) {
            categories[data.category] = (categories[data.category] || 0) + 1;
        }

        return {
            totalColors: this.colorToEnum.size,
            categories,
            defaults: Array.from(this.categoryDefaults.entries())
        };
    }
}

// Export singleton
const colorMapper = new ColorMapper();

if (typeof window !== 'undefined') {
    window.colorMapper = colorMapper;
    window.ColorMapper = ColorMapper;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { colorMapper, ColorMapper };
}
