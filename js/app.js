/**
 * Main Application
 * Initializes the editor and handles UI interactions
 */

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
 * Initialize application
 */
async function init() {
    // IMPORTANT: Clear any old localStorage data that might have stale layers
    // This is critical when layer configuration changes
    const currentVersion = '3.0-six-layers';
    const storedVersion = localStorage.getItem('levelEditor_configVersion');
    if (storedVersion !== currentVersion) {
        console.log(`[INIT] Config version changed from ${storedVersion} to ${currentVersion}, clearing localStorage`);
        localStorage.clear();
        localStorage.setItem('levelEditor_configVersion', currentVersion);
    }

    // Load configuration
    const loaded = await configManager.loadConfig();
    if (!loaded) {
        console.warn('Using default configuration');
    }

    // Initialize color mapper
    const config = await fetch('config/biomes.json').then(r => r.json());
    colorMapper.loadFromConfig(config);
    console.log('[ColorMapper] Initialized:', colorMapper.getSummary());

    // Initialize dynamic validator
    dynamicValidator = new DynamicRLEValidator();
    const validatorLoaded = await dynamicValidator.loadConfig('config/biomes.json');
    if (!validatorLoaded.success) {
        console.error('Failed to load dynamic validator config:', validatorLoaded.error);
        console.warn('Falling back to hardcoded validator');
        dynamicValidator = null;
    } else {
        console.log('Dynamic validator loaded successfully');
        console.log(dynamicValidator.getConfigSummary());
    }

    // Create editor
    editor = new LevelEditor();
    window.editor = editor; // Expose for testing
    editor.initializeLayers(configManager);

    // Initialize UI
    initializeColorPalette();
    initializeLayersPanel();
    initializeToolButtons();
    initializeToolbar();
    initializeKeyboardShortcuts();
    initializeAutoSaveCheckbox();

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

    // Filter color palette based on active layer
    const activeLayer = editor.layerManager.getActiveLayer();
    if (activeLayer) {
        filterColorsByLayer(activeLayer.layerType);
        ensureValidColorForLayer(activeLayer.layerType);
    }

    // Start auto-save
    startAutoSave();

    // Auto-load test JSON if it exists (for e2e testing) - do this before loading projects
    await loadTestJSON();

    // Initialize project system (only if no test JSON was loaded)
    if (!editor.currentFileName) {
        // Populate project dropdown
        updateProjectDropdown();

        // Load active project if one exists
        const activeProject = getActiveProject();
        if (activeProject) {
            await loadProjectByName(activeProject);
        } else {
            updateProjectUI(); // Update UI for no project state
        }
    }

    // Update status
    if (!editor.currentFileName) {
        document.getElementById('status-message').textContent = 'Ready - No project loaded';
    }
}

/**
 * Initialize color palette with category folders
 */
