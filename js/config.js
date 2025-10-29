/**
 * Configuration Manager
 * Loads and manages biome configuration from JSON
 */

class ConfigManager {
    constructor() {
        this.config = null;
        this.tilesets = {};
        this.layers = [];
        this.defaultGridSize = { width: 256, height: 256 };
    }

    /**
     * Load configuration from JSON file
     */
    async loadConfig(configPath = 'config/biomes.json') {
        try {
            // Add cache-busting timestamp to force fresh load
            const cacheBuster = `?v=${Date.now()}`;
            const response = await fetch(configPath + cacheBuster);
            if (!response.ok) {
                throw new Error(`Failed to load config: ${response.statusText}`);
            }

            this.config = await response.json();
            this.parseConfig();
            return true;
        } catch (error) {
            console.error('Error loading config:', error);
            // Use default config
            this.createDefaultConfig();
            return false;
        }
    }

    /**
     * Parse loaded configuration
     */
    parseConfig() {
        if (this.config.tilesets) {
            this.tilesets = this.config.tilesets;
        }

        if (this.config.layers) {
            this.layers = this.config.layers;
        }

        if (this.config.defaultGridSize) {
            this.defaultGridSize = this.config.defaultGridSize;
        }
    }

    /**
     * Create default configuration if loading fails
     * Using inline TSIC configuration as fallback
     */
    createDefaultConfig() {
        console.warn('Using embedded TSIC configuration - config/biomes.json failed to load');

        // INLINE TSIC CONFIG - COPY OF biomes.json (v3.0 - Updated 2025)
        this.config = { "version": "3.0", "comment": "JSON-RLE World Format Configuration - Matches TSIC Unreal Engine Enums", "tilesets": { "Biome_None": { "color": "#000000", "value": 0, "tag": "Biome.None", "category": "Biomes", "description": "Empty/unassigned tile" }, "Biome_ShowFloor": { "color": "#FF6B6B", "value": 1, "tag": "Biome.ShowFloor", "category": "Biomes", "description": "Store showroom floor" }, "Biome_Restaurant": { "color": "#F7DC6F", "value": 2, "tag": "Biome.Restaurant", "category": "Biomes", "description": "Food court/restaurant area" }, "Biome_Warehouse": { "color": "#4ECDC4", "value": 3, "tag": "Biome.Warehouse", "category": "Biomes", "description": "Storage/loading dock" }, "Biome_SCPBase": { "color": "#1E3A8A", "value": 4, "tag": "Biome.SCPBase", "category": "Biomes", "description": "SCP Foundation base (safe zone)" }, "Biome_SCPBaseEntrance": { "color": "#3B82F6", "value": 5, "tag": "Biome.SCPBaseEntrance", "category": "Biomes", "description": "Entry point to SCP base" }, "Biome_Map": { "color": "#F59E0B", "value": 6, "tag": "Biome.Map", "category": "Biomes", "description": "Map kiosk location" }, "Biome_HelpPoint": { "color": "#BB8FCE", "value": 7, "tag": "Biome.HelpPoint", "category": "Biomes", "description": "Player assistance location" }, "Biome_Backrooms": { "color": "#E5D68A", "value": 8, "tag": "Biome.Backrooms", "category": "Biomes", "description": "Liminal space areas" }, "Biome_SCPBaseExit": { "color": "#10B981", "value": 9, "tag": "Biome.SCPBaseExit", "category": "Biomes", "description": "Exit from SCP base" }, "Biome_SCPBasePower": { "color": "#0EA5E9", "value": 10, "tag": "Biome.SCPBasePower", "category": "Biomes", "description": "Power room in SCP base" }, "Biome_AbandonedCamp": { "color": "#8B4513", "value": 11, "tag": "Biome.AbandonedCamp", "category": "Biomes", "description": "Previous survivor camp" }, "Biome_Kids": { "color": "#FF69B4", "value": 12, "tag": "Biome.Kids", "category": "Biomes", "description": "Children's store/play area" }, "Biome_Gardening": { "color": "#22C55E", "value": 13, "tag": "Biome.Gardening", "category": "Biomes", "description": "Garden center" }, "Biome_SkyEmpty": { "color": "#D3D3D3", "value": 14, "tag": "Biome.SkyEmpty", "category": "Biomes", "description": "Empty sky/void tiles" }, "Biome_SkyCeiling": { "color": "#87CEEB", "value": 15, "tag": "Biome.SkyCeiling", "category": "Biomes", "description": "Ceiling tiles (skybox)" }, "Biome_Bathroom": { "color": "#AED6F1", "value": 16, "tag": "Biome.Bathroom", "category": "Biomes", "description": "Restroom facilities" }, "Biome_CarPark": { "color": "#4A4A4A", "value": 17, "tag": "Biome.CarPark", "category": "Biomes", "description": "Parking garage" }, "Biome_CarParkEntrance": { "color": "#6B7280", "value": 18, "tag": "Biome.CarParkEntrance", "category": "Biomes", "description": "Parking entrance/ramp" }, "Biome_CarParkExit": { "color": "#9CA3AF", "value": 19, "tag": "Biome.CarParkExit", "category": "Biomes", "description": "Parking exit/ramp" }, "Biome_StaffRoom": { "color": "#DEB887", "value": 20, "tag": "Biome.StaffRoom", "category": "Biomes", "description": "Employee break room" }, "Biome_Blocked": { "color": "#2F2F2F", "value": 21, "tag": "Biome.Blocked", "category": "Biomes", "description": "Permanently blocked tile" }, "Biome_Pit": { "color": "#2F1B0C", "value": 22, "tag": "Biome.Pit", "category": "Biomes", "description": "Dangerous pit/hole" }, "Difficulty_Easy": { "color": "#90EE90", "value": 0, "tag": "Difficulty.Easy", "category": "Difficulty", "description": "Low enemy density, weaker enemies" }, "Difficulty_Normal": { "color": "#FFD700", "value": 1, "tag": "Difficulty.Normal", "category": "Difficulty", "description": "Moderate enemy presence" }, "Difficulty_Hard": { "color": "#FF8C00", "value": 2, "tag": "Difficulty.Hard", "category": "Difficulty", "description": "High enemy density, stronger enemies" }, "Difficulty_Nightmare": { "color": "#FF6347", "value": 3, "tag": "Difficulty.Nightmare", "category": "Difficulty", "description": "Very dangerous, elite enemies" }, "Difficulty_Apocalypse": { "color": "#8B0000", "value": 4, "tag": "Difficulty.Apocalypse", "category": "Difficulty", "description": "Maximum difficulty, overwhelming enemies" }, "Hazard_None": { "color": "#1a1a1a", "value": 0, "tag": "Hazard.None", "category": "Hazards", "description": "No environmental hazard" }, "Hazard_Radiation": { "color": "#39FF14", "value": 1, "tag": "Hazard.Radiation", "category": "Hazards", "description": "Gradual radiation damage" }, "Hazard_Freezing": { "color": "#87CEEB", "value": 2, "tag": "Hazard.Freezing", "category": "Hazards", "description": "Cold damage, slows movement" }, "Height_Underground_Deep": { "color": "#0a0a0a", "value": 0, "tag": "Height.Underground.Deep", "category": "Height", "description": "Deep underground" }, "Height_Underground": { "color": "#1a1a2e", "value": 32, "tag": "Height.Underground", "category": "Height", "description": "Underground level" }, "Height_Ground": { "color": "#525d6b", "value": 64, "tag": "Height.Ground", "category": "Height", "description": "Ground floor" }, "Height_Ground_Mid": { "color": "#778994", "value": 96, "tag": "Height.Ground.Mid", "category": "Height", "description": "Mid ground level" }, "Height_Elevated": { "color": "#9db5bd", "value": 128, "tag": "Height.Elevated", "category": "Height", "description": "Elevated platform" }, "Height_Elevated_Mid": { "color": "#b0cbd1", "value": 160, "tag": "Height.Elevated.Mid", "category": "Height", "description": "Mid elevated level" }, "Height_Upper": { "color": "#c3e1e6", "value": 192, "tag": "Height.Upper", "category": "Height", "description": "Upper floor" }, "Height_Upper_High": { "color": "#d6f5fa", "value": 224, "tag": "Height.Upper.High", "category": "Height", "description": "High upper level" }, "Height_Max": { "color": "#ffffff", "value": 255, "tag": "Height.Max", "category": "Height", "description": "Maximum height" } }, "layers": [ { "name": "Height", "visible": true, "opacity": 0.5, "locked": false, "editable": true, "layerType": "Height", "worldLayer": "Height", "required": false, "description": "Height/elevation data layer" }, { "name": "Difficulty", "visible": true, "opacity": 0.6, "locked": false, "editable": true, "layerType": "Difficulty", "worldLayer": "Difficulty", "required": false, "description": "Enemy difficulty zones" }, { "name": "Hazard", "visible": true, "opacity": 0.6, "locked": false, "editable": true, "layerType": "Hazard", "worldLayer": "Hazard", "required": false, "description": "Environmental hazard overlay" }, { "name": "Sky", "visible": true, "opacity": 0.7, "locked": false, "editable": true, "layerType": "Sky", "worldLayer": "Sky", "required": false, "description": "Upper ceiling/sky layer" }, { "name": "Floor", "visible": true, "opacity": 0.75, "locked": false, "editable": true, "layerType": "Floor", "worldLayer": "Floor", "required": false, "description": "Main ground level layer" }, { "name": "Underground", "visible": true, "opacity": 0.7, "locked": false, "editable": true, "layerType": "Underground", "worldLayer": "Underground", "required": false, "description": "Basement/underground areas" } ], "dataTypes": [ { "type": "biome", "name": "Biome", "description": "Biome/room type", "valueRange": [0, 22], "defaultValue": 0 }, { "type": "height", "name": "Height", "description": "Elevation/height", "valueRange": [0, 255], "defaultValue": 64 }, { "type": "difficulty", "name": "Difficulty", "description": "Enemy difficulty level", "valueRange": [0, 4], "defaultValue": 0 }, { "type": "hazard", "name": "Hazard", "description": "Environmental hazard type", "valueRange": [0, 2], "defaultValue": 0 } ], "defaultGridSize": { "width": 512, "height": 512 }, "availableSizes": [ { "value": 256, "label": "256×256 (Small)" }, { "value": 512, "label": "512×512 (Standard)", "default": true }, { "value": 1024, "label": "1024×1024 (Large)" }, { "value": 2048, "label": "2048×2048 (Extra Large)" } ], "enumMappings": { "ETileBiome": { "None": 0, "ShowFloor": 1, "Restaurant": 2, "Warehouse": 3, "SCPBase": 4, "SCPBaseEntrance": 5, "Map": 6, "HelpPoint": 7, "Backrooms": 8, "SCPBaseExit": 9, "SCPBasePower": 10, "AbandonedCamp": 11, "Kids": 12, "Gardening": 13, "SkyEmpty": 14, "SkyCeiling": 15, "Bathroom": 16, "CarPark": 17, "CarParkEntrance": 18, "CarParkExit": 19, "StaffRoom": 20, "Blocked": 21, "Pit": 22 }, "ECurrentStoreDifficulty": { "Easy": 0, "Normal": 1, "Hard": 2, "Nightmare": 3, "Apocalypse": 4 }, "EEnvironmentalHazardType": { "None": 0, "Radiation": 1, "Freezing": 2 }, "EWorldLayerType": { "None": 0, "Floor": 1, "Sky": 2, "Underground": 3, "Hazard": 4 } }};

        this.parseConfig();
    }

