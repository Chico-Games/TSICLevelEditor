/**
 * Main Application
 * Initializes the editor and handles UI interactions
 */

console.log('[APP] ========== app.js LOADED ==========');
console.log('[APP] Load time:', new Date().toISOString());

// Global error handler to catch unhandled errors
window.addEventListener('error', (event) => {
    console.error('[APP] UNHANDLED ERROR:', event.error);
    console.error('[APP] Message:', event.message);
    console.error('[APP] Source:', event.filename, 'line', event.lineno);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('[APP] UNHANDLED PROMISE REJECTION:', event.reason);
});

let editor = null;
let dynamicValidator = null;

// Expose editor and configManager to window for testing
window.editor = editor;
window.configManager = window.configManager || configManager;

/**
 * Helper function to exit solo mode cleanly
 */
function exitSoloMode() {
    if (!editor || !editor.layerSoloMode) return;

    editor.layerSoloMode = false;
    editor.preSoloVisibility = [];
    editor.preSoloOpacity = 0.8;
    editor.preSoloRecentSelections = [];
}

/**
 * Progress reporting utility - updates status bar with current operation
 * @param {string} message - The progress message to display
 * @param {number} [current] - Current step number (optional)
 * @param {number} [total] - Total steps (optional)
 */
function reportProgress(message, current = null, total = null) {
    const statusEl = document.getElementById('status-message');
    if (!statusEl) return;

    let displayText = message;
    if (current !== null && total !== null) {
        const percent = Math.round((current / total) * 100);
        displayText = `${message} (${current}/${total}) ${percent}%`;
    }

    statusEl.textContent = displayText;
    console.log(`[PROGRESS] ${displayText}`);
}

/**
 * Yield to browser to allow UI updates during heavy operations
 * Call this between expensive synchronous operations
 */
function yieldToBrowser() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Validate all layers for data type mismatches (on-demand, not in hot path)
 * Returns an object with warnings per layer
 */
async function validateAllLayers() {
    console.log('[VALIDATE] ========== Starting layer validation ==========');
    const startTime = performance.now();

    if (!editor || !editor.layerManager) {
        console.warn('[VALIDATE] Editor not initialized');
        return {};
    }

    const allWarnings = {};
    const layers = editor.layerManager.layers;

    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        reportProgress(`Validating layer: ${layer.name}`, i + 1, layers.length);
        await yieldToBrowser();

        const layerStart = performance.now();
        const warnings = checkLayerDataTypes(layer);
        console.log(`[VALIDATE] Layer "${layer.name}": ${warnings.length} warnings, took ${(performance.now() - layerStart).toFixed(1)}ms`);

        if (warnings.length > 0) {
            allWarnings[layer.name] = warnings;
        }
    }

    console.log(`[VALIDATE] ========== Validation complete in ${(performance.now() - startTime).toFixed(1)}ms ==========`);
    reportProgress('Ready');

    return allWarnings;
}

/**
 * Show validation results to user (call before export)
 */
async function showValidationResults() {
    const warnings = await validateAllLayers();
    const warningCount = Object.values(warnings).flat().length;

    if (warningCount === 0) {
        console.log('[VALIDATE] No validation warnings found');
        return true;
    }

    let message = `Found ${warningCount} data type warning(s):\n\n`;
    for (const [layerName, layerWarnings] of Object.entries(warnings)) {
        message += `${layerName}:\n`;
        for (const warning of layerWarnings) {
            message += `  - ${warning}\n`;
        }
    }
    message += '\nContinue anyway?';

    return confirm(message);
}

/**
 * Generate test map using Perlin noise for realistic terrain
 */
function generateTestMap() {
    try {
        if (!editor) {
            console.error('Editor not initialized');
            alert('Editor not initialized. Please reload the page.');
            return;
        }

        if (typeof PerlinNoise === 'undefined') {
            console.error('PerlinNoise not loaded');
            alert('Perlin noise generator not available. Please reload the page.');
            return;
        }

        editor.saveState();

        // Clear all existing data first
        editor.layerManager.layers.forEach(layer => {
            layer.tileData = new Map();
            layer.cacheDirty = true; // CRITICAL: Invalidate cache after clearing
        });

        // Get all tilesets organized by category
        const tilesets = configManager.getTilesets();
        const biomes = [];
        const heights = [];
        const difficulties = [];
        const hazards = [];

        for (const [name, tileset] of Object.entries(tilesets)) {
            switch (tileset.category) {
                case 'Biomes':
                    if (name !== 'Biome_None') biomes.push(name);
                    break;
                case 'Height':
                    heights.push(name);
                    break;
                case 'Difficulty':
                    difficulties.push(name);
                    break;
                case 'Hazards':
                    if (name !== 'Hazard_None') hazards.push(name);
                    break;
            }
        }

        const layers = editor.layerManager.layers;
        const gridWidth = editor.layerManager.width;
        const gridHeight = editor.layerManager.height;

        console.log(`[TestMap] Generating ${gridWidth}x${gridHeight} map with Perlin noise...`);
        console.log(`[TestMap] Found ${biomes.length} biomes, ${heights.length} heights, ${difficulties.length} difficulties, ${hazards.length} hazards`);

        // Create separate noise generators for each layer with different seeds
        const baseSeed = Date.now();

        /**
         * Generate a layer using Perlin noise with color thresholds
         */
        function generatePerlinLayer(layer, colorNames, scale, octaves = 4, persistence = 0.5, lacunarity = 2.0, seed = null) {
            if (!layer || !colorNames || colorNames.length === 0) return;

            const noise = new PerlinNoise(seed || (baseSeed + Math.random() * 1000));

            // Create even distribution of colors across noise values
            const colorRanges = [];
            const step = 1.0 / colorNames.length;

            for (let i = 0; i < colorNames.length; i++) {
                const colorName = colorNames[i];
                const tileset = configManager.getTileset(colorName);
                if (tileset) {
                    colorRanges.push({
                        threshold: i * step,
                        tileset: { name: colorName, ...tileset }
                    });
                }
            }

            console.log(`[TestMap] Generating ${layer.name} with ${colorRanges.length} color ranges, scale=${scale}`);

            // Generate noise map and apply to layer
            let tilesSet = 0;
            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    const sampleX = x / scale;
                    const sampleY = y / scale;

                    const noiseValue = (noise.octaveNoise(sampleX, sampleY, octaves, persistence, lacunarity) + 1) / 2;

                    // Find appropriate color range
                    let selectedTileset = colorRanges[0].tileset;
                    for (const range of colorRanges) {
                        if (noiseValue >= range.threshold) {
                            selectedTileset = range.tileset;
                        } else {
                            break;
                        }
                    }

                    layer.setTile(x, y, selectedTileset.value || 0, selectedTileset);
                    tilesSet++;
                }
            }

            console.log(`[TestMap] ${layer.name}: Set ${tilesSet} tiles`);
        }

        /**
         * Generate multi-scale noise layer (combination of large and small features)
         */
        function generateMultiScaleLayer(layer, colorNames, baseScale, seed = null) {
            if (!layer || !colorNames || colorNames.length === 0) return;

            const noise = new PerlinNoise(seed || (baseSeed + Math.random() * 1000));

            // Create color thresholds
            const colorRanges = [];
            const step = 1.0 / colorNames.length;

            for (let i = 0; i < colorNames.length; i++) {
                const colorName = colorNames[i];
                const tileset = configManager.getTileset(colorName);
                if (tileset) {
                    colorRanges.push({
                        threshold: i * step,
                        tileset: { name: colorName, ...tileset }
                    });
                }
            }

            console.log(`[TestMap] Generating multi-scale ${layer.name} with ${colorRanges.length} colors`);

            // Generate combined noise
            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    // Combine multiple scales for interesting variation
                    const largeFeat = noise.octaveNoise(x / (baseScale * 2), y / (baseScale * 2), 3, 0.5, 2.0);
                    const medFeat = noise.octaveNoise(x / baseScale, y / baseScale, 4, 0.5, 2.0);
                    const smallFeat = noise.octaveNoise(x / (baseScale * 0.5), y / (baseScale * 0.5), 2, 0.6, 2.0);

                    // Weighted combination
                    const combined = (largeFeat * 0.5 + medFeat * 0.3 + smallFeat * 0.2);
                    const noiseValue = (combined + 1) / 2;

                    // Apply color
                    let selectedTileset = colorRanges[0].tileset;
                    for (const range of colorRanges) {
                        if (noiseValue >= range.threshold) {
                            selectedTileset = range.tileset;
                        } else {
                            break;
                        }
                    }

                    layer.setTile(x, y, selectedTileset.value || 0, selectedTileset);
                }
            }
        }

        // Generate Floor layer - Large features (continents, oceans)
        const floorLayer = layers.find(l => l.layerType && l.layerType.toLowerCase() === 'floor') || layers[0];
        if (floorLayer && biomes.length > 0) {
            generateMultiScaleLayer(floorLayer, biomes, 80, baseSeed);
        }

        // Generate Underground layer - Medium features (caves, tunnels)
        const undergroundLayer = layers.find(l => l.layerType && l.layerType.toLowerCase() === 'underground');
        if (undergroundLayer && biomes.length > 0) {
            generateMultiScaleLayer(undergroundLayer, biomes, 60, baseSeed + 1000);
        }

        // Generate Sky layer - Large, smooth features (weather patterns)
        const skyLayer = layers.find(l => l.layerType && l.layerType.toLowerCase() === 'sky');
        if (skyLayer && biomes.length > 0) {
            generatePerlinLayer(skyLayer, biomes, 100, 3, 0.4, 2.0, baseSeed + 2000);
        }

        // Generate Height layer - Elevation (mountains, valleys)
        const heightLayer = layers.find(l => l.layerType && l.layerType.toLowerCase() === 'height');
        if (heightLayer && heights.length > 0) {
            generatePerlinLayer(heightLayer, heights, 70, 5, 0.55, 2.2, baseSeed + 3000);
        }

        // Generate Difficulty layer - Combat zones
        const difficultyLayer = layers.find(l => l.layerType && l.layerType.toLowerCase() === 'difficulty');
        if (difficultyLayer && difficulties.length > 0) {
            generatePerlinLayer(difficultyLayer, difficulties, 90, 3, 0.5, 2.0, baseSeed + 4000);
        }

        // Generate Hazard layer - Environmental hazards
        const hazardLayer = layers.find(l => l.layerType && l.layerType.toLowerCase() === 'hazard');
        if (hazardLayer && hazards.length > 0) {
            generatePerlinLayer(hazardLayer, hazards, 50, 4, 0.6, 2.5, baseSeed + 5000);
        }

        // Reset visibility to show first layer only
        editor.recentLayerSelections = [0];
        editor.layerManager.layers.forEach((layer, idx) => {
            layer.visible = (idx === 0);
        });

        // Re-render everything
        editor.render();
        editor.renderMinimap();
        updateLayersPanel();
        editor.isDirty = true;

        // Set zoom to fit view
        editor.setZoom(1.0);
        editor.offsetX = 0;
        editor.offsetY = 0;
        editor.render();
        editor.renderMinimap();

        document.getElementById('status-message').textContent = 'Test map generated with Perlin noise!';
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 2000);
    } catch (error) {
        console.error('Test map generation failed:', error);
        alert(`Failed to generate test map: ${error.message}`);
        document.getElementById('status-message').textContent = 'Generation failed';
    }
}

/**
 * Random Generation Settings Manager
 * Handles the UI for configuring per-layer, per-biome noise generation with multiple algorithm steps
 */
