/**
 * Main Application
 * Initializes the editor and handles UI interactions
 */

let editor = null;
let dynamicValidator = null;

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
    editor.initializeLayers(configManager);

    // Initialize UI
    initializeDataTypeSelector();
    initializeColorPalette();
    initializeLayersPanel();
    initializeToolButtons();
    initializeToolbar();
    initializeKeyboardShortcuts();
    initializeAutoSaveCheckbox();

    // Select first color by default
    const tilesets = configManager.getTilesets();
    const firstTileset = Object.keys(tilesets)[0];
    if (firstTileset) {
        editor.selectTileset(firstTileset);
    }

    // Start auto-save
    startAutoSave();

    // Auto-load test JSON if it exists (for e2e testing) - do this before loadAutoSave
    await loadTestJSON();

    // Load from localStorage if available (only if no test JSON was loaded)
    if (!editor.currentFileName) {
        loadAutoSave();
    }

    // Update status
    if (!editor.currentFileName) {
        document.getElementById('status-message').textContent = 'Ready';
    }
}

/**
 * Initialize data type selector
 */
function initializeDataTypeSelector() {
    const dataTypeButtons = document.querySelectorAll('.data-type-btn');

    dataTypeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const dataType = button.dataset.type;

            // Update layer manager's active data type
            if (editor.layerManager.setActiveDataType(dataType)) {
                // Update active state on buttons
                dataTypeButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Filter color palette by data type
                filterColorPalette(dataType);

                // Re-render to show the new data type
                editor.render();
                editor.renderMinimap();

                // Update status
                const typeNames = {
                    'biome': 'Biome',
                    'height': 'Height',
                    'difficulty': 'Difficulty',
                    'hazard': 'Hazard'
                };
                document.getElementById('status-message').textContent = `Editing: ${typeNames[dataType]}`;
                setTimeout(() => {
                    document.getElementById('status-message').textContent = 'Ready';
                }, 1500);
            }
        });
    });
}

/**
 * Filter color palette by data type
 */
