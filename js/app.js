/**
 * Main Application
 * Initializes the editor and handles UI interactions
 */

let editor = null;
let activeWorldLayer = 'Floor'; // Track active world layer tab (Floor, Underground, Sky)

/**
 * Initialize application
 */
async function init() {
    // Load configuration
    const loaded = await configManager.loadConfig();
    if (!loaded) {
        console.warn('Using default configuration');
    }

    // Create editor
    editor = new LevelEditor();
    editor.initializeLayers(configManager);

    // Initialize UI
    initializeColorPalette();
    initializeLayersPanel();
    initializeToolButtons();
    initializeToolbar();
    initializeKeyboardShortcuts();

    // Select first color by default
    const tilesets = configManager.getTilesets();
    const firstTileset = Object.keys(tilesets)[0];
    if (firstTileset) {
        editor.selectTileset(firstTileset);
    }

    // Start auto-save
    startAutoSave();

    // Load from localStorage if available
    loadAutoSave();

    // Update status
    document.getElementById('status-message').textContent = 'Ready';
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

    // Order categories for better UX
    const categoryOrder = ['Difficulty', 'Height', 'Departments', 'Hazards', 'Objects', 'Other'];

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
}

/**
 * Initialize layers panel
 */
function initializeLayersPanel() {
    updateLayersPanel();

    // World layer tabs
    const worldTabs = document.querySelectorAll('.world-tab');
    worldTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            activeWorldLayer = tab.dataset.world;

            // Update active tab styling
            worldTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update layers panel to show only layers for this world
            updateLayersPanel();
        });
    });

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
 * Update layers panel
 */