const randomGenSettings = {
    // Available algorithm types
    algorithmTypes: {
        perlin: {
            name: 'Perlin Noise',
            description: 'Smooth, natural-looking noise patterns',
            params: {
                scale: { type: 'number', default: 50, min: 5, max: 200, step: 5, label: 'Scale' },
                octaves: { type: 'number', default: 4, min: 1, max: 8, step: 1, label: 'Octaves' },
                persistence: { type: 'number', default: 0.5, min: 0.1, max: 1.0, step: 0.05, label: 'Persistence' },
                lacunarity: { type: 'number', default: 2.0, min: 1.0, max: 4.0, step: 0.1, label: 'Lacunarity' },
                threshold: { type: 'number', default: 0.5, min: 0, max: 1.0, step: 0.05, label: 'Threshold' }
            }
        },
        scatter: {
            name: 'Scatter',
            description: 'Random single pixels distributed across the map',
            params: {
                density: { type: 'number', default: 0.05, min: 0.001, max: 0.5, step: 0.005, label: 'Density' }
            }
        },
        cluster: {
            name: 'Clustered Scatter',
            description: 'Random clusters of pixels',
            params: {
                clusterCount: { type: 'number', default: 20, min: 1, max: 200, step: 1, label: 'Cluster Count' },
                clusterSize: { type: 'number', default: 10, min: 1, max: 50, step: 1, label: 'Cluster Size' },
                falloff: { type: 'number', default: 0.7, min: 0.1, max: 1.0, step: 0.1, label: 'Falloff' }
            }
        },
        voronoiPoints: {
            name: 'Voronoi Points',
            description: 'Evenly distributed points using Voronoi relaxation',
            params: {
                pointCount: { type: 'number', default: 20, min: 1, max: 200, step: 1, label: 'Point Count' },
                relaxation: { type: 'number', default: 3, min: 0, max: 10, step: 1, label: 'Relaxation' }
            }
        },
        gridPoints: {
            name: 'Grid Points',
            description: 'Points arranged in a grid pattern with optional randomness',
            params: {
                spacing: { type: 'number', default: 32, min: 4, max: 128, step: 4, label: 'Spacing' },
                jitter: { type: 'number', default: 0, min: 0, max: 1, step: 0.1, label: 'Jitter' }
            }
        },
        fill: {
            name: 'Fill All',
            description: 'Fill entire layer with this biome',
            params: {}
        },
        border: {
            name: 'Border',
            description: 'Create a border around the map edge',
            params: {
                thickness: { type: 'number', default: 5, min: 1, max: 50, step: 1, label: 'Thickness' }
            }
        }
    },

    // Layer settings with per-biome configurations
    layerSettings: {},

    /**
     * Get valid biomes/tilesets for a layer type
     */
    getValidTilesetsForLayer(layerType) {
        const tilesets = configManager.getTilesets();
        const validTilesets = [];

        const categoryMap = {
            'Floor': 'Biomes',
            'Underground': 'Biomes',
            'Sky': 'Biomes',
            'Height': 'Height',
            'Difficulty': 'Difficulty',
            'Hazard': 'Hazards'
        };

        const targetCategory = categoryMap[layerType] || 'Biomes';

        for (const [name, tileset] of Object.entries(tilesets)) {
            if (tileset.category === targetCategory) {
                if (targetCategory === 'Biomes' && name === 'Biome_None') continue;
                if (targetCategory === 'Hazards' && name === 'Hazard_None') continue;
                validTilesets.push({ name, ...tileset });
            }
        }

        return validTilesets;
    },

    /**
     * Create default algorithm step
     */
    createDefaultAlgorithm(type = 'perlin', seedOffset = null) {
        const algType = this.algorithmTypes[type];
        const params = {};
        for (const [key, config] of Object.entries(algType.params)) {
            params[key] = config.default;
        }
        return { type, params, enabled: true, seedOffset: seedOffset };
    },

    /**
     * Initialize settings for a layer
     */
    initLayerSettings(layerType) {
        const validTilesets = this.getValidTilesetsForLayer(layerType);

        this.layerSettings[layerType] = {
            enabled: true,
            baseBiome: '', // Empty string means no base fill
            biomes: {}
        };

        // Initialize each biome with a default perlin algorithm
        validTilesets.forEach((tileset, idx) => {
            this.layerSettings[layerType].biomes[tileset.name] = {
                enabled: idx < 3, // Enable first 3 by default
                color: tileset.color,
                order: idx, // Order for drag-drop reordering
                algorithms: [this.createDefaultAlgorithm('perlin')]
            };
        });
    },

    /**
     * Render algorithm params UI
     */
    renderAlgorithmParams(algorithm, layerType, biomeName, algIndex) {
        const algType = this.algorithmTypes[algorithm.type];
        if (!algType) return '';

        let paramsHtml = '';
        for (const [key, config] of Object.entries(algType.params)) {
            const value = algorithm.params[key] ?? config.default;
            paramsHtml += `
                <div class="alg-param">
                    <label>${config.label}</label>
                    <input type="number"
                           class="alg-param-input"
                           data-layer="${layerType}"
                           data-biome="${biomeName}"
                           data-alg="${algIndex}"
                           data-param="${key}"
                           value="${value}"
                           min="${config.min}"
                           max="${config.max}"
                           step="${config.step}">
                </div>
            `;
        }
        return paramsHtml;
    },

    /**
     * Render a single algorithm step
     */
    renderAlgorithmStep(algorithm, layerType, biomeName, algIndex, totalAlgorithms) {
        const algTypes = Object.entries(this.algorithmTypes).map(([key, val]) =>
            `<option value="${key}" ${algorithm.type === key ? 'selected' : ''}>${val.name}</option>`
        ).join('');

        // Default seed offset is index * 100 if not set
        const seedOffset = algorithm.seedOffset !== null && algorithm.seedOffset !== undefined
            ? algorithm.seedOffset
            : algIndex * 100;

        const hasParams = Object.keys(this.algorithmTypes[algorithm.type]?.params || {}).length > 0;

        const algName = this.algorithmTypes[algorithm.type]?.name || algorithm.type;

        return `
            <div class="algorithm-step" data-alg-index="${algIndex}" data-layer="${layerType}" data-biome="${biomeName}">
                <div class="alg-header">
                    <span class="alg-drag-handle" title="Drag to reorder">&#9776;</span>
                    <button type="button" class="alg-name-btn" title="Click to edit">${algName}</button>
                    <button type="button" class="btn-remove-alg" data-layer="${layerType}" data-biome="${biomeName}" data-alg="${algIndex}" title="Remove">×</button>
                </div>
                <div class="alg-options">
                    <select class="alg-type-select" data-layer="${layerType}" data-biome="${biomeName}" data-alg="${algIndex}">
                        ${algTypes}
                    </select>
                    <span class="alg-seed-offset">+<input type="number" class="alg-seed-input" data-layer="${layerType}" data-biome="${biomeName}" data-alg="${algIndex}" value="${seedOffset}" min="0" max="99999" step="1" title="Seed offset"></span>
                    ${hasParams ? this.renderAlgorithmParams(algorithm, layerType, biomeName, algIndex) : ''}
                </div>
            </div>
        `;
    },

    /**
     * Render biome settings box
     */
    renderBiomeSettings(biomeName, biomeConfig, layerType) {
        const totalAlgs = biomeConfig.algorithms.length;
        const algorithms = biomeConfig.algorithms.map((alg, idx) =>
            this.renderAlgorithmStep(alg, layerType, biomeName, idx, totalAlgs)
        ).join('');

        return `
            <div class="biome-settings" data-biome="${biomeName}" data-layer="${layerType}">
                <div class="biome-settings-header">
                    <span class="biome-drag-handle" title="Drag to reorder">&#9776;</span>
                    <span class="biome-color-swatch" style="background-color: ${biomeConfig.color}"></span>
                    <span class="biome-name">${biomeName.replace(/^(Biome_|Height_|Difficulty_|Hazard_)/, '')}</span>
                    <button type="button" class="btn-add-algorithm" data-layer="${layerType}" data-biome="${biomeName}" title="Add algorithm">+</button>
                </div>
                <div class="algorithm-list">
                    ${algorithms}
                </div>
            </div>
        `;
    },

    /**
     * Update biome settings display for a layer
     */
    updateBiomeSettingsDisplay(layerType) {
        const container = document.querySelector(`.biome-settings-container[data-layer="${layerType}"]`);
        if (!container) return;

        const layerConfig = this.layerSettings[layerType];

        // Get enabled biomes and sort by order
        const sortedBiomes = Object.entries(layerConfig.biomes)
            .filter(([_, config]) => config.enabled)
            .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));

        let html = '';
        for (const [biomeName, biomeConfig] of sortedBiomes) {
            html += this.renderBiomeSettings(biomeName, biomeConfig, layerType);
        }

        container.innerHTML = html || '<div class="no-biomes-selected">No biomes selected. Check biomes above to configure them.</div>';

        // Attach event listeners
        this.attachBiomeSettingsListeners(layerType);
    },

    /**
     * Attach event listeners to biome settings
     */
    attachBiomeSettingsListeners(layerType) {
        const container = document.querySelector(`.biome-settings-container[data-layer="${layerType}"]`);
        if (!container) return;

        // Algorithm type change
        container.querySelectorAll('.alg-type-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const { layer, biome, alg } = e.target.dataset;
                const newType = e.target.value;
                this.layerSettings[layer].biomes[biome].algorithms[alg] = this.createDefaultAlgorithm(newType);
                this.updateBiomeSettingsDisplay(layer);
            });
        });

        // Parameter inputs
        container.querySelectorAll('.alg-param-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const { layer, biome, alg, param } = e.target.dataset;
                const value = parseFloat(e.target.value);
                this.layerSettings[layer].biomes[biome].algorithms[alg].params[param] = value;
            });
        });

        // Remove algorithm
        container.querySelectorAll('.btn-remove-alg').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const { layer, biome, alg } = e.target.dataset;
                this.layerSettings[layer].biomes[biome].algorithms.splice(parseInt(alg), 1);
                if (this.layerSettings[layer].biomes[biome].algorithms.length === 0) {
                    this.layerSettings[layer].biomes[biome].algorithms.push(this.createDefaultAlgorithm('perlin', 0));
                }
                this.updateBiomeSettingsDisplay(layer);
            });
        });

        // Add algorithm
        container.querySelectorAll('.btn-add-algorithm').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const { layer, biome } = e.target.dataset;
                const algs = this.layerSettings[layer].biomes[biome].algorithms;
                // Default seed offset is next in sequence
                const nextOffset = algs.length * 100;
                algs.push(this.createDefaultAlgorithm('scatter', nextOffset));
                this.updateBiomeSettingsDisplay(layer);
            });
        });

        // Seed offset input
        container.querySelectorAll('.alg-seed-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const { layer, biome, alg } = e.target.dataset;
                const value = parseInt(e.target.value) || 0;
                this.layerSettings[layer].biomes[biome].algorithms[alg].seedOffset = value;
            });
        });

        // Toggle options visibility on name button click
        container.querySelectorAll('.alg-name-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const step = btn.closest('.algorithm-step');
                const options = step.querySelector('.alg-options');
                options.classList.toggle('show');
            });
        });

        // Algorithm drag - enable only via handle
        container.querySelectorAll('.algorithm-step').forEach(step => {
            // Disable dragging by default
            step.draggable = false;

            // Enable drag only when mousedown on handle
            const handle = step.querySelector('.alg-drag-handle');
            if (handle) {
                handle.addEventListener('mousedown', () => {
                    step.draggable = true;
                });
            }

            step.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    type: 'algorithm',
                    layer: step.dataset.layer,
                    biome: step.dataset.biome,
                    index: parseInt(step.dataset.algIndex)
                }));
                step.classList.add('dragging');
            });

            step.addEventListener('dragend', () => {
                step.draggable = false;
                step.classList.remove('dragging');
                container.querySelectorAll('.algorithm-step').forEach(s => s.classList.remove('drag-over'));
            });

            step.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                step.classList.add('drag-over');
            });

            step.addEventListener('dragleave', () => {
                step.classList.remove('drag-over');
            });

            step.addEventListener('drop', (e) => {
                e.preventDefault();
                step.classList.remove('drag-over');

                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                // Only handle algorithm drags
                if (data.type !== 'algorithm') return;

                const targetLayer = step.dataset.layer;
                const targetBiome = step.dataset.biome;
                const targetIndex = parseInt(step.dataset.algIndex);

                // Only allow reorder within same biome
                if (data.layer !== targetLayer || data.biome !== targetBiome) return;
                if (data.index === targetIndex) return;

                const algs = this.layerSettings[targetLayer].biomes[targetBiome].algorithms;
                const [moved] = algs.splice(data.index, 1);
                algs.splice(targetIndex, 0, moved);

                this.updateBiomeSettingsDisplay(targetLayer);
            });
        });

        // Biome drag - enable only via handle
        container.querySelectorAll('.biome-settings').forEach(biomeEl => {
            // Disable dragging by default
            biomeEl.draggable = false;

            // Enable drag only when mousedown on handle
            const handle = biomeEl.querySelector('.biome-drag-handle');
            if (handle) {
                handle.addEventListener('mousedown', () => {
                    biomeEl.draggable = true;
                });
            }

            biomeEl.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    type: 'biome',
                    layer: biomeEl.dataset.layer,
                    biome: biomeEl.dataset.biome
                }));
                biomeEl.classList.add('dragging');
            });

            biomeEl.addEventListener('dragend', () => {
                biomeEl.draggable = false;
                biomeEl.classList.remove('dragging');
                container.querySelectorAll('.biome-settings').forEach(b => b.classList.remove('drag-over'));
            });

            biomeEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                // Don't show drag-over for algorithm drags
                try {
                    const checkData = e.dataTransfer.types.includes('text/plain');
                    if (checkData) biomeEl.classList.add('drag-over');
                } catch(err) {
                    biomeEl.classList.add('drag-over');
                }
            });

            biomeEl.addEventListener('dragleave', (e) => {
                if (!biomeEl.contains(e.relatedTarget)) {
                    biomeEl.classList.remove('drag-over');
                }
            });

            biomeEl.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                biomeEl.classList.remove('drag-over');

                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                if (data.type !== 'biome') return;

                const targetLayer = biomeEl.dataset.layer;
                const targetBiome = biomeEl.dataset.biome;

                if (data.layer !== targetLayer) return;
                if (data.biome === targetBiome) return;

                // Swap orders
                const biomes = this.layerSettings[targetLayer].biomes;
                const draggedOrder = biomes[data.biome].order ?? 0;
                const targetOrder = biomes[targetBiome].order ?? 0;
                biomes[data.biome].order = targetOrder;
                biomes[targetBiome].order = draggedOrder;

                this.updateBiomeSettingsDisplay(targetLayer);
            });
        });
    },

    /**
     * Initialize settings panel UI
     */
    initPanel() {
        const container = document.getElementById('random-gen-layers');
        if (!container) return;

        container.innerHTML = '';

        const layers = configManager.getLayers();

        for (const layerConfig of layers) {
            const layerType = layerConfig.layerType;

            // Initialize layer settings if not exists
            if (!this.layerSettings[layerType]) {
                this.initLayerSettings(layerType);
            }

            const validTilesets = this.getValidTilesetsForLayer(layerType);
            const settings = this.layerSettings[layerType];

            const layerDiv = document.createElement('div');
            layerDiv.className = 'random-gen-layer';
            layerDiv.dataset.layerType = layerType;

            layerDiv.innerHTML = `
                <div class="random-gen-layer-header">
                    <label>
                        <input type="checkbox" class="layer-enabled" ${settings.enabled ? 'checked' : ''}>
                        ${layerConfig.name}
                    </label>
                    <span class="layer-type-badge">${layerType}</span>
                </div>
                <div class="random-gen-layer-settings">
                    <div class="setting-group full-width base-biome-group">
                        <label>Base Fill (applied first)</label>
                        <select class="base-biome-select">
                            <option value="">None - Leave Empty</option>
                            ${validTilesets.map(t => `
                                <option value="${t.name}" ${settings.baseBiome === t.name ? 'selected' : ''}>
                                    ${t.name.replace(/^(Biome_|Height_|Difficulty_|Hazard_)/, '')}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="setting-group full-width">
                        <label>Select Biomes to Add (${validTilesets.length} available)</label>
                        <div class="biome-selection-controls">
                            <button type="button" class="btn-select-all">All</button>
                            <button type="button" class="btn-deselect-all">None</button>
                        </div>
                        <div class="biome-checkboxes">
                            ${validTilesets.map(t => `
                                <label class="biome-checkbox">
                                    <input type="checkbox" value="${t.name}" ${settings.biomes[t.name]?.enabled ? 'checked' : ''}>
                                    <span class="biome-color-swatch" style="background-color: ${t.color}"></span>
                                    ${t.name.replace(/^(Biome_|Height_|Difficulty_|Hazard_)/, '')}
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    <div class="setting-group full-width">
                        <label>Biome Algorithm Settings</label>
                        <div class="biome-settings-container" data-layer="${layerType}">
                            <!-- Populated dynamically -->
                        </div>
                    </div>
                </div>
            `;

            container.appendChild(layerDiv);

            // Event listeners
            const enabledCheckbox = layerDiv.querySelector('.layer-enabled');
            enabledCheckbox.addEventListener('change', (e) => {
                this.layerSettings[layerType].enabled = e.target.checked;
                layerDiv.classList.toggle('disabled', !e.target.checked);
            });

            // Base biome selector
            const baseBiomeSelect = layerDiv.querySelector('.base-biome-select');
            baseBiomeSelect.addEventListener('change', (e) => {
                this.layerSettings[layerType].baseBiome = e.target.value;
            });

            // Biome checkboxes
            const biomeCheckboxes = layerDiv.querySelectorAll('.biome-checkboxes input');

            const updateBiomeSelection = () => {
                biomeCheckboxes.forEach(cb => {
                    if (this.layerSettings[layerType].biomes[cb.value]) {
                        this.layerSettings[layerType].biomes[cb.value].enabled = cb.checked;
                    }
                });
                this.updateBiomeSettingsDisplay(layerType);
            };

            biomeCheckboxes.forEach(cb => {
                cb.addEventListener('change', updateBiomeSelection);
            });

            layerDiv.querySelector('.btn-select-all').addEventListener('click', () => {
                biomeCheckboxes.forEach(cb => cb.checked = true);
                updateBiomeSelection();
            });

            layerDiv.querySelector('.btn-deselect-all').addEventListener('click', () => {
                biomeCheckboxes.forEach(cb => cb.checked = false);
                updateBiomeSelection();
            });

            // Initial render of biome settings
            this.updateBiomeSettingsDisplay(layerType);
        }
    },

    /**
     * Get current settings
     */
    getSettings() {
        return {
            layers: this.layerSettings,
            seed: parseInt(document.getElementById('random-gen-seed').value) || 0
        };
    },

    /**
     * Show the panel
     */
    showPanel() {
        const panel = document.getElementById('random-gen-panel');
        if (panel) {
            panel.style.display = 'block';
        }
    },

    /**
     * Hide the panel
     */
    hidePanel() {
        const panel = document.getElementById('random-gen-panel');
        if (panel) {
            panel.style.display = 'none';
        }
    },

    /**
     * Get all saved presets from localStorage
     */
    getPresets() {
        try {
            const presetsJson = localStorage.getItem('tsic_generation_presets');
            return presetsJson ? JSON.parse(presetsJson) : {};
        } catch (e) {
            console.error('Failed to load generation presets:', e);
            return {};
        }
    },

    /**
     * Save current settings as a preset
     */
    savePreset(name) {
        if (!name || !name.trim()) {
            console.warn('Preset name is required');
            return false;
        }

        const presets = this.getPresets();
        presets[name.trim()] = {
            layers: JSON.parse(JSON.stringify(this.layerSettings)),
            seed: parseInt(document.getElementById('random-gen-seed').value) || 0,
            savedAt: new Date().toISOString()
        };

        try {
            localStorage.setItem('tsic_generation_presets', JSON.stringify(presets));
            console.log(`Saved generation preset: ${name}`);
            this.updatePresetUI();
            return true;
        } catch (e) {
            console.error('Failed to save generation preset:', e);
            return false;
        }
    },

    /**
     * Load a preset by name
     */
    loadPreset(name) {
        const presets = this.getPresets();
        const preset = presets[name];

        if (!preset) {
            console.warn(`Preset not found: ${name}`);
            return false;
        }

        // Deep copy the layer settings
        this.layerSettings = JSON.parse(JSON.stringify(preset.layers));

        // Update seed if saved
        if (preset.seed !== undefined) {
            const seedInput = document.getElementById('random-gen-seed');
            if (seedInput) {
                seedInput.value = preset.seed;
            }
        }

        // Re-render the UI to reflect loaded settings
        this.initPanel();
        console.log(`Loaded generation preset: ${name}`);
        return true;
    },

    /**
     * Delete a preset by name
     */
    deletePreset(name) {
        const presets = this.getPresets();
        if (presets[name]) {
            delete presets[name];
            try {
                localStorage.setItem('tsic_generation_presets', JSON.stringify(presets));
                console.log(`Deleted generation preset: ${name}`);
                this.updatePresetUI();
                return true;
            } catch (e) {
                console.error('Failed to delete preset:', e);
                return false;
            }
        }
        return false;
    },

    /**
     * Update the preset dropdown UI
     */
    updatePresetUI() {
        const dropdown = document.getElementById('generation-preset-select');
        if (!dropdown) return;

        const presets = this.getPresets();
        const presetNames = Object.keys(presets).sort();

        // Preserve current selection if still valid
        const currentValue = dropdown.value;

        dropdown.innerHTML = '<option value="">-- Select Preset --</option>';
        presetNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            dropdown.appendChild(option);
        });

        // Restore selection if still valid
        if (currentValue && presets[currentValue]) {
            dropdown.value = currentValue;
        }
    }
};

/**
 * Algorithm implementations for map generation
 */
const generationAlgorithms = {
    /**
     * Seeded random number generator
     */
    seededRandom: function(seed) {
        let s = seed;
        return function() {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    },

    /**
     * Perlin noise algorithm
     */
    perlin: function(layer, tileset, params, seed, width, height) {
        const noise = new PerlinNoise(seed);
        const { scale, octaves, persistence, lacunarity, threshold } = params;
        let count = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const noiseValue = (noise.octaveNoise(x / scale, y / scale, octaves, persistence, lacunarity) + 1) / 2;
                if (noiseValue >= threshold) {
                    layer.setTile(x, y, tileset.value || 0, tileset);
                    count++;
                }
            }
        }
        return count;
    },

    /**
     * Scatter algorithm - random single pixels
     */
    scatter: function(layer, tileset, params, seed, width, height) {
        const random = this.seededRandom(seed);
        const { density } = params;
        let count = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (random() < density) {
                    layer.setTile(x, y, tileset.value || 0, tileset);
                    count++;
                }
            }
        }
        return count;
    },

    /**
     * Clustered scatter algorithm
     */
    cluster: function(layer, tileset, params, seed, width, height) {
        const random = this.seededRandom(seed);
        const { clusterCount, clusterSize, falloff } = params;
        let count = 0;

        for (let i = 0; i < clusterCount; i++) {
            const cx = Math.floor(random() * width);
            const cy = Math.floor(random() * height);

            for (let dy = -clusterSize; dy <= clusterSize; dy++) {
                for (let dx = -clusterSize; dx <= clusterSize; dx++) {
                    const x = cx + dx;
                    const y = cy + dy;

                    if (x < 0 || x >= width || y < 0 || y >= height) continue;

                    const dist = Math.sqrt(dx * dx + dy * dy) / clusterSize;
                    const prob = Math.pow(1 - dist, falloff);

                    if (dist <= 1 && random() < prob) {
                        layer.setTile(x, y, tileset.value || 0, tileset);
                        count++;
                    }
                }
            }
        }
        return count;
    },

    /**
     * Voronoi points algorithm - places evenly distributed single points
     */
    voronoiPoints: function(layer, tileset, params, seed, width, height) {
        const random = this.seededRandom(seed);
        const { pointCount, relaxation } = params;
        let count = 0;

        // Generate initial random points
        let points = [];
        for (let i = 0; i < pointCount; i++) {
            points.push({
                x: random() * width,
                y: random() * height
            });
        }

        // Lloyd relaxation - moves points to centroids of their Voronoi cells
        // This creates more even distribution
        for (let r = 0; r < relaxation; r++) {
            const sums = points.map(() => ({ x: 0, y: 0, count: 0 }));

            // Sample grid to find which point each tile is closest to
            const step = Math.max(1, Math.floor(Math.min(width, height) / 64));
            for (let y = 0; y < height; y += step) {
                for (let x = 0; x < width; x += step) {
                    let minDist = Infinity;
                    let minIdx = 0;
                    for (let i = 0; i < points.length; i++) {
                        const dx = x - points[i].x;
                        const dy = y - points[i].y;
                        const dist = dx * dx + dy * dy;
                        if (dist < minDist) {
                            minDist = dist;
                            minIdx = i;
                        }
                    }
                    sums[minIdx].x += x;
                    sums[minIdx].y += y;
                    sums[minIdx].count++;
                }
            }

            // Move each point to the centroid of its cell
            for (let i = 0; i < points.length; i++) {
                if (sums[i].count > 0) {
                    points[i].x = sums[i].x / sums[i].count;
                    points[i].y = sums[i].y / sums[i].count;
                }
            }
        }

        // Place single tile at each point location
        for (const point of points) {
            const x = Math.floor(point.x);
            const y = Math.floor(point.y);
            if (x >= 0 && x < width && y >= 0 && y < height) {
                layer.setTile(x, y, tileset.value || 0, tileset);
                count++;
            }
        }
        return count;
    },

    /**
     * Grid points algorithm - places points in a grid pattern
     */
    gridPoints: function(layer, tileset, params, seed, width, height) {
        const random = this.seededRandom(seed);
        const { spacing, jitter } = params;
        let count = 0;

        const maxJitter = spacing * jitter * 0.5;

        for (let gy = spacing / 2; gy < height; gy += spacing) {
            for (let gx = spacing / 2; gx < width; gx += spacing) {
                // Apply jitter (random offset)
                const jitterX = jitter > 0 ? (random() - 0.5) * 2 * maxJitter : 0;
                const jitterY = jitter > 0 ? (random() - 0.5) * 2 * maxJitter : 0;

                const x = Math.floor(gx + jitterX);
                const y = Math.floor(gy + jitterY);

                if (x >= 0 && x < width && y >= 0 && y < height) {
                    layer.setTile(x, y, tileset.value || 0, tileset);
                    count++;
                }
            }
        }
        return count;
    },

    /**
     * Fill entire layer
     */
    fill: function(layer, tileset, params, seed, width, height) {
        let count = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                layer.setTile(x, y, tileset.value || 0, tileset);
                count++;
            }
        }
        return count;
    },

    /**
     * Border algorithm
     */
    border: function(layer, tileset, params, seed, width, height) {
        const { thickness } = params;
        let count = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (x < thickness || x >= width - thickness ||
                    y < thickness || y >= height - thickness) {
                    layer.setTile(x, y, tileset.value || 0, tileset);
                    count++;
                }
            }
        }
        return count;
    }
};