function filterColorPalette(dataType) {
    // Map data types to categories
    const categoryMapping = {
        'biome': ['Biomes'],
        'height': ['Height'],
        'difficulty': ['Difficulty'],
        'hazard': ['Hazards']
    };

    const allowedCategories = categoryMapping[dataType] || [];

    // Show/hide categories based on data type
    document.querySelectorAll('.color-category').forEach(categoryDiv => {
        const categoryName = categoryDiv.querySelector('.color-category-header').textContent;

        if (allowedCategories.includes(categoryName)) {
            categoryDiv.style.display = 'block';
            // Auto-expand when filtered
            categoryDiv.classList.remove('collapsed');
        } else {
            categoryDiv.style.display = 'none';
        }
    });

    // Auto-select first visible tileset if current selection is hidden
    if (editor.selectedTileset) {
        const currentCategory = configManager.getTileset(editor.selectedTileset.name)?.category;
        if (!allowedCategories.includes(currentCategory)) {
            // Select first tileset in the filtered category
            const firstVisibleItem = document.querySelector('.color-category:not([style*="display: none"]) .color-item');
            if (firstVisibleItem) {
                firstVisibleItem.click();
            }
        }
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

            const label = document.createElement('div');
            label.className = 'color-name';
            label.textContent = name;

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

    // Apply initial filter based on default data type (biome)
    filterColorPalette(editor.layerManager.activeDataType);
}

/**
 * Initialize layers panel
 */
function initializeLayersPanel() {
    updateLayersPanel();

    // Add layer button
    document.getElementById('btn-add-layer').addEventListener('click', () => {
        const layerCount = editor.layerManager.layers.length;
        editor.saveState();
        editor.layerManager.addLayer(`Layer ${layerCount + 1}`);
        updateLayersPanel();
        editor.render();
        editor.isDirty = true;
    });
}

/**
 * Check if layer has wrong data types
 */
function checkLayerDataTypes(layer) {
    const warnings = [];

    // Define expected data types for each layer type
    const expectedDataTypes = {
        'height': ['height'],
        'difficulty': ['difficulty'],
        'hazard': ['hazard'],
        'showfloor': ['biome'],
        'sky': ['biome'],
        'underground': ['biome'],
        'floor': ['biome']
    };

    const layerType = (layer.layerType || '').toLowerCase();
    const expected = expectedDataTypes[layerType] || [];

    if (expected.length === 0) return warnings; // Unknown layer type, no check

    // Check all data types
    const dataTypes = ['biome', 'height', 'difficulty', 'hazard'];
    for (const dataType of dataTypes) {
        const dataMap = layer.getDataMap(dataType);
        if (dataMap && dataMap.size > 0 && !expected.includes(dataType)) {
            warnings.push(`Layer "${layer.name}" contains ${dataType} data but should only contain ${expected.join(', ')}`);
        }
    }

    return warnings;
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

        const layerItem = document.createElement('div');
        layerItem.className = 'layer-item' + (isActive ? ' active' : '');

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
            warningIcon.title = warnings.join('\n');
            warningIcon.style.color = '#ffa500';
            warningIcon.style.cursor = 'help';
            layerName.appendChild(warningIcon);
        }

        const layerControls = document.createElement('div');
        layerControls.className = 'layer-controls';

        // Delete button (only if more than one layer)
        if (layers.length > 1) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '×';
            deleteBtn.title = 'Delete Layer';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Delete layer "${layer.name}"?`)) {
                    editor.saveState();
                    editor.layerManager.removeLayer(i);
                    updateLayersPanel();
                    editor.render();
                    editor.renderMinimap();
                    editor.isDirty = true;
                }
            });
            layerControls.appendChild(deleteBtn);
        }

        layerHeader.appendChild(layerName);
        layerHeader.appendChild(layerControls);

        // Layer options
        const layerOptions = document.createElement('div');
        layerOptions.className = 'layer-options';

        // Visibility
        const visibilityOption = document.createElement('div');
        visibilityOption.className = 'layer-option';

        const visibilityCheckbox = document.createElement('input');
        visibilityCheckbox.type = 'checkbox';
        visibilityCheckbox.id = `layer-visible-${i}`;
        visibilityCheckbox.checked = layer.visible;
        visibilityCheckbox.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent layer selection when clicking checkbox
        });
        visibilityCheckbox.addEventListener('change', (e) => {
            layer.visible = e.target.checked;
            editor.render();
            editor.renderMinimap();
            editor.isDirty = true;
        });

        const visibilityLabel = document.createElement('label');
        visibilityLabel.htmlFor = `layer-visible-${i}`;
        visibilityLabel.textContent = 'Visible';
        visibilityLabel.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent layer selection when clicking label
        });

        visibilityOption.appendChild(visibilityCheckbox);
        visibilityOption.appendChild(visibilityLabel);

        // Show Only button
        const showOnlyOption = document.createElement('div');
        showOnlyOption.className = 'layer-option';

        const showOnlyBtn = document.createElement('button');
        showOnlyBtn.textContent = 'Show Only';
        showOnlyBtn.className = 'btn-show-only';
        showOnlyBtn.title = 'Hide all other layers';
        showOnlyBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent layer selection when clicking button
            // Hide all layers except this one
            layers.forEach((l, index) => {
                l.visible = (index === i);
            });
            editor.render();
            editor.renderMinimap();
            updateLayersPanel();
            editor.isDirty = true;
        });

        showOnlyOption.appendChild(showOnlyBtn);

        // Opacity
        const opacityOption = document.createElement('div');
        opacityOption.className = 'layer-option';

        const opacityLabel = document.createElement('label');
        opacityLabel.textContent = `Opacity: ${Math.round(layer.opacity * 100)}%`;

        const opacitySlider = document.createElement('input');
        opacitySlider.type = 'range';
        opacitySlider.min = '0';
        opacitySlider.max = '100';
        opacitySlider.value = layer.opacity * 100;
        opacitySlider.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent layer selection when clicking slider
        });
        opacitySlider.addEventListener('input', (e) => {
            layer.opacity = e.target.value / 100;
            opacityLabel.textContent = `Opacity: ${e.target.value}%`;
            editor.render();
            editor.renderMinimap();
            editor.isDirty = true;
        });

        opacityOption.appendChild(opacityLabel);
        opacityOption.appendChild(opacitySlider);

        layerOptions.appendChild(visibilityOption);
        layerOptions.appendChild(showOnlyOption);
        layerOptions.appendChild(opacityOption);

        // Click to select layer
        layerItem.addEventListener('click', () => {
            editor.layerManager.setActiveLayer(i);

            // Auto-switch data type based on layer name
            const layerName = layer.name.toLowerCase();
            let dataType = 'biome'; // default

            if (layerName.includes('height')) {
                dataType = 'height';
            } else if (layerName.includes('difficulty')) {
                dataType = 'difficulty';
            } else if (layerName.includes('hazard')) {
                dataType = 'hazard';
            }
            // Otherwise use biome for Floor, Sky, Underground, Showroom, Terrain, etc.

            // Switch to the appropriate data type
            if (editor.layerManager.setActiveDataType(dataType)) {
                // Update data type button visual state
                document.querySelectorAll('.data-type-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.type === dataType);
                });

                // Filter palette
                filterColorPalette(dataType);

                // Auto-select first visible color in the palette
                const firstVisibleColor = document.querySelector('.color-item:not([style*="display: none"])');
                if (firstVisibleColor) {
                    firstVisibleColor.click();
                }

                // Re-render to show the new data type
                editor.render();
                editor.renderMinimap();
            }

            updateLayersPanel();
        });

        layerItem.appendChild(layerHeader);
        layerItem.appendChild(layerOptions);
        layersList.appendChild(layerItem);
    }
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

    // Brush size
    document.getElementById('brush-size').addEventListener('change', (e) => {
        editor.brushSize = parseInt(e.target.value);
    });

    // Fill mode
    document.getElementById('fill-mode').addEventListener('change', (e) => {
        editor.fillMode = e.target.value;
    });
}

/**
 * Initialize toolbar
 */
function initializeToolbar() {
    // New
    document.getElementById('btn-new').addEventListener('click', () => {
        if (editor.isDirty && !confirm('Discard unsaved changes?')) {
            return;
        }

        editor.clearAll();
        editor.undoStack = [];
        editor.redoStack = [];
        editor.updateUndoRedoButtons();
        editor.isDirty = false;
        document.getElementById('status-message').textContent = 'New level created';
    });

    // Load
    document.getElementById('btn-load').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);

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

                        // Set current filename
                        editor.currentFileName = file.name;
                        updateFileNameDisplay();

                        document.getElementById('status-message').textContent = `Loaded JSON-RLE: ${data.metadata.name} (${worldSize}×${worldSize})`;
                    } else {
                        // Legacy format import
                        editor.importLevel(data);

                        // Set current filename
                        editor.currentFileName = file.name;
                        updateFileNameDisplay();

                        document.getElementById('status-message').textContent = `Loaded: ${file.name}`;
                    }

                    editor.render();
                    editor.renderMinimap();
                    updateLayersPanel();
                    editor.isDirty = false;

                } catch (error) {
                    console.error('Import error:', error);
                    alert('Error loading file: ' + error.message);
                    document.getElementById('status-message').textContent = 'Import failed';
                }
            };
            reader.readAsText(file);
        }
        e.target.value = '';
    });

    // Save
    document.getElementById('btn-save').addEventListener('click', () => {
        saveLevel();
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

    // Undo/Redo
    document.getElementById('btn-undo').addEventListener('click', () => {
        editor.undo();
    });

    document.getElementById('btn-redo').addEventListener('click', () => {
        editor.redo();
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

        // Number keys 1-4 for data type selection (when Alt is pressed)
        if (e.altKey && e.key >= '1' && e.key <= '4') {
            e.preventDefault();
            const dataTypes = ['biome', 'height', 'difficulty', 'hazard'];
            const dataType = dataTypes[parseInt(e.key) - 1];
            const typeNames = {
                'biome': 'Biome',
                'height': 'Height',
                'difficulty': 'Difficulty',
                'hazard': 'Hazard'
            };

            if (editor.layerManager.setActiveDataType(dataType)) {
                // Update data type button visual state
                document.querySelectorAll('.data-type-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.type === dataType);
                });

                // Filter palette
                filterColorPalette(dataType);

                // Re-render
                editor.render();
                editor.renderMinimap();

                document.getElementById('status-message').textContent = `Data Type: ${typeNames[dataType]} (Alt+${e.key})`;
                setTimeout(() => {
                    document.getElementById('status-message').textContent = 'Ready';
                }, 1500);
            }
            return;
        }

        // Number keys 1-7 for brush size (when no modifiers)
        if (e.key >= '1' && e.key <= '7' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const brushSizes = ['1', '2', '3', '5', '7'];
            const sizeIndex = parseInt(e.key) - 1;
            if (sizeIndex < brushSizes.length) {
                editor.brushSize = parseInt(brushSizes[sizeIndex]);
                document.getElementById('brush-size').value = brushSizes[sizeIndex];
                document.getElementById('status-message').textContent = `Brush size: ${brushSizes[sizeIndex]}×${brushSizes[sizeIndex]}`;
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

        // [ and ] for changing opacity of active layer
        if (e.key === '[' || e.code === 'BracketLeft') {
            e.preventDefault();
            const layer = editor.layerManager.getActiveLayer();
            if (layer) {
                layer.opacity = Math.max(0, layer.opacity - 0.1);
                editor.render();
                editor.renderMinimap();
                updateLayersPanel();
            }
            return;
        }

        if (e.key === ']' || e.code === 'BracketRight') {
            e.preventDefault();
            const layer = editor.layerManager.getActiveLayer();
            if (layer) {
                layer.opacity = Math.min(1, layer.opacity + 0.1);
                editor.render();
                editor.renderMinimap();
                updateLayersPanel();
            }
            return;
        }

        // Ctrl/Cmd shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) {
                        editor.redo();
                    } else {
                        editor.undo();
                    }
                    break;

                case 'y':
                    e.preventDefault();
                    editor.redo();
                    break;

                case 's':
                    e.preventDefault();
                    saveLevel();
                    break;

                case 'n':
                    e.preventDefault();
                    if (!editor.isDirty || confirm('Discard unsaved changes?')) {
                        editor.clearAll();
                        editor.isDirty = false;
                    }
                    break;

                case 'e':
                    e.preventDefault();
                    exportLevel();
                    break;

                case 'o':
                    e.preventDefault();
                    document.getElementById('btn-load').click();
                    break;

                case 'c':
                    // Copy selection
                    if (editor.currentTool.name === 'selection') {
                        e.preventDefault();
                        editor.currentTool.copySelection(editor);
                        document.getElementById('status-message').textContent = 'Selection copied';
                        setTimeout(() => {
                            document.getElementById('status-message').textContent = 'Ready';
                        }, 1500);
                    }
                    break;

                case 'v':
                    // Paste selection
                    if (editor.currentTool.name === 'selection' && editor.currentTool.selectionData) {
                        e.preventDefault();
                        editor.currentTool.pasteSelection(editor);
                        document.getElementById('status-message').textContent = 'Selection pasted';
                        setTimeout(() => {
                            document.getElementById('status-message').textContent = 'Ready';
                        }, 1500);
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

    // Handle space key release for pan mode
    document.addEventListener('keyup', (e) => {
        if (e.key === ' ') {
            editor.spacePressed = false;
            document.getElementById('canvas-container').style.cursor = 'crosshair';
        }
    });
}

/**
 * Save level to file
 */
function saveLevel() {
    const data = editor.exportLevel();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `level_${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);

    editor.isDirty = false;
    document.getElementById('status-message').textContent = 'Level saved';
}