    /**
     * Get all tilesets
     */
    getTilesets() {
        return this.tilesets;
    }

    /**
     * Get tileset by name
     */
    getTileset(name) {
        return this.tilesets[name] || null;
    }

    /**
     * Get tileset by color
     */
    getTilesetByColor(color) {
        for (const [name, tileset] of Object.entries(this.tilesets)) {
            if (tileset.color.toLowerCase() === color.toLowerCase()) {
                return { name, ...tileset };
            }
        }
        return null;
    }

    /**
     * Get tileset by gameplay tag
     */
    getTilesetByTag(tag) {
        for (const [name, tileset] of Object.entries(this.tilesets)) {
            if (tileset.tag === tag) {
                return { name, ...tileset };
            }
        }
        return null;
    }

    /**
     * Get layers configuration
     */
    getLayers() {
        return this.layers;
    }

    /**
     * Get default grid size
     */
    getDefaultGridSize() {
        return this.defaultGridSize;
    }

    /**
     * Get tilesets grouped by category
     */
    getTilesetsByCategory() {
        const categories = {};

        for (const [name, tileset] of Object.entries(this.tilesets)) {
            const category = tileset.category || 'Other';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push({ name, ...tileset });
        }

        return categories;
    }
}

// Export singleton instance
const configManager = new ConfigManager();

// Expose to window for testing
if (typeof window !== 'undefined') {
    window.configManager = configManager;
}