/**
 * Generate map using configured random settings with multiple algorithms per biome
 */
function generateMapWithSettings() {
    try {
        if (!editor) {
            console.error('Editor not initialized');
            alert('Editor not initialized. Please reload the page.');
            return;
        }

        if (typeof PerlinNoise === 'undefined') {
            console.error('PerlinNoise not loaded');
            alert('Perlin noise generator not available. Please reload the page.');
            return;
        }

        const settings = randomGenSettings.getSettings();
        console.log('[RandomGen] Generating with settings:', settings);

        editor.saveState();

        // Clear all existing data first
        editor.layerManager.layers.forEach(layer => {
            layer.tileData = new Map();
            layer.cacheDirty = true;
        });

        const layers = editor.layerManager.layers;
        const gridWidth = editor.layerManager.width;
        const gridHeight = editor.layerManager.height;

        // Use provided seed or generate random one
        const baseSeed = settings.seed || Date.now();
        console.log(`[RandomGen] Using seed: ${baseSeed}`);

        // Process each layer
        for (const layer of layers) {
            const layerType = layer.layerType;
            const layerConfig = settings.layers[layerType];

            if (!layerConfig || !layerConfig.enabled) {
                console.log(`[RandomGen] Skipping disabled layer: ${layer.name}`);
                continue;
            }

            console.log(`[RandomGen] Processing layer: ${layer.name}`);

            // Apply base fill first if specified
            if (layerConfig.baseBiome) {
                const baseTileset = configManager.getTileset(layerConfig.baseBiome);
                if (baseTileset) {
                    console.log(`[RandomGen] Filling ${layer.name} with base: ${layerConfig.baseBiome}`);
                    const fullBaseTileset = { name: layerConfig.baseBiome, ...baseTileset };
                    for (let y = 0; y < gridHeight; y++) {
                        for (let x = 0; x < gridWidth; x++) {
                            layer.setTile(x, y, fullBaseTileset.value || 0, fullBaseTileset);
                        }
                    }
                    console.log(`[RandomGen] Base fill complete: ${gridWidth * gridHeight} tiles`);
                }
            }

            // Process each enabled biome (sorted by order)
            const sortedBiomes = Object.entries(layerConfig.biomes)
                .filter(([_, config]) => config.enabled)
                .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));

            for (const [biomeName, biomeConfig] of sortedBiomes) {

                const tileset = configManager.getTileset(biomeName);
                if (!tileset) {
                    console.warn(`[RandomGen] Tileset not found: ${biomeName}`);
                    continue;
                }

                const fullTileset = { name: biomeName, ...tileset };

                // Apply each algorithm step for this biome (in order)
                for (let algIdx = 0; algIdx < biomeConfig.algorithms.length; algIdx++) {
                    const algorithm = biomeConfig.algorithms[algIdx];
                    const algFunc = generationAlgorithms[algorithm.type];

                    if (!algFunc) {
                        console.warn(`[RandomGen] Unknown algorithm: ${algorithm.type}`);
                        continue;
                    }

                    // Use algorithm's seedOffset, or default to index * 100
                    const algSeedOffset = algorithm.seedOffset !== null && algorithm.seedOffset !== undefined
                        ? algorithm.seedOffset
                        : algIdx * 100;
                    const algSeed = baseSeed + algSeedOffset;

                    console.log(`[RandomGen] Applying ${algorithm.type} to ${biomeName} (seed: ${algSeed}, offset: ${algSeedOffset})`);
                    const count = algFunc.call(generationAlgorithms, layer, fullTileset, algorithm.params, algSeed, gridWidth, gridHeight);
                    console.log(`[RandomGen] ${algorithm.type} placed ${count} tiles`);
                }
            }
        }

        // Reset visibility to show first layer only
        editor.recentLayerSelections = [0];
        editor.layerManager.layers.forEach((layer, idx) => {
            layer.visible = (idx === 0);
        });

        // Re-render everything
        editor.render();
        editor.renderMinimap();
        updateLayersPanel();
        editor.isDirty = true;

        // Set zoom to fit view
        editor.setZoom(1.0);
        editor.offsetX = 0;
        editor.offsetY = 0;
        editor.render();
        editor.renderMinimap();

        // Hide the panel
        randomGenSettings.hidePanel();

        document.getElementById('status-message').textContent = 'Map generated with custom settings!';
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 2000);
    } catch (error) {
        console.error('Map generation failed:', error);
        alert(`Failed to generate map: ${error.message}`);
        document.getElementById('status-message').textContent = 'Generation failed';
    }
}

/**
 * Initialize random generation panel event listeners
 */
function initializeRandomGenPanel() {
    // Open button in toolbar
    document.getElementById('btn-generate-random-open').addEventListener('click', () => {
        randomGenSettings.initPanel();
        randomGenSettings.showPanel();
    });

    // Close button
    document.getElementById('random-gen-close').addEventListener('click', () => {
        randomGenSettings.hidePanel();
    });

    // Randomize seed button
    document.getElementById('btn-randomize-seed').addEventListener('click', () => {
        document.getElementById('random-gen-seed').value = Math.floor(Math.random() * 1000000);
    });

    // Generate button
    document.getElementById('btn-generate-random').addEventListener('click', () => {
        if (editor.isDirty && !confirm('Discard unsaved changes and generate world?')) {
            return;
        }
        generateMapWithSettings();
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            randomGenSettings.hidePanel();
        }
    });

    // Close when clicking outside panel
    document.getElementById('random-gen-panel').addEventListener('click', (e) => {
        if (e.target.id === 'random-gen-panel') {
            randomGenSettings.hidePanel();
        }
    });

    // Preset: Auto-load on dropdown selection
    document.getElementById('generation-preset-select').addEventListener('change', (e) => {
        if (e.target.value) {
            randomGenSettings.loadPreset(e.target.value);
        }
    });

    // Preset: Save button
    document.getElementById('btn-save-preset').addEventListener('click', () => {
        const name = prompt('Enter a name for this preset:');
        if (name && name.trim()) {
            const presets = randomGenSettings.getPresets();
            if (presets[name.trim()] && !confirm(`Preset "${name.trim()}" already exists. Overwrite?`)) {
                return;
            }
            if (randomGenSettings.savePreset(name.trim())) {
                document.getElementById('generation-preset-select').value = name.trim();
            }
        }
    });

    // Preset: Delete button
    document.getElementById('btn-delete-preset').addEventListener('click', () => {
        const select = document.getElementById('generation-preset-select');
        const presetName = select.value;
        if (presetName) {
            if (confirm(`Delete preset "${presetName}"?`)) {
                randomGenSettings.deletePreset(presetName);
            }
        } else {
            alert('Please select a preset to delete.');
        }
    });

    // Initialize preset dropdown
    randomGenSettings.updatePresetUI();
}

/**
 * Initialize application
 */
async function init() {
    const initStart = performance.now();
    console.log('[INIT] ========== STARTING INITIALIZATION ==========');

    // IMPORTANT: Clear old config data when version changes, but PRESERVE projects
    const currentVersion = '3.0-six-layers-v2';
    const storedVersion = localStorage.getItem('levelEditor_configVersion');
    if (storedVersion !== currentVersion) {
        console.log(`[INIT] Config version changed from ${storedVersion} to ${currentVersion}, clearing old config (preserving projects)`);
        // Only clear non-project keys - preserve tsic_ prefixed keys
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && !key.startsWith('tsic_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        localStorage.setItem('levelEditor_configVersion', currentVersion);
    }


    // Load configuration
    console.log('[INIT] Loading config...');
    let t0 = performance.now();
    const loaded = await configManager.loadConfig();
    console.log(`[INIT] Config loaded in ${(performance.now() - t0).toFixed(1)}ms, success: ${loaded}`);
    if (!loaded) {
        console.warn('Using default configuration');
    }

    // Initialize color mapper
    console.log('[INIT] Loading color mapper...');
    t0 = performance.now();
    const config = await fetch('config/biomes.json').then(r => r.json());
    colorMapper.loadFromConfig(config);
    console.log(`[INIT] Color mapper loaded in ${(performance.now() - t0).toFixed(1)}ms`);
    console.log('[ColorMapper] Initialized:', colorMapper.getSummary());

    // Initialize dynamic validator
    console.log('[INIT] Loading dynamic validator...');
    t0 = performance.now();
    dynamicValidator = new DynamicRLEValidator();
    const validatorLoaded = await dynamicValidator.loadConfig('config/biomes.json');
    console.log(`[INIT] Dynamic validator loaded in ${(performance.now() - t0).toFixed(1)}ms`);
    if (!validatorLoaded.success) {
        console.error('Failed to load dynamic validator config:', validatorLoaded.error);
        console.warn('Falling back to hardcoded validator');
        dynamicValidator = null;
    } else {
        console.log('Dynamic validator loaded successfully');
        console.log(dynamicValidator.getConfigSummary());
    }

    // Create editor
    console.log('[INIT] Creating editor...');
    t0 = performance.now();
    editor = new LevelEditor();
    window.editor = editor; // Expose for testing
    console.log(`[INIT] Editor created in ${(performance.now() - t0).toFixed(1)}ms`);

    console.log('[INIT] Initializing layers...');
    t0 = performance.now();
    editor.initializeLayers(configManager);
    console.log(`[INIT] Layers initialized in ${(performance.now() - t0).toFixed(1)}ms`);

    // Initialize UI
    console.log('[INIT] Initializing UI components...');
    t0 = performance.now();
    initializeColorPalette();
    console.log(`[INIT] Color palette initialized in ${(performance.now() - t0).toFixed(1)}ms`);

    // Set initial palette state based on active layer
    const activeLayer = editor.layerManager.getActiveLayer();
    if (activeLayer && typeof window.updatePaletteForLayer === 'function') {
        window.updatePaletteForLayer(activeLayer.layerType || activeLayer.name);
    }

    t0 = performance.now();
    initializeLayersPanel();
    console.log(`[INIT] Layers panel initialized in ${(performance.now() - t0).toFixed(1)}ms`);

    t0 = performance.now();
    initializeToolButtons();
    console.log(`[INIT] Tool buttons initialized in ${(performance.now() - t0).toFixed(1)}ms`);

    t0 = performance.now();
    initializeToolbar();
    console.log(`[INIT] Toolbar initialized in ${(performance.now() - t0).toFixed(1)}ms`);

    t0 = performance.now();
    initializeKeyboardShortcuts();
    console.log(`[INIT] Keyboard shortcuts initialized in ${(performance.now() - t0).toFixed(1)}ms`);

    t0 = performance.now();
    initializeAutoSaveCheckbox();
    console.log(`[INIT] Auto-save checkbox initialized in ${(performance.now() - t0).toFixed(1)}ms`);

    t0 = performance.now();
    initializeRandomGenPanel();
    console.log(`[INIT] Random generation panel initialized in ${(performance.now() - t0).toFixed(1)}ms`);

    // Initialize layer visibility (show only first layer)
    if (editor.layerManager.layers.length > 0) {
        editor.recentLayerSelections = [0];
        editor.layerManager.layers.forEach((layer, idx) => {
            layer.visible = (idx === 0);
        });
    }

    // Select first color by default
    const tilesets = configManager.getTilesets();
    const firstTileset = Object.keys(tilesets)[0];
    if (firstTileset) {
        editor.selectTileset(firstTileset);
    }

    // Start auto-save
    startAutoSave();

    // Initialize maze visualizer
    console.log('[INIT] Initializing maze visualizer...');
    t0 = performance.now();
    editor.mazeVisualizer = new MazeVisualizerManager(editor);
    window.mazeVisualizer = editor.mazeVisualizer; // For debugging/console access
    initializeMazeVisualizer();
    console.log(`[INIT] Maze visualizer initialized in ${(performance.now() - t0).toFixed(1)}ms`);

    // Initialize stamps system
    console.log('[INIT] Initializing stamps...');
    t0 = performance.now();
    initializeStamps();
    console.log(`[INIT] Stamps initialized in ${(performance.now() - t0).toFixed(1)}ms`);

    // Auto-load test JSON if it exists (for e2e testing) - do this before loading projects
    console.log('[INIT] Checking for test JSON...');
    t0 = performance.now();
    await loadTestJSON();
    console.log(`[INIT] Test JSON check complete in ${(performance.now() - t0).toFixed(1)}ms, currentFileName: ${editor.currentFileName}`);

    // Initialize project system (only if no test JSON was loaded)
    if (!editor.currentFileName) {
        console.log('[INIT] No current file, initializing project system...');
        // Populate project dropdown
        t0 = performance.now();
        updateProjectDropdown();
        console.log(`[INIT] Project dropdown updated in ${(performance.now() - t0).toFixed(1)}ms`);

        // Auto-load last active project if one exists
        const activeProject = getActiveProject();
        if (activeProject) {
            console.log(`[INIT] Auto-loading last active project: "${activeProject}"`);
            await loadProjectByName(activeProject);
        } else {
            updateProjectUI();
            console.log('[INIT] No previous project - select from dropdown');
        }
    }

    // Update status
    if (!editor.currentFileName) {
        document.getElementById('status-message').textContent = 'Ready - No project loaded';

        // Fill layers with valid defaults when no project is loaded
        // This ensures no invalid/empty tiles exist
        console.log('[INIT] No project loaded - filling layers with valid defaults...');
        t0 = performance.now();
        for (const layer of editor.layerManager.layers) {
            const defaultColor = editor.getDefaultColorForLayer(layer.layerType);
            if (defaultColor) {
                editor.layerManager.fillLayerWithDefault(layer, defaultColor);
            }
        }
        console.log(`[INIT] Layers filled with defaults in ${(performance.now() - t0).toFixed(1)}ms`);

        // Render after filling
        editor.render();
        editor.renderMinimap();
    }
    console.log(`[INIT] ========== INITIALIZATION COMPLETE in ${(performance.now() - initStart).toFixed(1)}ms ==========`);
}

/**
 * Initialize color palette with tabs and subcategories
 */
function initializeColorPalette() {
    const paletteContainer = document.getElementById('color-palette');
    const tilesets = configManager.getTilesets();

    paletteContainer.innerHTML = '';

    // Define biome subcategories
    const biomeSubcategories = {
        'Shared': ['Biome_None', 'Biome_Blocked', 'Biome_Pit'],
        'Sky': ['Biome_SkyEmpty', 'Biome_SkyCeiling', 'Biome_Bathroom'],
        'Ground': ['Biome_ShowFloor', 'Biome_Restaurant', 'Biome_Warehouse', 'Biome_Kids', 'Biome_Gardening', 'Biome_StaffRoom'],
        'Underground': ['Biome_CarPark', 'Biome_SCPBase']
    };

    // Define POI biomes
    const poiBiomes = [
        'Biome_Spawn', 'Biome_Map', 'Biome_HelpPoint', 'Biome_LostAndFound', 'Biome_AbandonedCamp',
        'Biome_SCPBaseEntrance', 'Biome_SCPBaseExit', 'Biome_SCPBasePower',
        'Biome_CarParkEntrance', 'Biome_CarParkExit'
    ];

    // Helper function to create a color item
    function createColorItem(name, tileset) {
        const colorItem = document.createElement('div');
        colorItem.className = 'color-item';
        colorItem.dataset.name = name;
        colorItem.dataset.color = tileset.color.toLowerCase();
        colorItem.title = `${tileset.displayName || name}\nRight-click to lock/unlock`;

        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = tileset.color;

        if (tileset.icon) {
            const icon = document.createElement('span');
            icon.className = 'color-icon';
            icon.textContent = tileset.icon;
            swatch.appendChild(icon);
        }

        const label = document.createElement('div');
        label.className = 'color-name';
        label.textContent = tileset.displayName || name;

        colorItem.appendChild(swatch);
        colorItem.appendChild(label);

        colorItem.addEventListener('click', () => {
            editor.selectTileset(name);
            document.querySelectorAll('.color-item').forEach(item => item.classList.remove('selected'));
            colorItem.classList.add('selected');
        });

        colorItem.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const color = tileset.color;
            const isLocked = editor.toggleColorLock(color);
            colorItem.classList.toggle('locked', isLocked);

            const statusMsg = isLocked
                ? `Locked: ${tileset.displayName || name} (cannot be painted over)`
                : `Unlocked: ${tileset.displayName || name}`;
            document.getElementById('status-message').textContent = statusMsg;
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 2000);

            if (typeof window.updatePOIButton === 'function') {
                window.updatePOIButton();
            }
        });

        return colorItem;
    }

    // Helper function to create a subcategory section
    function createSubcategory(title, items) {
        const section = document.createElement('div');
        section.className = 'color-subcategory';

        const header = document.createElement('div');
        header.className = 'color-subcategory-header';
        header.textContent = title;

        const content = document.createElement('div');
        content.className = 'color-category-content';

        for (const item of items) {
            content.appendChild(item);
        }

        section.appendChild(header);
        section.appendChild(content);
        return section;
    }

    // Create tab content containers
    const biomesTab = document.createElement('div');
    biomesTab.className = 'palette-tab-content active';
    biomesTab.dataset.tab = 'biomes';

    const poiTab = document.createElement('div');
    poiTab.className = 'palette-tab-content';
    poiTab.dataset.tab = 'poi';

    const otherTab = document.createElement('div');
    otherTab.className = 'palette-tab-content';
    otherTab.dataset.tab = 'other';

    // Populate Biomes tab with subcategories
    for (const [subcat, biomeNames] of Object.entries(biomeSubcategories)) {
        const items = [];
        for (const biomeName of biomeNames) {
            const tileset = tilesets[biomeName];
            if (tileset) {
                items.push(createColorItem(biomeName, tileset));
            }
        }
        if (items.length > 0) {
            biomesTab.appendChild(createSubcategory(subcat, items));
        }
    }

    // Populate POI tab
    const poiItems = [];
    for (const biomeName of poiBiomes) {
        const tileset = tilesets[biomeName];
        if (tileset) {
            poiItems.push(createColorItem(biomeName, tileset));
        }
    }
    if (poiItems.length > 0) {
        const poiContent = document.createElement('div');
        poiContent.className = 'color-category-content';
        for (const item of poiItems) {
            poiContent.appendChild(item);
        }
        poiTab.appendChild(poiContent);
    }

    // Populate Other tab (Height, Difficulty, Hazards)
    const otherCategories = ['Height', 'Difficulty', 'Hazards'];
    for (const category of otherCategories) {
        const items = [];
        for (const [name, tileset] of Object.entries(tilesets)) {
            if (tileset.category === category) {
                items.push(createColorItem(name, tileset));
            }
        }
        if (items.length > 0) {
            otherTab.appendChild(createSubcategory(category, items));
        }
    }

    // Add tabs to container
    paletteContainer.appendChild(biomesTab);
    paletteContainer.appendChild(poiTab);
    paletteContainer.appendChild(otherTab);

    // Initialize tab switching
    document.querySelectorAll('.palette-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            // Update tab buttons
            document.querySelectorAll('.palette-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update tab content
            document.querySelectorAll('.palette-tab-content').forEach(content => {
                content.classList.toggle('active', content.dataset.tab === tabName);
            });
        });
    });

    // Initialize color search
    initializeColorSearch();

    // Initialize color lock controls
    const poiBtn = document.getElementById('btn-lock-poi');

    function updatePOIButton() {
        if (editor.hasLockedPOI()) {
            poiBtn.textContent = 'Unlock POI';
            poiBtn.classList.add('poi-locked');
        } else {
            poiBtn.textContent = 'Lock POI';
            poiBtn.classList.remove('poi-locked');
        }
    }

    poiBtn.addEventListener('click', () => {
        if (editor.hasLockedPOI()) {
            editor.unlockAllPOI();
        } else {
            editor.lockAllPOI();
        }
        updatePOIButton();
    });

    document.getElementById('btn-unlock-all').addEventListener('click', () => {
        editor.clearAllColorLocks();
        updatePOIButton();
    });

    window.updatePOIButton = updatePOIButton;
}