/**
 * Export level (JSON-RLE Export)
 */
function exportLevel() {
    // Show export dialog
    const dialog = document.getElementById('export-dialog');
    dialog.classList.add('show');

    // Update validation and stats when inputs change
    const updateValidationAndStats = () => {
        const mapName = document.getElementById('export-map-name').value || 'TSIC_Mall';
        const description = document.getElementById('export-description').value || 'Mall level';
        const seedInput = document.getElementById('export-seed').value;
        const seed = seedInput ? parseInt(seedInput) : Math.floor(Math.random() * 2147483647);

        const validationDiv = document.getElementById('export-validation');
        const statsDiv = document.getElementById('export-stats');
        const confirmBtn = document.getElementById('export-confirm');

        try {
            // Generate RLE data
            const rleData = editor.layerManager.exportRLEData(mapName, description, seed);

            // Validate using dynamic validator (falls back to rleValidator if not loaded)
            const validator = dynamicValidator || rleValidator;
            const validationResult = validator.validate(rleData);

            // Show validation results with helpful messages
            if (validationResult.valid) {
                validationDiv.innerHTML = `<p class="success">✅ Validation PASSED</p>`;
                if (validationResult.warnings && validationResult.warnings.length > 0) {
                    validationDiv.innerHTML += `<p class="warning">Warnings:</p><ul>`;
                    validationResult.warnings.forEach(warning => {
                        const isTip = warning.startsWith('💡');
                        const className = isTip ? 'tip' : 'warning';
                        validationDiv.innerHTML += `<li class="${className}">${warning}</li>`;
                    });
                    validationDiv.innerHTML += `</ul>`;
                }
                confirmBtn.disabled = false;
            } else {
                validationDiv.innerHTML = `<p class="error">❌ Validation FAILED</p><ul>`;
                validationResult.errors.forEach(error => {
                    // Highlight tips in a different color
                    const isTip = error.startsWith('💡');
                    const className = isTip ? 'tip' : 'error';
                    validationDiv.innerHTML += `<li class="${className}">${error}</li>`;
                });
                validationDiv.innerHTML += `</ul>`;
                confirmBtn.disabled = true;
            }

            // Show compression statistics
            const stats = validator.getCompressionStats(rleData);
            if (stats) {
                const compressionPercent = parseFloat(stats.compressionRatio);
                const efficiencyClass = stats.efficiency.toLowerCase();

                statsDiv.innerHTML = `
                    <p><strong>World Size:</strong> ${stats.worldSize}×${stats.worldSize}</p>
                    <p><strong>Layers:</strong> ${stats.layerCount}</p>
                    <p><strong>Total Tiles:</strong> ${stats.totalTiles.toLocaleString()}</p>
                    <p><strong>RLE Entries:</strong> ${stats.totalRLEEntries.toLocaleString()}</p>
                    <p><strong>Compression Ratio:</strong> ${stats.compressionRatio}</p>
                    <div class="compression-bar-container">
                        <div class="compression-bar ${efficiencyClass}" style="width: ${compressionPercent}%">
                            ${stats.efficiency}
                        </div>
                    </div>
                    <p style="font-size: 11px; color: #888; margin-top: 5px;">
                        ${compressionPercent < 25 ? '🎉 Excellent compression!' :
                          compressionPercent < 50 ? '✅ Good compression' :
                          compressionPercent < 75 ? '⚠️ Fair compression' :
                          '❌ Poor compression (high variation)'}
                    </p>
                `;
            }

        } catch (error) {
            validationDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            statsDiv.innerHTML = '';
            confirmBtn.disabled = true;
        }
    };

    // Initial validation
    updateValidationAndStats();

    // Listen for input changes
    document.getElementById('export-map-name').addEventListener('input', updateValidationAndStats);
    document.getElementById('export-description').addEventListener('input', updateValidationAndStats);
    document.getElementById('export-seed').addEventListener('input', updateValidationAndStats);

    // Cancel button
    const cancelHandler = () => {
        dialog.classList.remove('show');
        document.getElementById('export-cancel').removeEventListener('click', cancelHandler);
        document.getElementById('export-close').removeEventListener('click', cancelHandler);
        document.getElementById('export-confirm').removeEventListener('click', confirmHandler);
        document.getElementById('export-map-name').removeEventListener('input', updateValidationAndStats);
        document.getElementById('export-description').removeEventListener('input', updateValidationAndStats);
        document.getElementById('export-seed').removeEventListener('input', updateValidationAndStats);
    };

    document.getElementById('export-cancel').addEventListener('click', cancelHandler);
    document.getElementById('export-close').addEventListener('click', cancelHandler);

    // Confirm button
    const confirmHandler = () => {
        const mapName = document.getElementById('export-map-name').value || 'TSIC_Mall';
        const description = document.getElementById('export-description').value || 'Mall level';
        const seedInput = document.getElementById('export-seed').value;
        const seed = seedInput ? parseInt(seedInput) : Math.floor(Math.random() * 2147483647);

        document.getElementById('status-message').textContent = 'Exporting...';
        dialog.classList.remove('show');

        try {
            // Generate RLE data
            const rleData = editor.layerManager.exportRLEData(mapName, description, seed);

            // Validate one more time using dynamic validator
            const validator = dynamicValidator || rleValidator;
            const validationResult = validator.validate(rleData);
            if (!validationResult.valid) {
                alert('Export failed: ' + validationResult.errors.slice(0, 10).join('\n'));
                document.getElementById('status-message').textContent = 'Export failed';
                return;
            }

            // Download JSON file
            const json = JSON.stringify(rleData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${mapName}_${rleData.metadata.world_size}.json`;
            a.click();

            URL.revokeObjectURL(url);

            document.getElementById('status-message').textContent = 'JSON-RLE exported successfully!';
            editor.isDirty = false;

        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed: ' + error.message);
            document.getElementById('status-message').textContent = 'Export failed';
        }

        // Cleanup handlers
        document.getElementById('export-cancel').removeEventListener('click', cancelHandler);
        document.getElementById('export-close').removeEventListener('click', cancelHandler);
        document.getElementById('export-confirm').removeEventListener('click', confirmHandler);
        document.getElementById('export-map-name').removeEventListener('input', updateValidationAndStats);
        document.getElementById('export-description').removeEventListener('input', updateValidationAndStats);
        document.getElementById('export-seed').removeEventListener('input', updateValidationAndStats);
    };

    document.getElementById('export-confirm').addEventListener('click', confirmHandler);
}

/**
 * Start auto-save
 */
function startAutoSave() {
    editor.autoSaveInterval = setInterval(() => {
        if (editor.isDirty) {
            const data = editor.exportLevel();
            localStorage.setItem('levelEditor_autoSave', JSON.stringify(data));
            localStorage.setItem('levelEditor_autoSave_time', Date.now().toString());

            document.getElementById('status-autosave').textContent = 'Auto-saved';
            setTimeout(() => {
                document.getElementById('status-autosave').textContent = '';
            }, 2000);
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

/**
 * Update filename display
 */
function updateFileNameDisplay() {
    const fileNameSpan = document.getElementById('status-filename');
    if (editor.currentFileName) {
        fileNameSpan.textContent = `File: ${editor.currentFileName}`;
        fileNameSpan.style.color = '#00ff00';
    } else {
        fileNameSpan.textContent = 'No file loaded';
        fileNameSpan.style.color = '#888';
    }
}

/**
 * Auto-save to JSON file (when checkbox is enabled)
 */
function autoSaveToJSON() {
    if (!editor.currentFileName) {
        console.warn('No filename set for auto-save');
        return;
    }

    try {
        // Get the map name from filename (remove extension and size suffix)
        const baseFileName = editor.currentFileName.replace(/\.json$/, '').replace(/_\d+$/, '');

        // Generate RLE data
        const rleData = editor.layerManager.exportRLEData(baseFileName, 'Auto-saved level', Date.now());

        // Download JSON file
        const json = JSON.stringify(rleData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = editor.currentFileName;
        a.click();

        URL.revokeObjectURL(url);

        document.getElementById('status-autosave').textContent = '💾 Saved';
        setTimeout(() => {
            document.getElementById('status-autosave').textContent = '';
        }, 2000);

        editor.isDirty = false;
    } catch (error) {
        console.error('Auto-save error:', error);
        document.getElementById('status-autosave').textContent = '❌ Save failed';
        setTimeout(() => {
            document.getElementById('status-autosave').textContent = '';
        }, 3000);
    }
}

/**
 * Initialize autosave checkbox handler
 */
function initializeAutoSaveCheckbox() {
    const checkbox = document.getElementById('autosave-checkbox');

    checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            if (!editor.currentFileName) {
                alert('No file loaded. Please load a file first to enable auto-save.');
                e.target.checked = false;
                return;
            }
            document.getElementById('status-message').textContent = 'Auto-save to JSON enabled';
            setTimeout(() => {
                document.getElementById('status-message').textContent = 'Ready';
            }, 2000);
        }
    });

    // Hook into editor's isDirty setter to trigger auto-save
    let originalIsDirty = false;
    Object.defineProperty(editor, 'isDirty', {
        get() {
            return originalIsDirty;
        },
        set(value) {
            originalIsDirty = value;

            // Auto-save when dirty and checkbox is checked
            if (value && checkbox.checked && editor.currentFileName) {
                // Debounce auto-save to avoid too many saves
                clearTimeout(editor.autoSaveDebounce);
                editor.autoSaveDebounce = setTimeout(() => {
                    autoSaveToJSON();
                }, 1000); // Wait 1 second after last change
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

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
