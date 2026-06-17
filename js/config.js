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

        // INLINE TSIC CONFIG - COPY OF biomes.json (v3.0 - Updated 2026)
        this.config = {"version":"3.0","comment":"JSON-RLE World Format Configuration - Matches TSIC Unreal Engine Enums","tilesets":{"Biome_Empty":{"color":"#FFFFFF","value":0,"icon":"⬜","tag":"Tile.Biome.Empty","category":"Biomes","displayName":"Empty","description":"Empty tile (for Sky, Floor, Underground)"},"Biome_ShowFloor":{"color":"#FF6B6B","value":1,"icon":"🏬","tag":"Tile.Biome.ShowFloor","category":"Biomes","displayName":"Show Floor","description":"Store showroom floor"},"Biome_Restaurant":{"color":"#F7DC6F","value":2,"icon":"🍽️","tag":"Tile.Biome.Restaurant","category":"Biomes","displayName":"Restaurant","description":"Food court/restaurant area"},"Biome_Warehouse":{"color":"#4ECDC4","value":3,"icon":"📦","tag":"Tile.Biome.Warehouse","category":"Biomes","displayName":"Warehouse","description":"Storage/loading dock"},"Biome_SCPBase":{"color":"#AED6F1","value":4,"icon":"🔬","tag":"Tile.Biome.SCPBase","category":"Biomes","displayName":"SCP Base","description":"Main SCP base area"},"Biome_SCPBaseEntrance":{"color":"#3B82F6","value":5,"icon":"⬇️","tag":"Tile.Biome.SCPBaseEntrance","category":"Biomes","displayName":"SCP Entrance","description":"Entry point to SCP base"},"Biome_Map":{"color":"#F59E0B","value":6,"icon":"🗺️","tag":"Tile.Biome.Map","category":"Biomes","displayName":"Map Kiosk","description":"Map kiosk location"},"Biome_HelpPoint":{"color":"#BB8FCE","value":7,"icon":"❓","tag":"Tile.Biome.HelpPoint","category":"Biomes","displayName":"Help Point","description":"Player assistance location"},"Biome_SCPBaseExit":{"color":"#1E40AF","value":8,"icon":"⬆️","tag":"Tile.Biome.SCPBaseExit","category":"Biomes","displayName":"SCP Exit","description":"Exit point from SCP base"},"Biome_SCPBasePower":{"color":"#FBBF24","value":9,"icon":"⚡","tag":"Tile.Biome.SCPBasePower","category":"Biomes","displayName":"SCP Power","description":"SCP base power room"},"Biome_AbandonedCamp":{"color":"#8B4513","value":10,"icon":"🏕️","tag":"Tile.Biome.AbandonedCamp","category":"Biomes","displayName":"Abandoned Camp","description":"Previous survivor camp"},"Biome_Kids":{"color":"#FF69B4","value":11,"icon":"🧸","tag":"Tile.Biome.Kids","category":"Biomes","displayName":"Kids Area","description":"Children's store/play area"},"Biome_Gardening":{"color":"#22C55E","value":12,"icon":"🌱","tag":"Tile.Biome.Gardening","category":"Biomes","displayName":"Garden Center","description":"Garden center"},"Biome_SkyEmpty":{"color":"#B8B8B8","value":13,"icon":"☁️","tag":"Tile.Biome.SkyEmpty","category":"Biomes","displayName":"Sky (Empty)","description":"Empty sky/void tiles"},"Biome_SkyCeiling":{"color":"#87CEEB","value":14,"icon":"🏠","tag":"Tile.Biome.SkyCeiling","category":"Biomes","displayName":"Sky (Ceiling)","description":"Ceiling tiles (skybox)"},"Biome_Bathroom":{"color":"#2563EB","value":15,"icon":"🚻","tag":"Tile.Biome.Bathroom","category":"Biomes","displayName":"Bathroom","description":"Restroom facilities"},"Biome_CarPark":{"color":"#6B7280","value":16,"icon":"🅿️","tag":"Tile.Biome.CarPark","category":"Biomes","displayName":"Car Park","description":"Main parking area"},"Biome_CarParkEntrance":{"color":"#9CA3AF","value":17,"icon":"🚗","tag":"Tile.Biome.CarParkEntrance","category":"Biomes","displayName":"Car Park Entrance","description":"Entry point to car park"},"Biome_CarParkExit":{"color":"#4B5563","value":18,"icon":"🚕","tag":"Tile.Biome.CarParkExit","category":"Biomes","displayName":"Car Park Exit","description":"Exit point from car park"},"Biome_StaffRoom":{"color":"#DEB887","value":19,"icon":"👔","tag":"Tile.Biome.StaffRoom","category":"Biomes","displayName":"Staff Room","description":"Employee break room"},"Biome_Blocked":{"color":"#2F2F2F","value":20,"icon":"🚫","tag":"Tile.Biome.Blocked","category":"Biomes","displayName":"Blocked","description":"Permanently blocked tile"},"Biome_Pit":{"color":"#2F1B0C","value":21,"icon":"🕳️","tag":"Tile.Biome.Pit","category":"Biomes","displayName":"Pit","description":"Dangerous pit/hole"},"Biome_LostAndFound":{"color":"#9370DB","value":22,"icon":"📋","tag":"Tile.Biome.LostAndFound","category":"POI","displayName":"Lost & Found","description":"Lost and found area"},"Biome_Spawn":{"color":"#00FF7F","value":23,"icon":"🎯","tag":"Tile.Biome.Spawn","category":"Biomes","displayName":"Spawn","description":"Player spawn point"},"Biome_BrokenEmpty":{"color":"#5C4033","value":24,"icon":"💔","tag":"Tile.Biome.BrokenEmpty","category":"Biomes","displayName":"Broken Empty","description":"Broken/damaged empty area"},"Difficulty_Easy":{"color":"#90EE90","value":0,"icon":"😊","tag":"Difficulty.Easy","category":"Difficulty","displayName":"Easy","description":"Low enemy density, weaker enemies"},"Difficulty_Normal":{"color":"#FFD700","value":1,"icon":"😐","tag":"Difficulty.Normal","category":"Difficulty","displayName":"Normal","description":"Moderate enemy presence"},"Difficulty_Hard":{"color":"#FF8C00","value":2,"icon":"😰","tag":"Difficulty.Hard","category":"Difficulty","displayName":"Hard","description":"High enemy density, stronger enemies"},"Difficulty_Nightmare":{"color":"#FF6347","value":3,"icon":"💀","tag":"Difficulty.Nightmare","category":"Difficulty","displayName":"Nightmare","description":"Very dangerous, elite enemies"},"Difficulty_Apocalypse":{"color":"#8B0000","value":4,"icon":"☠️","tag":"Difficulty.Apocalypse","category":"Difficulty","displayName":"Apocalypse","description":"Maximum difficulty, overwhelming enemies"},"Hazard_None":{"color":"#1a1a1a","value":0,"icon":"✓","tag":"Hazard.None","category":"Hazards","displayName":"None","description":"No environmental hazard"},"Hazard_Radiation":{"color":"#39FF14","value":1,"icon":"☢️","tag":"Hazard.Radiation","category":"Hazards","displayName":"Radiation","description":"Gradual radiation damage"},"Hazard_Freezing":{"color":"#87CFEC","value":2,"icon":"❄️","tag":"Hazard.Freezing","category":"Hazards","displayName":"Freezing","description":"Cold damage, slows movement"},"Height_0":{"color":"#0a0a0a","value":0,"icon":"0️⃣","tag":"Height.0","category":"Height","displayName":"0","description":"Height level 0"},"Height_1":{"color":"#1a1a2e","value":1,"icon":"1️⃣","tag":"Height.1","category":"Height","displayName":"1","description":"Height level 1"},"Height_2":{"color":"#525d6b","value":2,"icon":"2️⃣","tag":"Height.2","category":"Height","displayName":"2","description":"Height level 2"},"Height_3":{"color":"#778994","value":3,"icon":"3️⃣","tag":"Height.3","category":"Height","displayName":"3","description":"Height level 3"},"Height_4":{"color":"#9db5bd","value":4,"icon":"4️⃣","tag":"Height.4","category":"Height","displayName":"4","description":"Height level 4"},"Height_5":{"color":"#b0cbd1","value":5,"icon":"5️⃣","tag":"Height.5","category":"Height","displayName":"5","description":"Height level 5"},"Height_6":{"color":"#c3e1e6","value":6,"icon":"6️⃣","tag":"Height.6","category":"Height","displayName":"6","description":"Height level 6"},"Height_7":{"color":"#d6f5fa","value":7,"icon":"7️⃣","tag":"Height.7","category":"Height","displayName":"7","description":"Height level 7"},"Height_8":{"color":"#e8f7fa","value":8,"icon":"8️⃣","tag":"Height.8","category":"Height","displayName":"8","description":"Height level 8"},"Height_9":{"color":"#ffffff","value":9,"icon":"9️⃣","tag":"Height.9","category":"Height","displayName":"9","description":"Height level 9"}},"layers":[{"name":"Height","visible":true,"opacity":0.2,"locked":false,"editable":true,"layerType":"Height","worldLayer":"Height","required":false,"description":"Height/elevation data layer"},{"name":"Difficulty","visible":true,"opacity":0.2,"locked":false,"editable":true,"layerType":"Difficulty","worldLayer":"Difficulty","required":false,"description":"Enemy difficulty zones"},{"name":"Hazard","visible":true,"opacity":0.2,"locked":false,"editable":true,"layerType":"Hazard","worldLayer":"Hazard","required":false,"description":"Environmental hazard overlay"},{"name":"Sky","visible":true,"opacity":0.2,"locked":false,"editable":true,"layerType":"Sky","worldLayer":"Sky","required":false,"description":"Upper ceiling/sky layer"},{"name":"Floor","visible":true,"opacity":0.2,"locked":false,"editable":true,"layerType":"Floor","worldLayer":"Floor","required":false,"description":"Main ground level layer"},{"name":"Underground","visible":true,"opacity":0.2,"locked":false,"editable":true,"layerType":"Underground","worldLayer":"Underground","required":false,"description":"Basement/underground areas"}],"dataTypes":[{"type":"biome","name":"Biome","description":"Biome/room type","valueRange":[0,24],"defaultValue":0},{"type":"height","name":"Height","description":"Elevation/height","valueRange":[0,9],"defaultValue":2},{"type":"difficulty","name":"Difficulty","description":"Enemy difficulty level","valueRange":[0,4],"defaultValue":0},{"type":"hazard","name":"Hazard","description":"Environmental hazard type","valueRange":[0,2],"defaultValue":0}],"defaultGridSize":{"width":256,"height":256},"availableSizes":[{"value":256,"label":"256×256 (Small)","default":true},{"value":512,"label":"512×512 (Standard)"},{"value":1024,"label":"1024×1024 (Large)"},{"value":2048,"label":"2048×2048 (Extra Large)"}],"enumMappings":{"ETileBiome":{"Empty":0,"ShowFloor":1,"Restaurant":2,"Warehouse":3,"SCPBase":4,"SCPBaseEntrance":5,"Map":6,"HelpPoint":7,"SCPBaseExit":8,"SCPBasePower":9,"AbandonedCamp":10,"Kids":11,"Gardening":12,"SkyEmpty":13,"SkyCeiling":14,"Bathroom":15,"CarPark":16,"CarParkEntrance":17,"CarParkExit":18,"StaffRoom":19,"Blocked":20,"Pit":21,"LostAndFound":22,"Spawn":23,"BrokenEmpty":24},"ECurrentStoreDifficulty":{"Easy":0,"Normal":1,"Hard":2,"Nightmare":3,"Apocalypse":4},"EEnvironmentalHazardType":{"None":0,"Radiation":1,"Freezing":2},"EWorldLayerType":{"None":0,"Floor":1,"Sky":2,"Underground":3,"Hazard":4}}};

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