/**
 * Initialize color search functionality
 */
function initializeColorSearch() {
    const searchInput = document.getElementById('color-search');
    const clearButton = document.getElementById('color-search-clear');
    const paletteContainer = document.getElementById('color-palette');

    // Handle search input
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        // Show/hide clear button
        clearButton.classList.toggle('visible', query.length > 0);

        // Filter colors
        filterColors(query);
    });

    // Handle clear button
    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        clearButton.classList.remove('visible');
        filterColors('');
        searchInput.focus();
    });

    // Handle Escape key to clear search
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            clearButton.classList.remove('visible');
            filterColors('');
        }
    });

    /**
     * Filter colors based on search query
     */
    function filterColors(query) {
        const tabContents = paletteContainer.querySelectorAll('.palette-tab-content');
        const subcategories = paletteContainer.querySelectorAll('.color-subcategory');
        let totalVisibleColors = 0;

        // When searching, show all tabs' content temporarily
        if (query !== '') {
            tabContents.forEach(tab => tab.classList.add('active'));
        } else {
            // Restore normal tab behavior
            const activeTabName = document.querySelector('.palette-tab.active')?.dataset.tab || 'biomes';
            tabContents.forEach(tab => {
                tab.classList.toggle('active', tab.dataset.tab === activeTabName);
            });
        }

        // Filter within subcategories
        subcategories.forEach(subcategory => {
            const header = subcategory.querySelector('.color-subcategory-header');
            const subcatName = header ? header.textContent.toLowerCase() : '';
            const colorItems = subcategory.querySelectorAll('.color-item');

            let visibleInSubcat = 0;

            colorItems.forEach(colorItem => {
                const colorName = colorItem.dataset.name.toLowerCase();
                const displayName = colorItem.querySelector('.color-name')?.textContent.toLowerCase() || '';

                const matches = query === '' ||
                              colorName.includes(query) ||
                              displayName.includes(query) ||
                              subcatName.includes(query);

                colorItem.classList.toggle('hidden', !matches);

                if (matches) {
                    visibleInSubcat++;
                    totalVisibleColors++;
                }
            });

            subcategory.classList.toggle('hidden', visibleInSubcat === 0);
        });

        // Also filter color items not in subcategories (like POI tab)
        const directColorItems = paletteContainer.querySelectorAll('.palette-tab-content > .color-category-content > .color-item');
        directColorItems.forEach(colorItem => {
            const colorName = colorItem.dataset.name.toLowerCase();
            const displayName = colorItem.querySelector('.color-name')?.textContent.toLowerCase() || '';

            const matches = query === '' ||
                          colorName.includes(query) ||
                          displayName.includes(query);

            colorItem.classList.toggle('hidden', !matches);

            if (matches) {
                totalVisibleColors++;
            }
        });

        // Show "no results" message if needed
        let noResultsMsg = paletteContainer.querySelector('.search-no-results');

        if (totalVisibleColors === 0 && query !== '') {
            if (!noResultsMsg) {
                noResultsMsg = document.createElement('div');
                noResultsMsg.className = 'search-no-results';
                noResultsMsg.textContent = `No colors found for "${query}"`;
                paletteContainer.appendChild(noResultsMsg);
            } else {
                noResultsMsg.textContent = `No colors found for "${query}"`;
                noResultsMsg.style.display = 'block';
            }
        } else if (noResultsMsg) {
            noResultsMsg.style.display = 'none';
        }
    }

    // Expose for testing
    window.filterColors = filterColors;
}

/**
 * Update palette based on active layer type
 * Switches to appropriate tab and disables irrelevant tabs
 */
function updatePaletteForLayer(layerType) {
    const tabButtons = document.querySelectorAll('.palette-tab');
    const tabContents = document.querySelectorAll('.palette-tab-content');

    // Determine which tabs are valid for this layer type
    const isDataLayer = (layerType === 'Height' || layerType === 'Difficulty' || layerType === 'Hazard');

    // Enable/disable tabs based on layer type
    tabButtons.forEach(btn => {
        const tabName = btn.dataset.tab;
        if (isDataLayer) {
            // Data layers can only use Other tab
            btn.disabled = (tabName !== 'other');
            btn.classList.toggle('disabled', tabName !== 'other');
        } else {
            // Biome layers can use Biomes and POI, not Other
            btn.disabled = (tabName === 'other');
            btn.classList.toggle('disabled', tabName === 'other');
        }
    });

    // Determine which tab to show
    let targetTab = 'biomes'; // default for biome layers
    if (isDataLayer) {
        targetTab = 'other';
    } else {
        // If current active tab is disabled, switch to biomes
        const currentActiveTab = document.querySelector('.palette-tab.active');
        if (currentActiveTab && currentActiveTab.disabled) {
            targetTab = 'biomes';
        } else if (currentActiveTab) {
            targetTab = currentActiveTab.dataset.tab;
        }
    }

    // Switch to the target tab
    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === targetTab);
    });
    tabContents.forEach(content => {
        content.classList.toggle('active', content.dataset.tab === targetTab);
    });

    // For the "Other" tab, show only the relevant subcategory for the layer type
    if (isDataLayer) {
        const subcategories = document.querySelectorAll('.palette-tab-content[data-tab="other"] .color-subcategory');
        subcategories.forEach(subcat => {
            const header = subcat.querySelector('.color-subcategory-header');
            const subcatName = header ? header.textContent : '';
            const shouldShow = subcatName.toLowerCase().includes(layerType.toLowerCase());
            subcat.classList.toggle('hidden', !shouldShow);
        });
    }

    // For biome layers, show all biome subcategories
    if (!isDataLayer) {
        const subcategories = document.querySelectorAll('.palette-tab-content[data-tab="biomes"] .color-subcategory');
        subcategories.forEach(subcat => {
            subcat.classList.remove('hidden');
        });
    }

    // Clear any active search when switching layers
    const searchInput = document.getElementById('color-search');
    if (searchInput && searchInput.value) {
        searchInput.value = '';
        document.getElementById('color-search-clear').classList.remove('visible');
        if (typeof window.filterColors === 'function') {
            window.filterColors('');
        }
    }
}

// Make it globally available
window.updatePaletteForLayer = updatePaletteForLayer;

/**
 * Initialize layers panel
 */
function initializeLayersPanel() {
    updateLayersPanel();
}

/**
 * Check if layer has wrong data types
 */
function checkLayerDataTypes(layer) {
    const warnings = [];

    // Define expected categories for each layer type
    const expectedCategories = {
        'height': ['Height'],
        'difficulty': ['Difficulty'],
        'hazard': ['Hazards'],
        'floor': ['Biomes'],
        'sky': ['Biomes'],
        'underground': ['Biomes']
    };

    const layerType = (layer.layerType || '').toLowerCase();
    const expected = expectedCategories[layerType] || [];

    if (expected.length === 0) return warnings; // Unknown layer type, no check

    // Check all tiles in the layer (now tileData stores colors)
    const wrongCategories = new Set();
    const sampleWrongTiles = []; // Store samples for debugging
    for (const [key, color] of layer.tileData) {
        if (color && window.colorMapper) {
            const enumData = window.colorMapper.getEnumFromColor(color);
            if (enumData && enumData.category) {
                if (!expected.includes(enumData.category)) {
                    wrongCategories.add(enumData.category);
                    // Store first 3 examples
                    if (sampleWrongTiles.length < 3) {
                        sampleWrongTiles.push({ key, color, enumData });
                    }
                }
            }
        }
    }

    // Debug: log samples of wrong tiles
    if (sampleWrongTiles.length > 0) {
        console.log(`[WARNING] Layer "${layer.name}" (type: ${layerType}) has wrong categories:`, wrongCategories);
        console.log('  Sample wrong tiles:', sampleWrongTiles);
    }

    // Generate warnings for each wrong category found
    for (const category of wrongCategories) {
        warnings.push(`Layer "${layer.name}" contains ${category} tiles but should only contain ${expected.join(', ')}`);
    }

    return warnings;
}

/**
 * Clear invalid data types from a layer
 */
function clearInvalidDataTypes(layer) {
    // Define expected categories for each layer type
    const expectedCategories = {
        'height': ['Height'],
        'difficulty': ['Difficulty'],
        'hazard': ['Hazards'],
        'floor': ['Biomes'],
        'sky': ['Biomes'],
        'underground': ['Biomes']
    };

    const layerType = (layer.layerType || '').toLowerCase();
    const expected = expectedCategories[layerType] || [];

    if (expected.length === 0) return; // Unknown layer type, no clearing

    // Clear all tiles with invalid categories (now tileData stores colors)
    const tilesToRemove = [];
    for (const [key, color] of layer.tileData) {
        if (color && window.colorMapper) {
            const enumData = window.colorMapper.getEnumFromColor(color);
            if (enumData && enumData.category) {
                if (!expected.includes(enumData.category)) {
                    tilesToRemove.push(key);
                }
            }
        }
    }

    // Remove invalid tiles
    for (const key of tilesToRemove) {
        const [x, y] = key.split(',').map(Number);
        layer.clearTile(x, y);
    }
}

/**
 * Render a single layer thumbnail (async, non-blocking)
 * Uses offscreen canvas to prevent flashing during render
 */
async function renderLayerThumbnail(layerIndex) {
    const canvas = document.querySelector(`.layer-thumbnail[data-layer-index="${layerIndex}"]`);
    if (!canvas) return;

    const layer = editor.layerManager.layers[layerIndex];
    if (!layer) return;

    const thumbnailSize = 64;
    const gridSize = editor.layerManager.width;

    // Create offscreen canvas to prevent flashing
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = thumbnailSize;
    offscreenCanvas.height = thumbnailSize;
    const offscreenCtx = offscreenCanvas.getContext('2d');

    // Calculate scale factor (how many grid cells per thumbnail pixel)
    const scale = gridSize / thumbnailSize;

    // Use ImageData for faster pixel manipulation
    const imageData = offscreenCtx.createImageData(thumbnailSize, thumbnailSize);
    const data = imageData.data;

    // Render in chunks to avoid blocking
    const chunkSize = 16; // Process 16 rows at a time
    for (let startY = 0; startY < thumbnailSize; startY += chunkSize) {
        // Yield to browser between chunks
        if (startY > 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const endY = Math.min(startY + chunkSize, thumbnailSize);

        for (let ty = startY; ty < endY; ty++) {
            for (let tx = 0; tx < thumbnailSize; tx++) {
                // Sample the grid at this position
                const gx = Math.floor(tx * scale);
                const gy = Math.floor(ty * scale);

                // Get color directly from tileData (more performant)
                const key = `${gx},${gy}`;
                const color = layer.tileData.get(key);

                // Set pixel color
                const pixelIndex = (ty * thumbnailSize + tx) * 4;
                if (color) {
                    // Parse hex color
                    const r = parseInt(color.slice(1, 3), 16);
                    const g = parseInt(color.slice(3, 5), 16);
                    const b = parseInt(color.slice(5, 7), 16);
                    data[pixelIndex] = r;
                    data[pixelIndex + 1] = g;
                    data[pixelIndex + 2] = b;
                    data[pixelIndex + 3] = 255;
                } else {
                    // Transparent/empty
                    data[pixelIndex] = 26;
                    data[pixelIndex + 1] = 26;
                    data[pixelIndex + 2] = 26;
                    data[pixelIndex + 3] = 255;
                }
            }
        }
    }

    // Draw to offscreen canvas
    offscreenCtx.putImageData(imageData, 0, 0);

    // Copy the complete image to the visible canvas in one atomic operation
    // This prevents flashing by ensuring the user never sees a partially-rendered thumbnail
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, thumbnailSize, thumbnailSize);
    ctx.drawImage(offscreenCanvas, 0, 0);
}

/**
 * Render all layer thumbnails asynchronously
 */
async function renderAllLayerThumbnails() {
    const t0 = performance.now();
    console.log('[THUMBNAILS] Starting to render all layer thumbnails...');
    const layers = editor.layerManager.layers;

    // Render thumbnails one at a time to avoid blocking
    for (let i = 0; i < layers.length; i++) {
        const layerStart = performance.now();
        await renderLayerThumbnail(i);
        console.log(`[THUMBNAILS] Layer ${i} (${layers[i]?.name}) thumbnail rendered in ${(performance.now() - layerStart).toFixed(1)}ms`);
    }
    console.log(`[THUMBNAILS] All ${layers.length} thumbnails rendered in ${(performance.now() - t0).toFixed(1)}ms`);
}

/**
 * Update a single layer thumbnail (call this when a layer changes)
 */
function updateLayerThumbnail(layerIndex) {
    // Use requestIdleCallback for low priority updates
    if (window.requestIdleCallback) {
        requestIdleCallback(() => renderLayerThumbnail(layerIndex), { timeout: 500 });
    } else {
        setTimeout(() => renderLayerThumbnail(layerIndex), 100);
    }
}

/**
 * Filter color palette to show only colors valid for the current layer
 */
function filterColorsByLayer(layerType) {
    // Define expected categories for each layer type
    const expectedCategories = {
        'height': ['Height'],
        'difficulty': ['Difficulty'],
        'hazard': ['Hazards'],
        'floor': ['Biomes'],
        'sky': ['Biomes'],
        'underground': ['Biomes']
    };

    const layerTypeLower = (layerType || '').toLowerCase();
    const validCategories = expectedCategories[layerTypeLower] || [];

    // If no valid categories defined for this layer type, show all colors
    if (validCategories.length === 0) {
        document.querySelectorAll('.color-category').forEach(category => {
            category.classList.remove('hidden');
        });
        return;
    }

    // Show/hide categories based on validity
    document.querySelectorAll('.color-category').forEach(category => {
        const categoryHeader = category.querySelector('.color-category-header');
        const categoryName = categoryHeader.textContent.trim();

        const isValid = validCategories.includes(categoryName);
        category.classList.toggle('hidden', !isValid);

        // Expand valid categories
        if (isValid) {
            category.classList.remove('collapsed');
        }
    });
}

/**
 * Ensure the currently selected color is valid for the active layer
 * If not, switch to the first valid color
 */
function ensureValidColorForLayer(layerType) {
    // Define expected categories for each layer type
    const expectedCategories = {
        'height': ['Height'],
        'difficulty': ['Difficulty'],
        'hazard': ['Hazards'],
        'floor': ['Biomes'],
        'sky': ['Biomes'],
        'underground': ['Biomes']
    };

    const layerTypeLower = (layerType || '').toLowerCase();
    const validCategories = expectedCategories[layerTypeLower] || [];

    // If no valid categories defined, no need to switch
    if (validCategories.length === 0) return;

    // Check if current color is valid
    const currentTileset = editor.selectedTileset;
    if (currentTileset && currentTileset.category && validCategories.includes(currentTileset.category)) {
        // Current color is valid, keep it
        return;
    }

    // Current color is invalid, find first valid color
    const tilesets = configManager.getTilesets();
    for (const [name, tileset] of Object.entries(tilesets)) {
        if (tileset.category && validCategories.includes(tileset.category)) {
            editor.selectTileset(name);
            document.getElementById('status-message').textContent = `Switched to valid color: ${tileset.displayName || name}`;
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 2000);
            break;
        }
    }
}