function updateLayersPanel() {
    const layersList = document.getElementById('layers-list');
    layersList.innerHTML = '';

    const layers = editor.layerManager.layers;

    // Render layers in reverse order (top to bottom)
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];

        // Filter layers by active world layer tab
        if (layer.worldLayer && layer.worldLayer !== activeWorldLayer) {
            continue; // Skip layers that don't match the active world layer
        }

        const isActive = i === editor.layerManager.activeLayerIndex;

        const layerItem = document.createElement('div');
        layerItem.className = 'layer-item' + (isActive ? ' active' : '');

        // Layer header
        const layerHeader = document.createElement('div');
        layerHeader.className = 'layer-header';

        const layerName = document.createElement('div');
        layerName.className = 'layer-name';
        layerName.textContent = layer.name;

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

        // Lock
        const lockOption = document.createElement('div');
        lockOption.className = 'layer-option';

        const lockCheckbox = document.createElement('input');
        lockCheckbox.type = 'checkbox';
        lockCheckbox.id = `layer-locked-${i}`;
        lockCheckbox.checked = layer.locked;
        lockCheckbox.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent layer selection when clicking checkbox
        });
        lockCheckbox.addEventListener('change', (e) => {
            layer.locked = e.target.checked;
            editor.isDirty = true;
        });

        const lockLabel = document.createElement('label');
        lockLabel.htmlFor = `layer-locked-${i}`;
        lockLabel.textContent = 'Locked';
        lockLabel.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent layer selection when clicking label
        });

        lockOption.appendChild(lockCheckbox);
        lockOption.appendChild(lockLabel);

        layerOptions.appendChild(visibilityOption);
        layerOptions.appendChild(opacityOption);
        layerOptions.appendChild(lockOption);

        // Click to select layer
        layerItem.addEventListener('click', () => {
            editor.layerManager.setActiveLayer(i);
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
                    editor.importLevel(data);
                    editor.render();
                    editor.renderMinimap();
                    document.getElementById('status-message').textContent = `Loaded: ${file.name}`;
                } catch (error) {
                    alert('Error loading file: ' + error.message);
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

    // Update grid size inputs
    document.getElementById('grid-width').value = editor.layerManager.width;
    document.getElementById('grid-height').value = editor.layerManager.height;
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
            'e': 'eraser'
        };

        if (toolKeys[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            editor.setTool(toolKeys[e.key.toLowerCase()]);

            // Update UI
            document.querySelectorAll('.tool-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tool === toolKeys[e.key.toLowerCase()]);
            });
            return;
        }

        // Number keys for brush size (1-7)
        if (e.key >= '1' && e.key <= '7' && !e.ctrlKey && !e.metaKey) {
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

        // H key - toggle grid
        if (e.key.toLowerCase() === 'h') {
            e.preventDefault();
            const gridCheckbox = document.getElementById('show-grid');
            gridCheckbox.checked = !gridCheckbox.checked;
            editor.showGrid = gridCheckbox.checked;
            editor.render();
            return;
        }

        // F key - fit to view
        if (e.key.toLowerCase() === 'f') {
            e.preventDefault();
            editor.fitToView();
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
 * Export level (PNG Export Dialog for TSIC)
 */
function exportLevel() {
    // Show export dialog
    const dialog = document.getElementById('export-dialog');
    dialog.classList.add('show');

    // Initialize exporters and validator
    const pngExporter = new PNGExporter(editor.layerManager);
    const metadataExporter = new MetadataExporter(editor.layerManager, configManager);
    const validator = new ValidationManager(configManager);

    // Update summary and validation when world layer selection changes
    const updateSummary = () => {
        const selectedWorld = document.querySelector('input[name="export-world"]:checked').value;
        const summaryDiv = document.getElementById('export-summary');
        const validationDiv = document.getElementById('export-validation');
        const confirmBtn = document.getElementById('export-confirm');

        // Update summary
        summaryDiv.innerHTML = metadataExporter.getExportSummary(selectedWorld);

        // Update validation
        if (selectedWorld === 'All') {
            const validationResult = validator.validateAllWorldLayers(editor.layerManager);
            let html = '<div class="validation-summary">';

            for (const [worldLayer, worldResult] of Object.entries(validationResult.worldLayers)) {
                html += `<h5>${worldLayer} Layer</h5>`;
                html += validator.getValidationSummaryHTML(worldResult);
            }

            html += '</div>';
            validationDiv.innerHTML = html;

            // Check if export can proceed
            const canExport = validator.canExport(editor.layerManager, 'All');
            confirmBtn.disabled = !canExport.canExport;
        } else {
            const validationResult = validator.validateWorldLayer(editor.layerManager, selectedWorld);
            validationDiv.innerHTML = validator.getValidationSummaryHTML(validationResult);

            // Check if export can proceed
            const canExport = validator.canExport(editor.layerManager, selectedWorld);
            confirmBtn.disabled = !canExport.canExport;
        }
    };

    // Initial summary and validation
    updateSummary();

    // Listen for radio button changes
    document.querySelectorAll('input[name="export-world"]').forEach(radio => {
        radio.addEventListener('change', updateSummary);
    });

    // Cancel button
    const cancelHandler = () => {
        dialog.classList.remove('show');
        document.getElementById('export-cancel').removeEventListener('click', cancelHandler);
        document.getElementById('export-close').removeEventListener('click', cancelHandler);
        document.getElementById('export-confirm').removeEventListener('click', confirmHandler);
    };

    document.getElementById('export-cancel').addEventListener('click', cancelHandler);
    document.getElementById('export-close').addEventListener('click', cancelHandler);

    // Confirm button
    const confirmHandler = async () => {
        const selectedWorld = document.querySelector('input[name="export-world"]:checked').value;
        const includeMetadata = document.getElementById('export-metadata').checked;
        const mapName = document.getElementById('export-map-name').value || 'TSIC_Mall';
        const seed = document.getElementById('export-seed').value;

        document.getElementById('status-message').textContent = 'Exporting...';
        dialog.classList.remove('show');

        try {
            if (selectedWorld === 'All') {
                // Export all world layers
                await pngExporter.downloadAllLayers();

                if (includeMetadata) {
                    const metadata = metadataExporter.generateMetadata({ mapName, seed });
                    metadataExporter.downloadMetadata(metadata);
                }

                document.getElementById('status-message').textContent = 'All layers exported successfully!';
            } else {
                // Export single world layer
                await pngExporter.downloadWorldLayer(selectedWorld);

                if (includeMetadata) {
                    const metadata = metadataExporter.generateMetadata({ mapName, seed });
                    metadataExporter.downloadMetadata(metadata, `${selectedWorld}_map.json`);
                }

                document.getElementById('status-message').textContent = `${selectedWorld} layer exported successfully!`;
            }
        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed: ' + error.message);
            document.getElementById('status-message').textContent = 'Export failed';
        }

        // Cleanup handlers
        document.getElementById('export-cancel').removeEventListener('click', cancelHandler);
        document.getElementById('export-close').removeEventListener('click', cancelHandler);
        document.getElementById('export-confirm').removeEventListener('click', confirmHandler);
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