function initializeColorPalette() {
    const paletteContainer = document.getElementById('color-palette');
    const tilesets = configManager.getTilesets();

    paletteContainer.innerHTML = '';

    // Group tilesets by category
    const categories = {};
    for (const [name, tileset] of Object.entries(tilesets)) {
        const category = tileset.category || 'Other';
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push({ name, tileset });
    }

    // Order categories for better UX - updated to match new categories
    const categoryOrder = ['Biomes', 'Difficulty', 'Height', 'Hazards', 'Other'];

    for (const categoryName of categoryOrder) {
        if (!categories[categoryName]) continue;

        // Create category folder
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'color-category';

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'color-category-header';
        categoryHeader.textContent = categoryName;
        categoryHeader.addEventListener('click', () => {
            categoryDiv.classList.toggle('collapsed');
        });

        const categoryContent = document.createElement('div');
        categoryContent.className = 'color-category-content';

        // Add colors to this category
        for (const { name, tileset } of categories[categoryName]) {
            const colorItem = document.createElement('div');
            colorItem.className = 'color-item';
            colorItem.dataset.name = name;

            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = tileset.color;

            // Add icon if present
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
                // Update selected state
                document.querySelectorAll('.color-item').forEach(item => item.classList.remove('selected'));
                colorItem.classList.add('selected');
            });

            categoryContent.appendChild(colorItem);
        }

        categoryDiv.appendChild(categoryHeader);
        categoryDiv.appendChild(categoryContent);
        paletteContainer.appendChild(categoryDiv);
    }

    // Initialize color search
    initializeColorSearch();
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
        const categories = paletteContainer.querySelectorAll('.color-category');
        let totalVisibleColors = 0;

        categories.forEach(category => {
            const categoryHeader = category.querySelector('.color-category-header');
            const categoryName = categoryHeader.textContent.toLowerCase();
            const colorItems = category.querySelectorAll('.color-item');

            let visibleInCategory = 0;

            colorItems.forEach(colorItem => {
                const colorName = colorItem.dataset.name.toLowerCase();

                // Match query against color name or category name
                const matches = query === '' ||
                              colorName.includes(query) ||
                              categoryName.includes(query);

                colorItem.classList.toggle('hidden', !matches);

                if (matches) {
                    visibleInCategory++;
                    totalVisibleColors++;
                }
            });

            // Hide category if no colors match
            category.classList.toggle('hidden', visibleInCategory === 0);

            // Expand categories with matches
            if (visibleInCategory > 0 && query !== '') {
                category.classList.remove('collapsed');
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
 */
async function renderLayerThumbnail(layerIndex) {
    const canvas = document.querySelector(`.layer-thumbnail[data-layer-index="${layerIndex}"]`);
    if (!canvas) return;

    const layer = editor.layerManager.layers[layerIndex];
    if (!layer) return;

    const ctx = canvas.getContext('2d');
    const thumbnailSize = 64;
    const gridSize = editor.layerManager.width;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, thumbnailSize, thumbnailSize);

    // Calculate scale factor (how many grid cells per thumbnail pixel)
    const scale = gridSize / thumbnailSize;

    // Use ImageData for faster pixel manipulation
    const imageData = ctx.createImageData(thumbnailSize, thumbnailSize);
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

    // Draw the final image
    ctx.putImageData(imageData, 0, 0);
}

/**
 * Render all layer thumbnails asynchronously
 */
async function renderAllLayerThumbnails() {
    const layers = editor.layerManager.layers;

    // Render thumbnails one at a time to avoid blocking
    for (let i = 0; i < layers.length; i++) {
        await renderLayerThumbnail(i);
    }
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

        // Check for wrong data types in layer and add warning
        const warnings = checkLayerDataTypes(layer);
        if (warnings.length > 0) {
            const warningIcon = document.createElement('span');
            warningIcon.textContent = ' ⚠️';
            warningIcon.title = warnings.join('\n') + '\n\nClick to remove all invalid colors';
            warningIcon.style.color = '#ffa500';
            warningIcon.style.cursor = 'pointer';
            warningIcon.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent layer selection
                if (confirm(`Remove all invalid colors from layer "${layer.name}"?\n\n${warnings.join('\n')}`)) {
                    editor.saveState();
                    clearInvalidDataTypes(layer);
                    updateLayersPanel();
                    editor.render();
                    editor.renderMinimap();
                    editor.isDirty = true;
                    document.getElementById('status-message').textContent = 'Invalid colors removed';
                    setTimeout(() => {
                        document.getElementById('status-message').textContent = 'Ready';
                    }, 2000);
                }
            });
            layerName.appendChild(warningIcon);
        }

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
            const wasActive = (editor.layerManager.activeLayerIndex === i);

            editor.layerManager.setActiveLayer(i);

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
    const toolButtons = document.querySelectorAll('.tool-btn');

    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tool = button.dataset.tool;
            editor.setTool(tool);

            // Update active state
            toolButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Show/hide wand options when wand tool is selected
            const wandOptions = document.getElementById('wand-options');
            if (wandOptions) {
                wandOptions.style.display = (tool === 'wand') ? 'flex' : 'none';
            }

            // Show/hide shape options when rectangle tool is selected
            const shapeOptions = document.getElementById('shape-options');
            if (shapeOptions) {
                shapeOptions.style.display = (tool === 'rectangle') ? 'flex' : 'none';
            }
        });
    });

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

    // Load Test Map
    document.getElementById('btn-load-test-map').addEventListener('click', () => {
        if (editor.isDirty && !confirm('Discard unsaved changes and generate test map?')) {
            return;
        }
        generateTestMap();
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
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
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
    });

    document.getElementById('btn-zoom-fit').addEventListener('click', () => {
        editor.fitToView();
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
        editor.undo();
        updateLayersPanel(); // Refresh layer panel to show correct highlighting
    });

    document.getElementById('btn-redo').addEventListener('click', () => {
        editor.redo();
        updateLayersPanel(); // Refresh layer panel to show correct highlighting
    });

    // Update grid size inputs (if they exist)
    const gridWidthInput = document.getElementById('grid-width');
    const gridHeightInput = document.getElementById('grid-height');
    if (gridWidthInput) gridWidthInput.value = editor.layerManager.width;
    if (gridHeightInput) gridHeightInput.value = editor.layerManager.height;
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
            'r': 'rectangle',
            'i': 'eyedropper',
            'e': 'eraser',
            'h': 'pan',
            'm': 'selection',
            'w': 'wand'
        };

        if (toolKeys[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const selectedTool = toolKeys[e.key.toLowerCase()];
            editor.setTool(selectedTool);

            // Update UI
            document.querySelectorAll('.tool-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tool === selectedTool);
            });

            // Show/hide wand options
            const wandOptions = document.getElementById('wand-options');
            if (wandOptions) {
                wandOptions.style.display = (selectedTool === 'wand') ? 'flex' : 'none';
            }

            // Show/hide shape options
            const shapeOptions = document.getElementById('shape-options');
            if (shapeOptions) {
                shapeOptions.style.display = (selectedTool === 'rectangle') ? 'flex' : 'none';
            }

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

        // Escape key - clear selection
        if (e.key === 'Escape') {
            if (editor.currentTool.name === 'selection') {
                e.preventDefault();
                editor.currentTool.clearSelection(editor);
                editor.render();
                document.getElementById('status-message').textContent = 'Selection cleared';
                setTimeout(() => {
                    document.getElementById('status-message').textContent = 'Ready';
                }, 1500);
            }
            return;
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
                    exportLevel();
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
        document.getElementById('status-message').textContent = 'Loading test data...';

        const response = await fetch('e2e-test-data.json');
        if (!response.ok) {
            console.log('[E2E] No test JSON file found, skipping auto-load');
            return;
        }

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
 * Get all projects from cache
 * @returns {Object} Projects object {projectName: {data, timestamp}, ...}
 */
function getAllProjectsFromCache() {
    try {
        const projectsJson = localStorage.getItem('tsic_projects');
        return projectsJson ? JSON.parse(projectsJson) : {};
    } catch (error) {
        console.error('Error loading projects from cache:', error);
        return {};
    }
}

/**
 * Save all projects to cache
 * @param {Object} projects - Projects object
 */
function saveAllProjectsToCache(projects) {
    try {
        localStorage.setItem('tsic_projects', JSON.stringify(projects));
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
 * Save a project to cache
 * @param {string} projectName - Name of the project
 * @param {Object} data - Level data object (RLE format)
 */
function saveProjectToCache(projectName, data) {
    const projects = getAllProjectsFromCache();

    projects[projectName] = {
        data: data,
        timestamp: Date.now()
    };

    saveAllProjectsToCache(projects);
    setActiveProject(projectName);

    console.log(`Saved project "${projectName}" to cache`);
}

/**
 * Load a project from cache
 * @param {string} projectName - Name of the project to load
 * @returns {Object|null} Project data or null if not found
 */
function loadProjectFromCache(projectName) {
    const projects = getAllProjectsFromCache();

    if (projects[projectName]) {
        return projects[projectName].data;
    }

    return null;
}

/**
 * Get list of all project names
 * @returns {Array<string>} Array of project names
 */
function getAllCachedProjectNames() {
    const projects = getAllProjectsFromCache();
    return Object.keys(projects).sort();
}

/**
 * Delete a project from cache
 * @param {string} projectName - Name of project to delete
 */
function deleteProjectFromCache(projectName) {
    const projects = getAllProjectsFromCache();

    if (projects[projectName]) {
        delete projects[projectName];
        saveAllProjectsToCache(projects);

        // If this was the active project, clear active
        if (getActiveProject() === projectName) {
            setActiveProject(null);
        }

        console.log(`Deleted project "${projectName}" from cache`);
        return true;
    }

    return false;
}

/**
 * Rename a project in cache
 * @param {string} oldName - Current project name
 * @param {string} newName - New project name
 * @returns {boolean} Success
 */
function renameProjectInCache(oldName, newName) {
    if (oldName === newName) return true;

    const projects = getAllProjectsFromCache();

    if (!projects[oldName]) {
        console.error(`Project "${oldName}" not found`);
        return false;
    }

    if (projects[newName]) {
        console.error(`Project "${newName}" already exists`);
        return false;
    }

    projects[newName] = projects[oldName];
    delete projects[oldName];

    saveAllProjectsToCache(projects);

    // Update active project if this was it
    if (getActiveProject() === oldName) {
        setActiveProject(newName);
    }

    console.log(`Renamed project "${oldName}" to "${newName}"`);
    return true;
}

/**
 * Migrate old single-file localStorage to new multi-project system
 * This runs once on page load if old data exists
 */
function migrateOldStorageToCache() {
    try {
        const oldData = localStorage.getItem('tsic_currentFile_data');
        const oldFilename = localStorage.getItem('tsic_currentFile_name');

        if (oldData && oldFilename) {
            console.log('Migrating old localStorage format to new multi-project cache...');

            const data = JSON.parse(oldData);
            const projectName = oldFilename.replace(/\.json$/, '');

            // Save to new format
            saveProjectToCache(projectName, data);

            // Remove old keys
            localStorage.removeItem('tsic_currentFile_data');
            localStorage.removeItem('tsic_currentFile_name');
            localStorage.removeItem('tsic_currentFile_timestamp');

            console.log(`Migrated "${projectName}" to new cache system`);
            return projectName;
        }
    } catch (error) {
        console.error('Error during migration:', error);
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
    const input = document.getElementById('project-name-input');
    const projectName = input.value.trim();

    if (!projectName) {
        alert('Please enter a project name');
        return;
    }

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

    // Allow UI to update before blocking with heavy work
    await new Promise(resolve => setTimeout(resolve, 10));

    try {
        // Clear editor
        exitSoloMode();
        editor.clearAll();

        // Reset visibility to show first layer only
        editor.recentLayerSelections = [0];
        editor.layerManager.layers.forEach((layer, idx) => {
            layer.visible = (idx === 0);
            // Clear per-layer undo/redo stacks
            layer.undoStack = [];
            layer.redoStack = [];
        });

        editor.updateUndoRedoButtons();
        editor.isDirty = false;
        updateLayersPanel();
        editor.render();
        editor.renderMinimap();

        // Save to cache immediately
        const rleData = editor.layerManager.exportRLEData(
            projectName,
            'Generated by TSIC Level Editor',
            Date.now()
        );
        saveProjectToCache(projectName, rleData);

        // Update UI
        updateProjectDropdown();
        updateProjectUI();

        document.getElementById('status-message').textContent = `Created: ${projectName}`;
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 2000);
    } finally {
        // Hide spinner
        spinner.style.display = 'none';
    }
}

/**
 * Load a project by name (async to allow spinner to render)
 */
async function loadProjectByName(projectName) {
    const spinner = document.getElementById('project-loading-spinner');

    // Show spinner
    spinner.style.display = 'inline-block';

    // Allow UI to update before blocking with heavy work
    await new Promise(resolve => setTimeout(resolve, 10));

    const projectData = loadProjectFromCache(projectName);

    if (!projectData) {
        spinner.style.display = 'none';
        alert(`Project "${projectName}" not found in cache`);
        return;
    }

    try {
        // Import RLE data
        editor.layerManager.importRLEData(projectData, configManager);

        // Resize canvas to match imported world size
        const worldSize = projectData.metadata.world_size;
        editor.layerManager.resize(worldSize, worldSize);
        editor.resizeCanvas();

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

        editor.render();
        editor.renderMinimap();
        updateLayersPanel();
        updateProjectUI();
        editor.isDirty = false;

        document.getElementById('status-message').textContent = `Loaded: ${projectName}`;
        setTimeout(() => {
            document.getElementById('status-message').textContent = 'Ready';
        }, 2000);
    } catch (error) {
        console.error('Error loading project:', error);
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
    const projectName = getActiveProject();
    if (!projectName) {
        return; // No active project
    }

    try {
        // Generate RLE data
        const rleData = editor.layerManager.exportRLEData(
            projectName,
            'Generated by TSIC Level Editor',
            Date.now()
        );

        // Save to cache
        saveProjectToCache(projectName, rleData);

        // Update status bar briefly
        document.getElementById('status-autosave').textContent = '💾 Auto-saved';
        setTimeout(() => {
            document.getElementById('status-autosave').textContent = '';
        }, 1500);

        editor.isDirty = false;
    } catch (error) {
        console.error('Auto-save error:', error);
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
    Object.defineProperty(editor, 'isDirty', {
        get() {
            return originalIsDirty;
        },
        set(value) {
            originalIsDirty = value;

            // Auto-save when dirty and a project is active (always-on)
            if (value && getActiveProject()) {
                // Debounce auto-save to avoid too many saves
                clearTimeout(editor.autoSaveDebounce);
                editor.autoSaveDebounce = setTimeout(() => {
                    autoSaveCurrentProject();
                }, 1000); // Wait 1 second after last change

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

// Export functions for editor access
if (typeof window !== 'undefined') {
    window.updateLayersPanel = updateLayersPanel;
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