/**
 * Update layers panel
 */
function updateLayersPanel() {
    const layersList = document.getElementById('layers-list');
    layersList.innerHTML = '';

    const layers = editor.layerManager.layers;

    // Render layers in normal order (as configured)
    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];

        const isActive = i === editor.layerManager.activeLayerIndex;
        const isVisible = editor.recentLayerSelections.includes(i);

        const layerItem = document.createElement('div');
        let className = 'layer-item';
        if (isActive) className += ' active';
        if (isVisible) className += ' layer-visible';
        layerItem.className = className;

        // Layer header
        const layerHeader = document.createElement('div');
        layerHeader.className = 'layer-header';

        const layerName = document.createElement('div');
        layerName.className = 'layer-name';
        layerName.textContent = layer.name;

        // Note: Layer data type validation removed from hot path for performance
        // Use validateAllLayers() on-demand (e.g., before export) instead

        // Add thumbnail canvas
        const thumbnail = document.createElement('canvas');
        thumbnail.className = 'layer-thumbnail';
        thumbnail.width = 64;
        thumbnail.height = 64;
        thumbnail.dataset.layerIndex = i;

        layerHeader.appendChild(layerName);
        layerHeader.appendChild(thumbnail);

        // Click to select layer
        layerItem.addEventListener('click', () => {
            console.log(`[UI] Layer clicked: ${i} (${layer.name})`);
            const wasActive = (editor.layerManager.activeLayerIndex === i);

            editor.layerManager.setActiveLayer(i);

            // Update palette to show appropriate colors for this layer type
            if (typeof window.updatePaletteForLayer === 'function') {
                window.updatePaletteForLayer(layer.layerType || layer.name);
            }

            // TOGGLE BEHAVIOR: Click active layer to toggle solo/multi view
            if (wasActive) {
                if (editor.layerSoloMode) {
                    // EXIT SOLO MODE: Restore previous configuration
                    editor.layerManager.layers.forEach((layer, idx) => {
                        layer.visible = editor.preSoloVisibility[idx] || false;
                    });
                    editor.topLayerOpacity = editor.preSoloOpacity;
                    editor.recentLayerSelections = editor.preSoloRecentSelections.length > 0
                        ? [...editor.preSoloRecentSelections]
                        : [i]; // Fallback to current layer if empty
                    editor.layerSoloMode = false;

                    // Update UI opacity slider
                    document.getElementById('layer-opacity').value = Math.round(editor.topLayerOpacity * 100);
                    document.getElementById('layer-opacity-label').textContent = `Top Layer Opacity: ${Math.round(editor.topLayerOpacity * 100)}%`;
                } else {
                    // ENTER SOLO MODE: Save current config, show only this layer, 100% opacity
                    editor.preSoloVisibility = editor.layerManager.layers.map(l => l.visible);
                    editor.preSoloOpacity = editor.topLayerOpacity;
                    editor.preSoloRecentSelections = [...editor.recentLayerSelections];

                    // Show only this layer
                    editor.layerManager.layers.forEach((layer, idx) => {
                        layer.visible = (idx === i);
                    });
                    editor.recentLayerSelections = [i];
                    editor.topLayerOpacity = 1.0;
                    editor.layerSoloMode = true;

                    // Update UI opacity slider
                    document.getElementById('layer-opacity').value = 100;
                    document.getElementById('layer-opacity-label').textContent = `Top Layer Opacity: 100%`;
                }
            } else {
                // SWITCHING LAYERS: Exit solo mode if active, then normal behavior
                if (editor.layerSoloMode) {
                    // Restore from solo mode first
                    editor.layerManager.layers.forEach((layer, idx) => {
                        layer.visible = editor.preSoloVisibility[idx] || false;
                    });
                    editor.topLayerOpacity = editor.preSoloOpacity;
                    editor.recentLayerSelections = editor.preSoloRecentSelections.length > 0
                        ? [...editor.preSoloRecentSelections]
                        : [i]; // Fallback to current layer if empty
                    editor.layerSoloMode = false;

                    // Update UI opacity slider
                    document.getElementById('layer-opacity').value = Math.round(editor.topLayerOpacity * 100);
                    document.getElementById('layer-opacity-label').textContent = `Top Layer Opacity: ${Math.round(editor.topLayerOpacity * 100)}%`;
                }

                // Normal layer switching: Update recent selections (show last 2)
                editor.recentLayerSelections = editor.recentLayerSelections.filter(idx => idx !== i);
                editor.recentLayerSelections.unshift(i); // Add to front
                if (editor.recentLayerSelections.length > 2) {
                    editor.recentLayerSelections.pop(); // Keep only last 2
                }

                // Update visibility for all layers (show only last 2 selected)
                editor.layerManager.layers.forEach((layer, idx) => {
                    layer.visible = editor.recentLayerSelections.includes(idx);
                });
            }

            // Filter colors and ensure valid color for new layer
            const activeLayer = editor.layerManager.getActiveLayer();
            if (activeLayer) {
                filterColorsByLayer(activeLayer.layerType);
                ensureValidColorForLayer(activeLayer.layerType);
            }

            updateLayersPanel();
            editor.render();
            editor.renderMinimap();
            editor.updateUndoRedoButtons(); // Update buttons for new active layer
        });

        layerItem.appendChild(layerHeader);
        layersList.appendChild(layerItem);
    }

    // Render thumbnails asynchronously
    requestIdleCallback(() => renderAllLayerThumbnails(), { timeout: 100 });

    // Update undo/redo button states for the active layer
    editor.updateUndoRedoButtons();
}

/**
 * Initialize tool buttons
 */
function initializeToolButtons() {
    console.log('[TOOLS] Initializing tool buttons...');
    const toolButtons = document.querySelectorAll('.tool-btn');
    console.log(`[TOOLS] Found ${toolButtons.length} tool buttons`);

    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tool = button.dataset.tool;
            console.log(`[TOOLS] Tool button clicked: ${tool}`);

            // Set the tool
            editor.setTool(tool);
            console.log(`[TOOLS] Tool set to: ${tool}, currentTool:`, editor.currentTool);

            // Update active state - use fresh query to avoid stale references
            document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Update context-sensitive tool options
            updateToolOptions(tool);
        });
    });

    // Initialize tool options for default tool (pencil)
    updateToolOptions('pencil');

    // Brush size slider
    const brushSizeSlider = document.getElementById('brush-size');
    const brushSizeLabel = document.getElementById('brush-size-label');

    brushSizeSlider.addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        editor.brushSize = size;
        brushSizeLabel.textContent = `Brush Size: ${size}`;
    });

    brushSizeSlider.addEventListener('change', (e) => {
        const size = parseInt(e.target.value);
        editor.brushSize = size;
        brushSizeLabel.textContent = `Brush Size: ${size}`;
    });

    // Layer opacity slider
    const layerOpacitySlider = document.getElementById('layer-opacity');
    const layerOpacityLabel = document.getElementById('layer-opacity-label');

    layerOpacitySlider.addEventListener('input', (e) => {
        const opacity = parseInt(e.target.value) / 100;
        editor.topLayerOpacity = opacity;
        layerOpacityLabel.textContent = `Top Layer Opacity: ${e.target.value}%`;
        editor.render();
        editor.renderMinimap();
    });

    // Brush shape segmented control
    document.querySelectorAll('#brush-shape-control .segment').forEach(button => {
        button.addEventListener('click', (e) => {
            // Remove active class from all segments
            document.querySelectorAll('#brush-shape-control .segment').forEach(btn => {
                btn.classList.remove('active');
            });
            // Add active class to clicked segment
            e.target.classList.add('active');
            // Update editor brush shape
            editor.brushShape = e.target.dataset.value;
        });
    });

    // Fill mode checkbox
    document.getElementById('fill-mode').addEventListener('change', (e) => {
        editor.fillMode = e.target.checked ? 'filled' : 'outline';
    });
}

/**
 * Initialize toolbar
 */
function initializeToolbar() {
    // New
    // New Project - Show name input UI
    document.getElementById('btn-new').addEventListener('click', () => {
        // Show name input, hide dropdown
        document.getElementById('project-dropdown').style.display = 'none';
        document.getElementById('project-name-input').style.display = 'inline-block';
        document.getElementById('btn-create-project').style.display = 'inline-block';
        document.getElementById('btn-cancel-new-project').style.display = 'inline-block';
        document.getElementById('project-name-input').value = '';
        document.getElementById('project-name-input').focus();
    });

    // Create Project
    document.getElementById('btn-create-project').addEventListener('click', () => {
        createNewProject();
    });

    // Cancel New Project
    document.getElementById('btn-cancel-new-project').addEventListener('click', () => {
        // Hide name input, show dropdown
        document.getElementById('project-dropdown').style.display = 'inline-block';
        document.getElementById('project-name-input').style.display = 'none';
        document.getElementById('btn-create-project').style.display = 'none';
        document.getElementById('btn-cancel-new-project').style.display = 'none';
    });

    // Project Dropdown Change
    document.getElementById('project-dropdown').addEventListener('change', (e) => {
        const projectName = e.target.value;

        if (!projectName) {
            // User selected "New Project..." option
            document.getElementById('btn-new').click();
            return;
        }

        // Load selected project
        loadProjectByName(projectName);
    });

    // Delete Project
    document.getElementById('btn-delete-project').addEventListener('click', () => {
        const projectName = getActiveProject();
        if (!projectName) return;

        if (confirm(`Delete project "${projectName}"? This cannot be undone.`)) {
            deleteProjectFromCache(projectName);

            // Clear editor and deactivate project
            exitSoloMode();
            editor.clearAll();
            editor.currentFileName = null;
            setActiveProject(null);

            // Update UI
            updateProjectDropdown();
            updateProjectUI();

            document.getElementById('status-message').textContent = `Deleted: ${projectName}`;
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 2000);
        }
    });

    // Import
    document.getElementById('btn-import').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const spinner = document.getElementById('project-loading-spinner');
            const reader = new FileReader();
            reader.onload = async (event) => {
                // Show spinner
                spinner.style.display = 'inline-block';

                // Allow UI to update before blocking with heavy work
                await new Promise(resolve => setTimeout(resolve, 10));

                try {
                    const data = JSON.parse(event.target.result);

                    // Check for name collision before importing
                    const projectName = file.name.replace(/\.json$/, '');
                    const existingProjects = getAllCachedProjectNames();
                    if (existingProjects.includes(projectName)) {
                        const overwrite = confirm(
                            `A project named "${projectName}" already exists in the cache.\n\n` +
                            `Importing will overwrite the existing project.\n\n` +
                            `Do you want to continue?`
                        );
                        if (!overwrite) {
                            spinner.style.display = 'none';
                            document.getElementById('status-message').textContent = 'Import cancelled';
                            setTimeout(() => {
                                document.getElementById('status-message').textContent = 'Ready';
                            }, 2000);
                            return; // Cancel import
                        }
                    }

                    // Check if it's a JSON-RLE file (has metadata and layers)
                    if (data.metadata && data.layers) {
                        // Validate the RLE data before importing using dynamic validator
                        const validator = dynamicValidator || rleValidator;
                        const validationResult = validator.validate(data);

                        if (!validationResult.valid) {
                            // Format error messages (separate tips from errors)
                            const errorMessages = validationResult.errors
                                .filter(e => !e.startsWith('💡'))
                                .slice(0, 5); // Show first 5 errors
                            const tips = validationResult.errors
                                .filter(e => e.startsWith('💡'))
                                .slice(0, 2); // Show first 2 tips

                            let errorText = 'Validation errors detected:\n\n' + errorMessages.join('\n');
                            if (tips.length > 0) {
                                errorText += '\n\nTips:\n' + tips.join('\n');
                            }
                            if (validationResult.errors.length > 7) {
                                errorText += `\n\n... and ${validationResult.errors.length - 7} more errors`;
                            }
                            errorText += '\n\nContinue with import anyway?';

                            const proceed = confirm(errorText);
                            if (!proceed) {
                                document.getElementById('status-message').textContent = 'Import cancelled';
                                return;
                            }
                        } else if (validationResult.warnings && validationResult.warnings.length > 0) {
                            console.warn('Import warnings:', validationResult.warnings);
                        }

                        // Import RLE data
                        editor.layerManager.importRLEData(data, configManager);

                        // Resize canvas to match imported world size
                        const worldSize = data.metadata.world_size;
                        editor.layerManager.resize(worldSize, worldSize);
                        editor.resizeCanvas();

                        // Filename handled by import

                        document.getElementById('status-message').textContent = `Loaded JSON-RLE: ${data.metadata.name} (${worldSize}×${worldSize})`;
                    } else {
                        // Legacy format import
                        editor.importLevel(data);

                        // Filename handled by import

                        document.getElementById('status-message').textContent = `Loaded: ${file.name}`;
                    }

                    // Exit solo mode if active (layer count/indices may have changed)
                    exitSoloMode();

                    // Initialize layer visibility after loading file
                    const activeIdx = editor.layerManager.activeLayerIndex;
                    editor.recentLayerSelections = [activeIdx];
                    editor.layerManager.layers.forEach((layer, idx) => {
                        layer.visible = (idx === activeIdx);
                    });

                    editor.render();
                    editor.renderMinimap();
                    updateLayersPanel();
                    editor.isDirty = false;

                    // Import into cache (projectName already declared above)
                    saveProjectToCache(projectName, data);

                    // Update UI
                    updateProjectDropdown();
                    updateProjectUI();
                    autoSaveCurrentProject(); // Initial save to cache

                } catch (error) {
                    console.error('Import error:', error);
                    alert('Error loading file: ' + error.message);
                    document.getElementById('status-message').textContent = 'Import failed';
                } finally {
                    // Hide spinner
                    spinner.style.display = 'none';
                }
            };
            reader.readAsText(file);
        }
        e.target.value = '';
    });

    // Export
    document.getElementById('btn-export').addEventListener('click', () => {
        exportLevel();
    });

    // Save As
    document.getElementById('btn-save-as').addEventListener('click', () => {
        saveAsProject();
    });

    // Grid size resize
    document.getElementById('btn-resize-grid').addEventListener('click', () => {
        const newSize = parseInt(document.getElementById('grid-size-select').value);

        if (editor.layerManager.getTotalTileCount() > 0) {
            if (!confirm(`Resize to ${newSize}×${newSize}? This may crop content outside new bounds.`)) {
                return;
            }
        }

        editor.resizeGrid(newSize, newSize);
        editor.fitToView();
        document.getElementById('status-message').textContent = `Grid resized to ${newSize}×${newSize}`;
    });

    // Zoom with adaptive increments
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        console.log(`[UI] Zoom in clicked, current zoom: ${editor.zoom}`);
        let delta;
        if (editor.zoom < 0.2) {
            delta = 0.01; // Very fine at low zoom
        } else if (editor.zoom < 0.5) {
            delta = 0.025; // Fine under 50%
        } else if (editor.zoom < 1.0) {
            delta = 0.05; // Medium under 100%
        } else {
            delta = 0.25; // Normal above 100%
        }
        editor.setZoom(editor.zoom + delta);
        console.log(`[UI] Zoom in complete, new zoom: ${editor.zoom}`);
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        console.log(`[UI] Zoom out clicked, current zoom: ${editor.zoom}`);
        let delta;
        if (editor.zoom < 0.2) {
            delta = 0.01; // Very fine at low zoom
        } else if (editor.zoom < 0.5) {
            delta = 0.025; // Fine under 50%
        } else if (editor.zoom < 1.0) {
            delta = 0.05; // Medium under 100%
        } else {
            delta = 0.25; // Normal above 100%
        }
        editor.setZoom(editor.zoom - delta);
        console.log(`[UI] Zoom out complete, new zoom: ${editor.zoom}`);
    });

    document.getElementById('btn-zoom-fit').addEventListener('click', () => {
        console.log(`[UI] Fit to view clicked`);
        editor.fitToView();
        console.log(`[UI] Fit to view complete, zoom: ${editor.zoom}`);
    });

    // Show grid
    document.getElementById('show-grid').addEventListener('change', (e) => {
        editor.showGrid = e.target.checked;
        editor.render();
    });

    // Show guide lines
    document.getElementById('show-guides').addEventListener('change', (e) => {
        editor.showGuides = e.target.checked;
        editor.render();
    });

    // Horizontal guide divisions
    document.getElementById('guide-horizontal').addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        if (value >= 1 && value <= 10) {
            editor.guideHorizontal = value;
            editor.render();
        }
    });

    // Vertical guide divisions
    document.getElementById('guide-vertical').addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        if (value >= 1 && value <= 10) {
            editor.guideVertical = value;
            editor.render();
        }
    });

    // Undo/Redo
    document.getElementById('btn-undo').addEventListener('click', () => {
        console.log(`[UI] Undo clicked`);
        editor.undo();
        console.log(`[UI] Undo complete`);
        updateLayersPanel(); // Refresh layer panel to show correct highlighting
    });

    document.getElementById('btn-redo').addEventListener('click', () => {
        editor.redo();
        updateLayersPanel(); // Refresh layer panel to show correct highlighting
    });

    // Selection transform buttons
    document.getElementById('btn-rotate')?.addEventListener('click', () => {
        if (editor.currentTool && editor.currentTool.rotateSelection) {
            editor.currentTool.rotateSelection(editor);
        }
    });

    document.getElementById('btn-hflip')?.addEventListener('click', () => {
        if (editor.currentTool && editor.currentTool.flipHorizontal) {
            editor.currentTool.flipHorizontal(editor);
        }
    });

    document.getElementById('btn-vflip')?.addEventListener('click', () => {
        if (editor.currentTool && editor.currentTool.flipVertical) {
            editor.currentTool.flipVertical(editor);
        }
    });

    // Update grid size inputs (if they exist)
    const gridWidthInput = document.getElementById('grid-width');
    const gridHeightInput = document.getElementById('grid-height');
    if (gridWidthInput) gridWidthInput.value = editor.layerManager.width;
    if (gridHeightInput) gridHeightInput.value = editor.layerManager.height;
}

/**
 * Update context-sensitive tool options visibility
 * @param {string} toolName - The name of the selected tool
 */
function updateToolOptions(toolName) {
    // Tools that use brush size (line thickness)
    const brushSizeTools = ['pencil', 'eraser', 'line', 'rectangle'];
    // Tools that use brush shape
    const brushShapeTools = ['pencil', 'eraser'];

    // Brush size options
    const brushSizeOptions = document.getElementById('brush-size-options');
    if (brushSizeOptions) {
        brushSizeOptions.style.display = brushSizeTools.includes(toolName) ? 'flex' : 'none';
    }

    // Brush shape options
    const brushShapeOptions = document.getElementById('brush-shape-options');
    if (brushShapeOptions) {
        brushShapeOptions.style.display = brushShapeTools.includes(toolName) ? 'flex' : 'none';
    }

    // Shape fill options (rectangle tool)
    const shapeFillOptions = document.getElementById('shape-fill-options');
    if (shapeFillOptions) {
        shapeFillOptions.style.display = (toolName === 'rectangle') ? 'flex' : 'none';
    }

    // Selection actions (selection and wand tools)
    const selectionActions = document.getElementById('selection-actions');
    if (selectionActions) {
        selectionActions.style.display = (toolName === 'selection' || toolName === 'wand') ? 'flex' : 'none';
    }

    // Wand options (include diagonals)
    const wandOptions = document.getElementById('wand-options');
    if (wandOptions) {
        wandOptions.style.display = (toolName === 'wand') ? 'flex' : 'none';
    }

    // Ruler options
    const rulerOptions = document.getElementById('ruler-options');
    if (rulerOptions) {
        rulerOptions.style.display = (toolName === 'ruler') ? 'flex' : 'none';
    }
}

/**
 * Initialize keyboard shortcuts
 */
function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Tool shortcuts (only if Ctrl/Cmd not pressed)
        const toolKeys = {
            'b': 'pencil',
            'g': 'bucket',
            'l': 'line',
            'u': 'rectangle',  // Changed from R to U (R now for rotate)
            'i': 'eyedropper',
            'e': 'eraser',
            'p': 'pan',        // Changed from H to P (H now for h-flip)
            'm': 'selection',
            'w': 'wand',
            't': 'stamp',      // New: Stamp tool
            'k': 'ruler'       // New: Ruler tool
        };

        if (toolKeys[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const selectedTool = toolKeys[e.key.toLowerCase()];
            editor.setTool(selectedTool);

            // Update UI
            document.querySelectorAll('.tool-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tool === selectedTool);
            });

            // Update context-sensitive tool options
            updateToolOptions(selectedTool);

            return;
        }

        // Number keys 1-9 for brush size (when no modifiers and Alt is NOT pressed)
        if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const brushSizes = [1, 2, 3, 5, 7, 10, 15, 20, 25];
            const sizeIndex = parseInt(e.key) - 1;
            if (sizeIndex < brushSizes.length) {
                const size = brushSizes[sizeIndex];
                editor.brushSize = size;
                document.getElementById('brush-size').value = size;
                document.getElementById('brush-size-label').textContent = `Brush Size: ${size}`;
                document.getElementById('status-message').textContent = `Brush size: ${size}×${size}`;
                setTimeout(() => {
                    document.getElementById('status-message').textContent = 'Ready';
                }, 1500);
            }
            return;
        }

        // F key - fit to view
        if (e.key.toLowerCase() === 'f') {
            e.preventDefault();
            editor.fitToView();
            return;
        }

        // Escape key - clear selection or measurement
        if (e.key === 'Escape') {
            if (editor.currentTool.name === 'selection' || editor.currentTool.name === 'wand') {
                e.preventDefault();
                editor.currentTool.clearSelection(editor);
                editor.render();
                document.getElementById('status-message').textContent = 'Selection cleared';
                setTimeout(() => {
                    document.getElementById('status-message').textContent = 'Ready';
                }, 1500);
            } else if (editor.currentTool.name === 'ruler') {
                e.preventDefault();
                editor.currentTool.clearMeasurement();
                editor.render();
                document.getElementById('status-message').textContent = 'Measurement cleared';
                setTimeout(() => {
                    document.getElementById('status-message').textContent = 'Ready';
                }, 1500);
            }
            return;
        }

        // Selection Transform hotkeys (R, H, V) - only when selection/wand tool has a selection
        if ((editor.currentTool.name === 'selection' || editor.currentTool.name === 'wand') &&
            editor.currentTool.hasSelection && editor.currentTool.hasSelection()) {
            if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                editor.currentTool.rotateSelection(editor);
                return;
            }
            if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                editor.currentTool.flipHorizontal(editor);
                return;
            }
            if (e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                editor.currentTool.flipVertical(editor);
                return;
            }
        }

        // Space key - temporary pan mode (hold space)
        if (e.key === ' ' && !editor.spacePressed) {
            e.preventDefault();
            editor.spacePressed = true;
            document.getElementById('canvas-container').style.cursor = 'grab';
            return;
        }

        // Track Shift key (for perfect circles/squares in shape tool)
        if (e.key === 'Shift') {
            editor.shiftPressed = true;
            // Trigger preview update if currently drawing
            if (editor.currentTool && editor.currentTool.isDrawing) {
                editor.render();
            }
        }

        // Track Ctrl/Cmd key (for center-based drawing in shape tool)
        if (e.key === 'Control' || e.key === 'Meta') {
            editor.ctrlPressed = true;
            // Trigger preview update if currently drawing
            if (editor.currentTool && editor.currentTool.isDrawing) {
                editor.render();
            }
        }

        // [ and ] for changing top layer opacity
        if (e.key === '[' || e.code === 'BracketLeft') {
            e.preventDefault();
            editor.topLayerOpacity = Math.max(0, editor.topLayerOpacity - 0.1);
            document.getElementById('layer-opacity').value = Math.round(editor.topLayerOpacity * 100);
            document.getElementById('layer-opacity-label').textContent = `Top Layer Opacity: ${Math.round(editor.topLayerOpacity * 100)}%`;
            editor.render();
            editor.renderMinimap();
            return;
        }

        if (e.key === ']' || e.code === 'BracketRight') {
            e.preventDefault();
            editor.topLayerOpacity = Math.min(1, editor.topLayerOpacity + 0.1);
            document.getElementById('layer-opacity').value = Math.round(editor.topLayerOpacity * 100);
            document.getElementById('layer-opacity-label').textContent = `Top Layer Opacity: ${Math.round(editor.topLayerOpacity * 100)}%`;
            editor.render();
            editor.renderMinimap();
            return;
        }

        // Ctrl/Cmd shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) {
                        editor.redo();
                        updateLayersPanel();
                    } else {
                        editor.undo();
                        updateLayersPanel();
                    }
                    break;

                case 'y':
                    e.preventDefault();
                    editor.redo();
                    updateLayersPanel();
                    break;

                case 's':
                    e.preventDefault();
                    if (e.shiftKey) {
                        // Ctrl+Shift+S: Save selection as stamp
                        saveSelectionAsStamp();
                    } else {
                        exportLevel();
                    }
                    break;

                case 'n':
                    e.preventDefault();
                    document.getElementById('btn-new').click();
                    break;

                case 'o':
                    e.preventDefault();
                    document.getElementById('btn-import').click();
                    break;

                case 'c':
                    // Copy selection (support both selection and wand tool)
                    if (editor.currentTool.name === 'selection' || editor.currentTool.name === 'wand') {
                        e.preventDefault();
                        editor.currentTool.copySelection(editor);
                        // Tool will set its own status message
                    }
                    break;

                case 'v':
                    // Paste selection (support both selection and wand tool)
                    if (editor.currentTool.name === 'selection' || editor.currentTool.name === 'wand') {
                        e.preventDefault();
                        editor.currentTool.pasteSelection(editor);
                        // Tool will set its own status message
                    }
                    break;
            }
        }

        // Zoom shortcuts
        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            editor.setZoom(editor.zoom + 0.25);
        } else if (e.key === '-' && !e.ctrlKey) {
            e.preventDefault();
            editor.setZoom(editor.zoom - 0.25);
        } else if (e.key === '0') {
            e.preventDefault();
            editor.setZoom(1.0);
            document.getElementById('status-message').textContent = 'Zoom reset to 100%';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 1500);
        }
    });

    // Handle key releases
    document.addEventListener('keyup', (e) => {
        if (e.key === ' ') {
            editor.spacePressed = false;
            document.getElementById('canvas-container').style.cursor = 'crosshair';
        }

        // Release Shift key
        if (e.key === 'Shift') {
            editor.shiftPressed = false;
            // Trigger preview update if currently drawing
            if (editor.currentTool && editor.currentTool.isDrawing) {
                editor.render();
            }
        }

        // Release Ctrl/Cmd key
        if (e.key === 'Control' || e.key === 'Meta') {
            editor.ctrlPressed = false;
            // Trigger preview update if currently drawing
            if (editor.currentTool && editor.currentTool.isDrawing) {
                editor.render();
            }
        }
    });
}

/**
 * Save level to file (using RLE format)
 */
function exportLevel() {
    // Get project name from active project or use default
    const projectName = getActiveProject() || 'TSIC_Mall';
    const fullFileName = projectName.endsWith('.json') ? projectName : `${projectName}.json`;

    // Generate RLE data
    const rleData = editor.layerManager.exportRLEData(
        projectName,
        'Generated by TSIC Level Editor',
        Date.now()
    );

    const json = JSON.stringify(rleData); // Minified for smallest file size

    // Download file
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fullFileName;
    a.click();

    URL.revokeObjectURL(url);

    document.getElementById('status-message').textContent = `Exported: ${fullFileName}`;
    setTimeout(() => {
        document.getElementById('status-message').textContent = 'Ready';
    }, 2000);
}

/**
 * Start auto-save
 */
function startAutoSave() {
    // Disabled localStorage autosave for large levels (causes QuotaExceededError)
    // Use manual save/load with JSON files instead
    editor.autoSaveInterval = setInterval(() => {
        if (editor.isDirty) {
            // Skip autosave - user must manually save large levels
            console.log('Auto-save skipped (use manual save for large levels)');
        }
    }, 30000); // Every 30 seconds
}

/**
 * Load from auto-save
 */
function loadAutoSave() {
    const saved = localStorage.getItem('levelEditor_autoSave');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            const time = localStorage.getItem('levelEditor_autoSave_time');
            const timeStr = time ? new Date(parseInt(time)).toLocaleString() : 'unknown';

            if (confirm(`Load auto-saved level from ${timeStr}?`)) {
                editor.importLevel(data);

                // Initialize layer visibility after loading
                const activeIdx = editor.layerManager.activeLayerIndex;
                editor.recentLayerSelections = [activeIdx];
                editor.layerManager.layers.forEach((layer, idx) => {
                    layer.visible = (idx === activeIdx);
                });

                editor.render();
                editor.renderMinimap();
                updateLayersPanel();
                document.getElementById('status-message').textContent = 'Auto-save loaded';
            }
        } catch (error) {
            console.error('Error loading auto-save:', error);
        }
    }
}

/**
 * Load test JSON file for e2e testing
 */
async function loadTestJSON() {
    try {
        console.log('[E2E] Starting test JSON load...');
        // Don't set status here - only set it if we actually find the file

        const response = await fetch('e2e-test-data.json');
        if (!response.ok) {
            console.log('[E2E] No test JSON file found (404), skipping auto-load');
            // Status will be set by the caller
            return;
        }

        // Only show loading message if file actually exists
        document.getElementById('status-message').textContent = 'Loading test data...';

        console.log('[E2E] Fetched test data, parsing JSON...');
        const data = await response.json();
        console.log('[E2E] JSON parsed successfully');

        // Import the test data using the same logic as file import
        if (data.metadata && data.layers) {
            console.log('[E2E] Detected metadata format, importing...');

            // Clear localStorage to avoid stale layer data
            localStorage.removeItem('levelEditor_autoSave');
            localStorage.removeItem('levelEditor_autoSave_time');
            console.log('[E2E] Cleared localStorage autosave');

            // It's a JSON-RLE format
            editor.layerManager.importRLEData(data, configManager);

            // Resize canvas to match imported world size
            const worldSize = data.metadata.world_size || data.metadata.gridSize;
            editor.layerManager.resize(worldSize, worldSize);
            editor.resizeCanvas();

            // Set current filename
            editor.currentFileName = 'e2e-test-data.json';
            updateFileNameDisplay();

            document.getElementById('status-message').textContent = `Test data loaded: ${worldSize}×${worldSize} with ${Object.keys(data.layers).length} layers`;
            console.log(`[E2E] Test data loaded successfully: ${worldSize}×${worldSize}, ${Object.keys(data.layers).length} layers`);
        } else {
            // Legacy format
            console.log('[E2E] Detected legacy format, importing...');
            editor.importLevel(data);
            editor.currentFileName = 'e2e-test-data.json';
            updateFileNameDisplay();
            document.getElementById('status-message').textContent = 'Test data loaded (legacy format)';
        }

        // Initialize layer visibility after loading test data
        const activeIdx = editor.layerManager.activeLayerIndex;
        editor.recentLayerSelections = [activeIdx];
        editor.layerManager.layers.forEach((layer, idx) => {
            layer.visible = (idx === activeIdx);
        });

        editor.render();
        editor.renderMinimap();
        updateLayersPanel();
        editor.isDirty = false;

        console.log('[E2E] Render complete, test data ready');

    } catch (error) {
        console.error('[E2E] Failed to load test JSON:', error);
        document.getElementById('status-message').textContent = `Test load failed: ${error.message}`;
        // Don't fail silently so we can see the error
    }
}

// Old file name display functions removed - replaced by updateProjectUI()

// Old single-file localStorage functions removed - replaced by multi-project cache system

// ============================================================================
// MULTI-PROJECT CACHE SYSTEM
// ============================================================================

/**
 * Get project key for localStorage
 */
function getProjectKey(projectName) {
    return `tsic_project_${projectName}`;
}

/**
 * Get all projects from cache (reconstructed from individual keys)
 * @returns {Object} Projects object {projectName: {data, timestamp}, ...}
 */
function getAllProjectsFromCache() {
    try {
        const t0 = performance.now();
        const projects = {};

        // Get list of project names from index
        const indexJson = localStorage.getItem('tsic_project_index');
        const projectNames = indexJson ? JSON.parse(indexJson) : [];

        // Load each project individually
        for (const name of projectNames) {
            const projectJson = localStorage.getItem(getProjectKey(name));
            if (projectJson) {
                projects[name] = JSON.parse(projectJson);
            }
        }

        console.log(`[CACHE] getAllProjectsFromCache: loaded ${Object.keys(projects).length} projects in ${(performance.now() - t0).toFixed(1)}ms`);
        return projects;
    } catch (error) {
        console.error('Error loading projects from cache:', error);
        return {};
    }
}

/**
 * Save all projects to cache (for migration only)
 * @param {Object} projects - Projects object
 */
function saveAllProjectsToCache(projects) {
    try {
        const t0 = performance.now();
        const projectNames = Object.keys(projects);

        // Save index
        localStorage.setItem('tsic_project_index', JSON.stringify(projectNames));

        // Save each project individually
        for (const name of projectNames) {
            localStorage.setItem(getProjectKey(name), JSON.stringify(projects[name]));
        }

        console.log(`[CACHE] saveAllProjectsToCache: saved ${projectNames.length} projects in ${(performance.now() - t0).toFixed(1)}ms`);
    } catch (error) {
        console.error('Error saving projects to cache:', error);
        if (error.name === 'QuotaExceededError') {
            throw new Error('Storage quota exceeded. Please delete some projects or export them to files.');
        }
        throw error;
    }
}

/**
 * Get the active project name
 * @returns {string|null} Active project name or null
 */
function getActiveProject() {
    return localStorage.getItem('tsic_activeProject');
}

/**
 * Set the active project name
 * @param {string} projectName - Project name to set as active
 */
function setActiveProject(projectName) {
    if (projectName) {
        localStorage.setItem('tsic_activeProject', projectName);
    } else {
        localStorage.removeItem('tsic_activeProject');
    }
}

/**
 * Save a project to cache (individual key for speed)
 * @param {string} projectName - Name of the project
 * @param {Object} data - Level data object (RLE format)
 */
function saveProjectToCache(projectName, data) {
    const t0 = performance.now();

    try {
        // Save project data to its own key
        const projectData = {
            data: data,
            timestamp: Date.now()
        };

        const t1 = performance.now();
        const json = JSON.stringify(projectData);
        const stringifyTime = performance.now() - t1;

        const t2 = performance.now();
        localStorage.setItem(getProjectKey(projectName), json);
        const writeTime = performance.now() - t2;

        // Update index (only if project is new)
        const indexJson = localStorage.getItem('tsic_project_index');
        const projectNames = indexJson ? JSON.parse(indexJson) : [];
        if (!projectNames.includes(projectName)) {
            projectNames.push(projectName);
            localStorage.setItem('tsic_project_index', JSON.stringify(projectNames));
        }

        setActiveProject(projectName);

        const size = (json.length / 1024 / 1024).toFixed(2);
        console.log(`[CACHE] saveProjectToCache "${projectName}": stringify=${stringifyTime.toFixed(1)}ms, write=${writeTime.toFixed(1)}ms, size=${size}MB, total=${(performance.now() - t0).toFixed(1)}ms`);
    } catch (error) {
        console.error('Error saving project to cache:', error);
        if (error.name === 'QuotaExceededError') {
            throw new Error('Storage quota exceeded. Please delete some projects or export them to files.');
        }
        throw error;
    }
}

/**
 * Load a project from cache (individual key for speed)
 * @param {string} projectName - Name of the project to load
 * @returns {Object|null} Project data or null if not found
 */
function loadProjectFromCache(projectName) {
    const t0 = performance.now();

    try {
        const projectJson = localStorage.getItem(getProjectKey(projectName));
        if (!projectJson) {
            console.log(`[CACHE] loadProjectFromCache "${projectName}": not found`);
            return null;
        }

        const projectData = JSON.parse(projectJson);
        const size = (projectJson.length / 1024 / 1024).toFixed(2);
        console.log(`[CACHE] loadProjectFromCache "${projectName}": size=${size}MB, time=${(performance.now() - t0).toFixed(1)}ms`);

        return projectData.data;
    } catch (error) {
        console.error('Error loading project from cache:', error);
        return null;
    }
}

/**
 * Get list of all project names (fast - just reads index)
 * @returns {Array<string>} Array of project names
 */
function getAllCachedProjectNames() {
    try {
        const indexJson = localStorage.getItem('tsic_project_index');
        const projectNames = indexJson ? JSON.parse(indexJson) : [];
        return projectNames.sort();
    } catch (error) {
        console.error('Error reading project index:', error);
        return [];
    }
}

/**
 * Delete a project from cache (fast - individual key)
 * @param {string} projectName - Name of project to delete
 */
function deleteProjectFromCache(projectName) {
    try {
        // Remove project data
        localStorage.removeItem(getProjectKey(projectName));

        // Update index
        const indexJson = localStorage.getItem('tsic_project_index');
        let projectNames = indexJson ? JSON.parse(indexJson) : [];
        projectNames = projectNames.filter(n => n !== projectName);
        localStorage.setItem('tsic_project_index', JSON.stringify(projectNames));

        // If this was the active project, clear active
        if (getActiveProject() === projectName) {
            setActiveProject(null);
        }

        console.log(`[CACHE] Deleted project "${projectName}"`);
        return true;
    } catch (error) {
        console.error('Error deleting project:', error);
        return false;
    }
}

/**
 * Rename a project in cache
 * @param {string} oldName - Current project name
 * @param {string} newName - New project name
 * @returns {boolean} Success
 */
function renameProjectInCache(oldName, newName) {
    if (oldName === newName) return true;

    try {
        // Load old project data
        const projectJson = localStorage.getItem(getProjectKey(oldName));
        if (!projectJson) {
            console.error(`Project "${oldName}" not found`);
            return false;
        }

        // Check if new name already exists
        if (localStorage.getItem(getProjectKey(newName))) {
            console.error(`Project "${newName}" already exists`);
            return false;
        }

        // Save under new name
        localStorage.setItem(getProjectKey(newName), projectJson);

        // Remove old key
        localStorage.removeItem(getProjectKey(oldName));

        // Update index
        const indexJson = localStorage.getItem('tsic_project_index');
        let projectNames = indexJson ? JSON.parse(indexJson) : [];
        projectNames = projectNames.filter(n => n !== oldName);
        if (!projectNames.includes(newName)) {
            projectNames.push(newName);
        }
        localStorage.setItem('tsic_project_index', JSON.stringify(projectNames));

        // Update active project if this was it
        if (getActiveProject() === oldName) {
            setActiveProject(newName);
        }

        console.log(`[CACHE] Renamed project "${oldName}" to "${newName}"`);
        return true;
    } catch (error) {
        console.error('Error renaming project:', error);
        return false;
    }
}

/**
 * Migrate old storage formats to new per-project system
 * This runs once on page load if old data exists
 */
function migrateOldStorageToCache() {
    try {
        // Migration 1: Very old single-file format
        const oldData = localStorage.getItem('tsic_currentFile_data');
        const oldFilename = localStorage.getItem('tsic_currentFile_name');

        if (oldData && oldFilename) {
            console.log('[MIGRATE] Migrating old single-file format...');

            const data = JSON.parse(oldData);
            const projectName = oldFilename.replace(/\.json$/, '');

            // Save to new format
            saveProjectToCache(projectName, data);

            // Remove old keys
            localStorage.removeItem('tsic_currentFile_data');
            localStorage.removeItem('tsic_currentFile_name');
            localStorage.removeItem('tsic_currentFile_timestamp');

            console.log(`[MIGRATE] Migrated "${projectName}" from single-file format`);
            return projectName;
        }

        // Migration 2: Old all-in-one tsic_projects format
        const oldProjects = localStorage.getItem('tsic_projects');
        if (oldProjects && !localStorage.getItem('tsic_project_index')) {
            console.log('[MIGRATE] Migrating old all-in-one projects format...');

            const projects = JSON.parse(oldProjects);
            const projectNames = Object.keys(projects);

            // Save each project to its own key
            for (const name of projectNames) {
                localStorage.setItem(getProjectKey(name), JSON.stringify(projects[name]));
                console.log(`[MIGRATE] Migrated project "${name}"`);
            }

            // Create index
            localStorage.setItem('tsic_project_index', JSON.stringify(projectNames));

            // Remove old all-in-one key
            localStorage.removeItem('tsic_projects');

            console.log(`[MIGRATE] Migrated ${projectNames.length} projects to per-project format`);
            return projectNames[0] || null;
        }
    } catch (error) {
        console.error('[MIGRATE] Error during migration:', error);
    }

    return null;
}

/**
 * Update project dropdown with cached projects
 */
function updateProjectDropdown() {
    const dropdown = document.getElementById('project-dropdown');
    const projectNames = getAllCachedProjectNames();
    const activeProject = getActiveProject();

    // Clear existing options except "New Project..."
    dropdown.innerHTML = '<option value="">New Project...</option>';

    // Add all cached projects
    projectNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (name === activeProject) {
            option.selected = true;
        }
        dropdown.appendChild(option);
    });
}

/**
 * Update UI based on active project state
 */
function updateProjectUI() {
    const activeProject = getActiveProject();
    const deleteBtn = document.getElementById('btn-delete-project');
    const statusFilename = document.getElementById('status-filename');

    if (activeProject) {
        deleteBtn.style.display = 'inline-block';
        statusFilename.textContent = activeProject;
        editor.currentFileName = activeProject;
    } else {
        deleteBtn.style.display = 'none';
        statusFilename.textContent = 'No project loaded';
        editor.currentFileName = null;
    }
}

/**
 * Create a new project (async for spinner)
 */
async function createNewProject() {
    const totalSteps = 8;
    let currentStep = 0;
    const createStart = performance.now();

    console.log('[CREATE] ========== STARTING NEW PROJECT CREATION ==========');

    const input = document.getElementById('project-name-input');
    const projectName = input.value.trim();

    if (!projectName) {
        alert('Please enter a project name');
        return;
    }

    console.log(`[CREATE] Project name: "${projectName}"`);

    // Check if project already exists
    const existing = getAllCachedProjectNames();
    if (existing.includes(projectName)) {
        alert(`Project "${projectName}" already exists. Please choose a different name.`);
        return;
    }

    const spinner = document.getElementById('project-loading-spinner');

    // Show spinner
    spinner.style.display = 'inline-block';

    // Hide name input, show dropdown immediately
    document.getElementById('project-dropdown').style.display = 'inline-block';
    document.getElementById('project-name-input').style.display = 'none';
    document.getElementById('btn-create-project').style.display = 'none';
    document.getElementById('btn-cancel-new-project').style.display = 'none';

    try {
        // Step 1: Exit solo mode
        currentStep++;
        reportProgress('Exiting solo mode...', currentStep, totalSteps);
        console.log(`[CREATE] Step ${currentStep}/${totalSteps}: Exiting solo mode`);
        await yieldToBrowser();
        let stepStart = performance.now();
        exitSoloMode();
        console.log(`[CREATE] Step ${currentStep} completed in ${(performance.now() - stepStart).toFixed(1)}ms`);

        // Step 2: Clear layer manager
        currentStep++;
        reportProgress('Clearing layers...', currentStep, totalSteps);
        console.log(`[CREATE] Step ${currentStep}/${totalSteps}: Clearing layer manager`);
        await yieldToBrowser();
        stepStart = performance.now();
        editor.layerManager.clearAll();
        console.log(`[CREATE] Step ${currentStep} completed in ${(performance.now() - stepStart).toFixed(1)}ms`);

        // Step 3: Fill layers with defaults (this is expensive!)
        currentStep++;
        const layerCount = editor.layerManager.layers.length;
        console.log(`[CREATE] Step ${currentStep}/${totalSteps}: Filling ${layerCount} layers with defaults`);
        for (let i = 0; i < layerCount; i++) {
            const layer = editor.layerManager.layers[i];
            reportProgress(`Filling layer: ${layer.name}`, currentStep, totalSteps);
            console.log(`[CREATE]   Filling layer ${i + 1}/${layerCount}: ${layer.name} (${editor.layerManager.width}x${editor.layerManager.height} tiles)`);
            await yieldToBrowser();
            stepStart = performance.now();

            const defaultColor = editor.getDefaultColorForLayer(layer.layerType);
            if (defaultColor) {
                editor.layerManager.fillLayerWithDefault(layer, defaultColor);
            }
            console.log(`[CREATE]   Layer ${layer.name} filled in ${(performance.now() - stepStart).toFixed(1)}ms`);
        }

        // Step 4: Reset visibility and undo stacks
        currentStep++;
        reportProgress('Resetting layer state...', currentStep, totalSteps);
        console.log(`[CREATE] Step ${currentStep}/${totalSteps}: Resetting visibility and undo stacks`);
        await yieldToBrowser();
        stepStart = performance.now();
        editor.recentLayerSelections = [0];
        editor.layerManager.layers.forEach((layer, idx) => {
            layer.visible = (idx === 0);
            layer.undoStack = [];
            layer.redoStack = [];
        });
        editor.updateUndoRedoButtons();
        editor.isDirty = false;
        console.log(`[CREATE] Step ${currentStep} completed in ${(performance.now() - stepStart).toFixed(1)}ms`);

        // Step 5: Update layers panel
        currentStep++;
        reportProgress('Updating layers panel...', currentStep, totalSteps);
        console.log(`[CREATE] Step ${currentStep}/${totalSteps}: Updating layers panel`);
        await yieldToBrowser();
        stepStart = performance.now();
        updateLayersPanel();
        console.log(`[CREATE] Step ${currentStep} completed in ${(performance.now() - stepStart).toFixed(1)}ms`);

        // Step 6: Render canvas
        currentStep++;
        reportProgress('Rendering canvas...', currentStep, totalSteps);
        console.log(`[CREATE] Step ${currentStep}/${totalSteps}: Rendering canvas and minimap`);
        await yieldToBrowser();
        stepStart = performance.now();
        editor.render();
        editor.renderMinimap();
        console.log(`[CREATE] Step ${currentStep} completed in ${(performance.now() - stepStart).toFixed(1)}ms`);

        // Step 7: Export to RLE format
        currentStep++;
        reportProgress('Exporting project data...', currentStep, totalSteps);
        console.log(`[CREATE] Step ${currentStep}/${totalSteps}: Exporting to RLE format`);
        await yieldToBrowser();
        stepStart = performance.now();
        const rleData = editor.layerManager.exportRLEData(
            projectName,
            'Generated by TSIC Level Editor',
            Date.now()
        );
        console.log(`[CREATE] Step ${currentStep} completed in ${(performance.now() - stepStart).toFixed(1)}ms`);

        // Step 8: Save to cache
        currentStep++;
        reportProgress('Saving to cache...', currentStep, totalSteps);
        console.log(`[CREATE] Step ${currentStep}/${totalSteps}: Saving to localStorage cache`);
        await yieldToBrowser();
        stepStart = performance.now();
        saveProjectToCache(projectName, rleData);
        console.log(`[CREATE] Step ${currentStep} completed in ${(performance.now() - stepStart).toFixed(1)}ms`);

        // Final UI updates
        console.log('[CREATE] Updating final UI state');
        updateProjectDropdown();
        updateProjectUI();

        const totalTime = performance.now() - createStart;
        console.log(`[CREATE] ========== PROJECT CREATED IN ${totalTime.toFixed(1)}ms ==========`);
        reportProgress(`Created: ${projectName}`);
        setTimeout(() => {
            reportProgress('Ready');
        }, 2000);
    } catch (error) {
        console.error('[CREATE] ERROR during project creation:', error);
        reportProgress('Error creating project');
        throw error;
    } finally {
        // Hide spinner
        spinner.style.display = 'none';
    }
}

/**
 * Save current project with a new name (Save As)
 */
async function saveAsProject() {
    const newName = prompt('Enter new project name:');

    if (!newName || !newName.trim()) {
        return;
    }

    const projectName = newName.trim();

    // Check if project already exists
    const existing = getAllCachedProjectNames();
    if (existing.includes(projectName)) {
        alert(`Project "${projectName}" already exists. Please choose a different name.`);
        return;
    }

    const spinner = document.getElementById('project-loading-spinner');
    spinner.style.display = 'inline-block';

    try {
        reportProgress('Saving as new project...', 1, 2);
        await yieldToBrowser();

        // Export current canvas data with new name
        const rleData = editor.layerManager.exportRLEData(
            projectName,
            'Generated by TSIC Level Editor',
            Date.now()
        );

        reportProgress('Writing to cache...', 2, 2);
        await yieldToBrowser();

        // Save to cache
        saveProjectToCache(projectName, rleData);

        // Update UI
        updateProjectDropdown();

        // Select the new project in dropdown
        const dropdown = document.getElementById('project-dropdown');
        dropdown.value = projectName;
        updateProjectUI();

        reportProgress(`Saved as: ${projectName}`);
        setTimeout(() => {
            reportProgress('Ready');
        }, 2000);

        console.log(`[SAVE AS] Project saved as "${projectName}"`);
    } catch (error) {
        console.error('[SAVE AS] ERROR:', error);
        reportProgress('Error saving project');
    } finally {
        spinner.style.display = 'none';
    }
}

/**
 * Load a project by name (async to allow spinner to render)
 */
async function loadProjectByName(projectName) {
    const totalSteps = 7;
    let currentStep = 0;
    const loadStart = performance.now();
    console.log(`[LOAD] ========== LOADING PROJECT "${projectName}" ==========`);

    const spinner = document.getElementById('project-loading-spinner');

    // Show spinner
    spinner.style.display = 'inline-block';

    // Step 1: Load from cache
    currentStep++;
    reportProgress('Loading from cache...', currentStep, totalSteps);
    console.log(`[LOAD] Step ${currentStep}/${totalSteps}: Loading project data from cache`);
    await yieldToBrowser();
    let t0 = performance.now();
    const projectData = loadProjectFromCache(projectName);
    console.log(`[LOAD] Cache read took ${(performance.now() - t0).toFixed(1)}ms`);

    if (!projectData) {
        spinner.style.display = 'none';
        // Clear the active project since it no longer exists
        setActiveProject(null);
        updateProjectDropdown();
        updateProjectUI();
        console.warn(`[LOAD] Project "${projectName}" not found in cache - cleared active project`);
        reportProgress('Previous project not found');
        setTimeout(() => {
            reportProgress('Ready - No project loaded');
        }, 3000);
        return;
    }

    console.log(`[LOAD] Project data found, metadata:`, projectData.metadata);
    console.log(`[LOAD] Layers in data: ${projectData.layers ? projectData.layers.length : 'N/A'}`);

    try {
        // Step 2: Import RLE data
        currentStep++;
        reportProgress('Importing layer data...', currentStep, totalSteps);
        console.log(`[LOAD] Step ${currentStep}/${totalSteps}: Importing RLE data`);
        await yieldToBrowser();
        t0 = performance.now();
        editor.layerManager.importRLEData(projectData, configManager);
        console.log(`[LOAD] RLE import took ${(performance.now() - t0).toFixed(1)}ms`);

        // Step 3: Resize canvas
        currentStep++;
        const worldSize = projectData.metadata.world_size;
        reportProgress(`Resizing to ${worldSize}x${worldSize}...`, currentStep, totalSteps);
        console.log(`[LOAD] Step ${currentStep}/${totalSteps}: Resizing to ${worldSize}x${worldSize}`);
        await yieldToBrowser();
        t0 = performance.now();
        editor.layerManager.resize(worldSize, worldSize);
        console.log(`[LOAD] Layer resize took ${(performance.now() - t0).toFixed(1)}ms`);

        t0 = performance.now();
        editor.resizeCanvas();
        console.log(`[LOAD] Canvas resize took ${(performance.now() - t0).toFixed(1)}ms`);

        // Step 4: Set up state
        currentStep++;
        reportProgress('Setting up editor state...', currentStep, totalSteps);
        console.log(`[LOAD] Step ${currentStep}/${totalSteps}: Setting up editor state`);
        await yieldToBrowser();

        // Set current filename
        editor.currentFileName = projectName;
        setActiveProject(projectName);

        // Exit solo mode if active
        exitSoloMode();

        // Initialize layer visibility after loading
        const activeIdx = editor.layerManager.activeLayerIndex;
        editor.recentLayerSelections = [activeIdx];
        editor.layerManager.layers.forEach((layer, idx) => {
            layer.visible = (idx === activeIdx);
        });
        console.log(`[LOAD] Editor state configured`);

        // Step 5: Render main canvas
        currentStep++;
        reportProgress('Rendering canvas...', currentStep, totalSteps);
        console.log(`[LOAD] Step ${currentStep}/${totalSteps}: Rendering main canvas`);
        await yieldToBrowser();
        t0 = performance.now();
        editor.render();
        console.log(`[LOAD] Main render took ${(performance.now() - t0).toFixed(1)}ms`);

        // Step 6: Render minimap
        currentStep++;
        reportProgress('Rendering minimap...', currentStep, totalSteps);
        console.log(`[LOAD] Step ${currentStep}/${totalSteps}: Rendering minimap`);
        await yieldToBrowser();
        t0 = performance.now();
        editor.renderMinimap();
        console.log(`[LOAD] Minimap render took ${(performance.now() - t0).toFixed(1)}ms`);

        // Step 7: Update UI
        currentStep++;
        reportProgress('Updating UI...', currentStep, totalSteps);
        console.log(`[LOAD] Step ${currentStep}/${totalSteps}: Updating UI panels`);
        await yieldToBrowser();
        t0 = performance.now();
        updateLayersPanel();
        console.log(`[LOAD] Layers panel update took ${(performance.now() - t0).toFixed(1)}ms`);

        t0 = performance.now();
        updateProjectUI();
        console.log(`[LOAD] Project UI update took ${(performance.now() - t0).toFixed(1)}ms`);

        editor.isDirty = false;

        const totalTime = performance.now() - loadStart;
        console.log(`[LOAD] ========== PROJECT LOADED in ${totalTime.toFixed(1)}ms ==========`);
        reportProgress(`Loaded: ${projectName}`);
        setTimeout(() => {
            reportProgress('Ready');
        }, 2000);
    } catch (error) {
        console.error('[LOAD] Error loading project:', error);
        reportProgress('Error loading project');
        alert('Error loading project: ' + error.message);
    } finally {
        // Hide spinner
        spinner.style.display = 'none';
    }
}

/**
 * Auto-save current project to cache (always-on)
 */
function autoSaveCurrentProject() {
    const saveStart = performance.now();
    console.log('[AUTOSAVE] Starting auto-save...');

    const projectName = getActiveProject();
    if (!projectName) {
        console.log('[AUTOSAVE] No active project, skipping');
        return; // No active project
    }

    try {
        // Generate RLE data
        console.log('[AUTOSAVE] Exporting RLE data...');
        let t0 = performance.now();
        const rleData = editor.layerManager.exportRLEData(
            projectName,
            'Generated by TSIC Level Editor',
            Date.now()
        );
        console.log(`[AUTOSAVE] RLE export took ${(performance.now() - t0).toFixed(1)}ms`);

        // Save to cache
        console.log('[AUTOSAVE] Saving to cache...');
        t0 = performance.now();
        saveProjectToCache(projectName, rleData);
        console.log(`[AUTOSAVE] Cache save took ${(performance.now() - t0).toFixed(1)}ms`);

        // Update status bar briefly
        document.getElementById('status-autosave').textContent = '💾 Auto-saved';
        setTimeout(() => {
            document.getElementById('status-autosave').textContent = '';
        }, 1500);

        editor.isDirty = false;
        console.log(`[AUTOSAVE] Complete in ${(performance.now() - saveStart).toFixed(1)}ms`);
    } catch (error) {
        console.error('[AUTOSAVE] Error:', error);
        if (error.message.includes('quota exceeded')) {
            document.getElementById('status-autosave').textContent = '❌ Cache full';
            setTimeout(() => {
                document.getElementById('status-autosave').textContent = '';
            }, 3000);
        }
    }
}

/**
 * Initialize always-on auto-save system
 */
function initializeAutoSaveCheckbox() {
    // Hook into editor's isDirty setter to trigger auto-save (always-on)
    let originalIsDirty = false;
    let autoSaveInProgress = false;

    Object.defineProperty(editor, 'isDirty', {
        get() {
            return originalIsDirty;
        },
        set(value) {
            originalIsDirty = value;

            // Auto-save when dirty and a project is active (always-on)
            if (value && getActiveProject()) {
                // Skip if save already in progress
                if (autoSaveInProgress) {
                    return;
                }

                // Debounce auto-save - wait 3 seconds after last change
                clearTimeout(editor.autoSaveDebounce);
                editor.autoSaveDebounce = setTimeout(() => {
                    if (autoSaveInProgress) return;
                    autoSaveInProgress = true;

                    // Use requestIdleCallback to avoid blocking UI
                    const doSave = () => {
                        try {
                            autoSaveCurrentProject();
                        } finally {
                            autoSaveInProgress = false;
                        }
                    };

                    if (window.requestIdleCallback) {
                        requestIdleCallback(doSave, { timeout: 5000 });
                    } else {
                        setTimeout(doSave, 100);
                    }
                }, 3000); // Wait 3 seconds after last change

                // Update thumbnail for active layer (debounced)
                clearTimeout(editor.thumbnailDebounce);
                editor.thumbnailDebounce = setTimeout(() => {
                    updateLayerThumbnail(editor.layerManager.activeLayerIndex);
                }, 500); // Update thumbnail 500ms after last change
            }
        }
    });
}

/**
 * Handle before unload
 */
window.addEventListener('beforeunload', (e) => {
    if (editor && editor.isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
    }
});

// ============================================================================
// STAMP STORAGE SYSTEM
// ============================================================================

/**
 * Get all stamps from localStorage
 * Stamps are organized by layer type: { Floor: [...], Underground: [...], etc }
 * @returns {Object} Stamps object organized by layer type
 */
function getAllStamps() {
    try {
        const stampsJson = localStorage.getItem('tsic_stamps');
        if (!stampsJson) return {};
        return JSON.parse(stampsJson);
    } catch (error) {
        console.error('Error loading stamps:', error);
        return {};
    }
}

/**
 * Save all stamps to localStorage
 * @param {Object} stamps - Stamps object organized by layer type
 */
function saveAllStamps(stamps) {
    try {
        localStorage.setItem('tsic_stamps', JSON.stringify(stamps));
    } catch (error) {
        console.error('Error saving stamps:', error);
        if (error.name === 'QuotaExceededError') {
            alert('Storage quota exceeded. Please delete some stamps.');
        }
    }
}

/**
 * Save the current selection as a stamp
 */
function saveSelectionAsStamp() {
    if (!editor || !editor.currentTool) return;

    const tool = editor.currentTool;
    if (tool.name !== 'selection' && tool.name !== 'wand') {
        document.getElementById('status-message').textContent = 'Switch to Selection or Wand tool first';
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 2000);
        return;
    }

    if (!tool.hasSelection || !tool.hasSelection()) {
        document.getElementById('status-message').textContent = 'No selection to save as stamp';
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 2000);
        return;
    }

    // Get selection data
    let selectionData;
    if (tool.name === 'selection') {
        // For box selection, lift if needed
        if (!tool.isFloating && tool.selectionData === null) {
            tool.liftSelection(editor);
        }
        selectionData = tool.selectionData;
    } else {
        // For wand tool
        if (!tool.selectionData) {
            tool.liftSelection(editor);
        }
        selectionData = tool.selectionData;
    }

    if (!selectionData || !selectionData.tiles || selectionData.tiles.length === 0) {
        document.getElementById('status-message').textContent = 'Empty selection cannot be saved';
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 2000);
        return;
    }

    // Get layer type from active layer
    const activeLayer = editor.layerManager.getActiveLayer();
    const layerType = activeLayer ? activeLayer.layerType : 'Floor';

    // Prompt for stamp name
    const name = prompt('Enter stamp name:', `Stamp ${Date.now()}`);
    if (!name) return;

    // Convert tile data to color-based format (store colors, not tilesets)
    const stampTiles = selectionData.tiles.map(tile => ({
        x: tile.x,
        y: tile.y,
        color: tile.tileset ? tile.tileset.color : '#000000'
    }));

    // Create stamp object
    const stamp = {
        id: `stamp_${Date.now()}`,
        name: name,
        layerType: layerType,
        width: selectionData.width,
        height: selectionData.height,
        tiles: stampTiles,
        createdAt: Date.now()
    };

    // Save to storage
    const stamps = getAllStamps();
    if (!stamps[layerType]) {
        stamps[layerType] = [];
    }
    stamps[layerType].push(stamp);
    saveAllStamps(stamps);

    document.getElementById('status-message').textContent = `Saved stamp: ${name} (${layerType})`;
    setTimeout(() => {
        document.getElementById('status-message').textContent = 'Ready';
    }, 2000);

    // Update stamps preview in sidebar
    updateStampsSidebar();
}

/**
 * Delete a stamp by ID
 * @param {string} stampId - The stamp ID to delete
 */
function deleteStamp(stampId) {
    const stamps = getAllStamps();
    for (const layerType of Object.keys(stamps)) {
        const index = stamps[layerType].findIndex(s => s.id === stampId);
        if (index !== -1) {
            stamps[layerType].splice(index, 1);
            saveAllStamps(stamps);
            updateStampsSidebar();
            updateStampPicker();
            return;
        }
    }
}

/**
 * Open the stamp picker modal
 */
function openStampPicker() {
    const modal = document.getElementById('stamp-picker-modal');
    if (!modal) return;

    // Get current layer type
    const activeLayer = editor.layerManager.getActiveLayer();
    const currentLayerType = activeLayer ? activeLayer.layerType : 'Floor';

    // Update layer name display
    const layerNameEl = document.getElementById('stamp-picker-layer-name');
    if (layerNameEl) {
        layerNameEl.textContent = currentLayerType;
    }

    // Populate stamp grid
    updateStampPicker();

    modal.classList.add('show');
}

/**
 * Close the stamp picker modal
 */
function closeStampPicker() {
    const modal = document.getElementById('stamp-picker-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

/**
 * Update the stamp picker modal content
 */
function updateStampPicker() {
    const grid = document.getElementById('stamp-picker-grid');
    if (!grid) return;

    const activeLayer = editor.layerManager.getActiveLayer();
    const currentLayerType = activeLayer ? activeLayer.layerType : 'Floor';

    const stamps = getAllStamps();
    const layerStamps = stamps[currentLayerType] || [];

    if (layerStamps.length === 0) {
        grid.innerHTML = '<div class="stamps-empty">No stamps saved for this layer type</div>';
        return;
    }

    grid.innerHTML = layerStamps.map(stamp => `
        <div class="stamp-picker-item" data-stamp-id="${stamp.id}">
            <div class="stamp-picker-preview">
                <canvas class="stamp-preview-canvas" data-stamp-id="${stamp.id}" width="64" height="64"></canvas>
            </div>
            <div class="stamp-picker-info">
                <span class="stamp-picker-name">${stamp.name}</span>
                <span class="stamp-picker-size">${stamp.width}×${stamp.height}</span>
            </div>
            <button class="stamp-picker-delete" data-stamp-id="${stamp.id}" title="Delete stamp">×</button>
        </div>
    `).join('');

    // Render stamp previews
    layerStamps.forEach(stamp => {
        renderStampPreview(stamp);
    });

    // Add click handlers
    grid.querySelectorAll('.stamp-picker-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('stamp-picker-delete')) return;
            const stampId = item.dataset.stampId;
            const stamp = layerStamps.find(s => s.id === stampId);
            if (stamp) {
                selectStamp(stamp);
                closeStampPicker();
            }
        });
    });

    grid.querySelectorAll('.stamp-picker-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const stampId = btn.dataset.stampId;
            if (confirm('Delete this stamp?')) {
                deleteStamp(stampId);
            }
        });
    });
}

/**
 * Render a stamp preview on a canvas
 */
function renderStampPreview(stamp) {
    const canvas = document.querySelector(`canvas[data-stamp-id="${stamp.id}"]`);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);

    // Calculate scale to fit
    const scale = Math.min(64 / stamp.width, 64 / stamp.height);
    const offsetX = (64 - stamp.width * scale) / 2;
    const offsetY = (64 - stamp.height * scale) / 2;

    // Draw tiles
    for (const tile of stamp.tiles) {
        ctx.fillStyle = tile.color;
        ctx.fillRect(
            offsetX + tile.x * scale,
            offsetY + tile.y * scale,
            scale,
            scale
        );
    }
}

/**
 * Select a stamp for the stamp tool
 */
function selectStamp(stamp) {
    // Switch to stamp tool if not already
    editor.setTool('stamp');

    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === 'stamp');
    });

    // Update context-sensitive tool options
    updateToolOptions('stamp');

    // Set the stamp on the tool
    if (editor.currentTool && editor.currentTool.name === 'stamp') {
        editor.currentTool.selectStamp(stamp);
    }

    updateStampsSidebar();

    document.getElementById('status-message').textContent = `Selected stamp: ${stamp.name}`;
    setTimeout(() => {
        document.getElementById('status-message').textContent = 'Ready';
    }, 1500);
}

/**
 * Update the stamps sidebar section
 */
function updateStampsSidebar() {
    const preview = document.getElementById('stamps-preview');
    if (!preview) return;

    if (editor.currentTool && editor.currentTool.name === 'stamp' && editor.currentTool.selectedStamp) {
        const stamp = editor.currentTool.selectedStamp;
        preview.innerHTML = `
            <div class="stamp-preview-info">
                <strong>${stamp.name}</strong>
                <span>${stamp.width}×${stamp.height} (${stamp.layerType})</span>
            </div>
        `;
    } else {
        preview.innerHTML = '<div class="stamps-empty">No stamp selected</div>';
    }
}

/**
 * Initialize stamp-related event handlers
 */
function initializeStamps() {
    // Open Stamps button
    const openBtn = document.getElementById('btn-open-stamps');
    if (openBtn) {
        openBtn.addEventListener('click', openStampPicker);
    }

    // Close stamp picker
    const closeBtn = document.getElementById('stamp-picker-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeStampPicker);
    }

    // Close on backdrop click
    const modal = document.getElementById('stamp-picker-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeStampPicker();
            }
        });
    }

    // Save as stamp button in tool options
    const saveStampBtn = document.getElementById('btn-save-stamp');
    if (saveStampBtn) {
        saveStampBtn.addEventListener('click', saveSelectionAsStamp);
    }

    // Expose openStampPicker for the stamp tool
    window.openStampPicker = openStampPicker;
}

// ============================================================================
// MAZE VISUALIZER INITIALIZATION
// ============================================================================

function initializeMazeVisualizer() {
    console.log('[Maze Visualizer] Initializing...');
    console.log('[Maze Visualizer] Editor exists:', !!editor);
    console.log('[Maze Visualizer] MazeVisualizer exists:', !!editor?.mazeVisualizer);

    const content = document.getElementById('maze-visualizer-content');
    const modeSelect = document.getElementById('maze-viz-mode');
    const regenerateBtn = document.getElementById('btn-regenerate-maze');
    const exportBtn = document.getElementById('btn-export-maze-data');
    const settingsHeader = document.getElementById('maze-settings-header');
    const settingsContent = document.getElementById('maze-settings-content');

    // Layer toggle buttons (Floor/Underground/Sky)
    const layerButtons = document.querySelectorAll('#maze-layer-control .segment');
    console.log('[Maze Visualizer] Found layer buttons:', layerButtons.length);
    layerButtons.forEach(button => {
        button.addEventListener('click', () => {
            console.log('[Maze Visualizer] Layer button clicked:', button.dataset.layer);
            const layerType = button.dataset.layer;

            // If clicking the already active button, disable visualizer
            if (button.classList.contains('active')) {
                button.classList.remove('active');
                editor.mazeVisualizer.enabled = false;
                content.style.display = 'none';
                editor.render();
                return;
            }

            // Deactivate all buttons
            layerButtons.forEach(btn => btn.classList.remove('active'));

            // Activate clicked button
            button.classList.add('active');

            // Enable visualizer and set layer
            editor.mazeVisualizer.enabled = true;
            editor.mazeVisualizer.setSelectedLayer(layerType);
            editor.mazeVisualizer.regenerateAll();
            content.style.display = 'block';
            updateMazeStatistics();
            editor.render();
        });
    });

    // Visualization mode selection
    modeSelect.addEventListener('change', (e) => {
        editor.mazeVisualizer.setVisualizationMode(e.target.value);
        editor.render();
    });

    // Settings collapsible
    settingsHeader.addEventListener('click', () => {
        settingsHeader.parentElement.classList.toggle('collapsed');
    });

    // Regenerate button
    regenerateBtn.addEventListener('click', () => {
        console.log('[Regenerate] Button clicked');

        // Gather settings
        const borderBiomes = new Set();
        document.querySelectorAll('#maze-border-biomes input[type="checkbox"]:checked').forEach(cb => {
            borderBiomes.add(cb.value);
        });

        const maxHeightDiff = parseInt(document.getElementById('maze-height-diff').value);
        const seed = parseInt(document.getElementById('maze-seed').value);

        console.log('[Regenerate] Settings from UI:');
        console.log('  - Border biomes:', Array.from(borderBiomes));
        console.log('  - Max height diff:', maxHeightDiff);
        console.log('  - Seed:', seed);

        // Update settings
        editor.mazeVisualizer.settings.borderBiomes = borderBiomes;
        editor.mazeVisualizer.settings.maxHeightDiff = maxHeightDiff;
        editor.mazeVisualizer.settings.seed = seed;

        console.log('[Regenerate] Updated visualizer settings:', editor.mazeVisualizer.settings);

        // Regenerate
        editor.mazeVisualizer.regenerateAll();
        updateMazeStatistics();
        editor.render();
    });

    // Export button
    exportBtn.addEventListener('click', () => {
        exportMazeData();
    });

}

/**
 * Update maze statistics display
 */
function updateMazeStatistics() {
    const statsContainer = document.getElementById('maze-stats');
    const statsContent = document.getElementById('maze-stats-content');

    const layerIndex = editor.mazeVisualizer.selectedLayer;
    if (layerIndex === null) {
        statsContainer.style.display = 'none';
        return;
    }

    const layerResults = editor.mazeVisualizer.floodFillResults.get(layerIndex);
    if (!layerResults) {
        statsContainer.style.display = 'none';
        return;
    }

    const layer = editor.layerManager.layers[layerIndex];
    if (!layer) {
        statsContainer.style.display = 'none';
        return;
    }

    statsContainer.style.display = 'block';

    const html = `<div class="stat-section">
        <h5>${layer.name}</h5>
        <ul>
            <li>Regions: ${layerResults.regions.length}</li>
            <li>Tiles in Regions: ${layerResults.tilesInRegions}</li>
            <li>Border Tiles: ${layerResults.borderTiles}</li>
            <li>Largest Region: ${layerResults.largestRegionSize} tiles</li>
            <li>Smallest Region: ${layerResults.smallestRegionSize} tiles</li>
        </ul>
    </div>`;

    statsContent.innerHTML = html;
}

/**
 * Export maze data to JSON
 */
function exportMazeData() {
    const data = {
        timestamp: new Date().toISOString(),
        settings: {
            borderBiomes: Array.from(editor.mazeVisualizer.settings.borderBiomes),
            maxHeightDiff: editor.mazeVisualizer.settings.maxHeightDiff,
            seed: editor.mazeVisualizer.settings.seed
        },
        layers: []
    };

    editor.mazeVisualizer.floodFillResults.forEach((results, layerIndex) => {
        const layer = editor.layerManager.layers[layerIndex];
        const mazeData = editor.mazeVisualizer.mazeData.get(layerIndex);

        data.layers.push({
            layerIndex,
            layerName: layer.name,
            layerType: layer.layerType,
            floodFillResults: {
                regionCount: results.regions.length,
                tilesInRegions: results.tilesInRegions,
                borderTiles: results.borderTiles,
                regions: results.regions.map(r => ({
                    regionSize: r.regionSize,
                    tileIndices: r.tileIndices
                }))
            },
            mazeData: mazeData ? Array.from(mazeData) : []
        });
    });

    // Download as JSON
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maze-data-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Export functions for editor access
if (typeof window !== 'undefined') {
    window.updateLayersPanel = updateLayersPanel;
    window.validateAllLayers = validateAllLayers;
    window.showValidationResults = showValidationResults;
    window.reportProgress = reportProgress;
    window.checkLayerDataTypes = checkLayerDataTypes;
}

// Initialize when DOM is loaded
console.log('[APP] Setting up init, document.readyState:', document.readyState);
if (document.readyState === 'loading') {
    console.log('[APP] DOM still loading, adding DOMContentLoaded listener');
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[APP] DOMContentLoaded fired, calling init()');
        init();
    });
} else {
    console.log('[APP] DOM already loaded, calling init() immediately');
    init();
}
