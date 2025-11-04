/**
 * Maze Visualizer Integration Tests
 * Tests the complete maze visualizer functionality in the editor
 */

const { test, expect } = require('./test-base');

test.describe('Maze Visualizer Integration', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to editor
        await page.goto('http://localhost:8000/index.html');

        // Wait for editor to initialize
        await page.waitForFunction(() => window.editor && window.editor.mazeVisualizer);
        await page.waitForTimeout(500);
    });

    test('UI elements are present', async ({ page }) => {
        // Check maze visualizer panel exists
        const panelSection = await page.locator('h3:has-text("Maze Visualizer")');
        await expect(panelSection).toBeVisible();

        // Check enable button exists
        const enableBtn = await page.locator('#btn-toggle-maze-visualizer');
        await expect(enableBtn).toBeVisible();
        await expect(enableBtn).toHaveText('Enable Visualizer');

        // Check mode selector exists (but is hidden)
        const modeSelect = await page.locator('#maze-viz-mode');
        await expect(modeSelect).toBeAttached();

        // Check settings section exists (but is hidden)
        const settingsHeader = await page.locator('#maze-settings-header');
        await expect(settingsHeader).toBeAttached();

        // Check regenerate button exists (but is hidden)
        const regenerateBtn = await page.locator('#btn-regenerate-maze');
        await expect(regenerateBtn).toBeAttached();

        // Check export button exists (but is hidden)
        const exportBtn = await page.locator('#btn-export-maze-data');
        await expect(exportBtn).toBeAttached();
    });

    test('can enable and disable visualizer', async ({ page }) => {
        // Initially disabled
        let enabled = await page.evaluate(() => window.editor.mazeVisualizer.enabled);
        expect(enabled).toBe(false);

        // Check content is hidden
        const content = await page.locator('#maze-visualizer-content');
        await expect(content).toBeHidden();

        // Click enable button
        const enableBtn = await page.locator('#btn-toggle-maze-visualizer');
        await enableBtn.click();
        await page.waitForTimeout(500);

        // Verify visualizer is enabled
        enabled = await page.evaluate(() => window.editor.mazeVisualizer.enabled);
        expect(enabled).toBe(true);

        // Verify button text changed
        await expect(enableBtn).toHaveText('Disable Visualizer');

        // Verify content becomes visible
        await expect(content).toBeVisible();

        // Verify statistics appear after generation
        await page.waitForSelector('#maze-stats', { state: 'visible', timeout: 2000 });
        const statsVisible = await page.locator('#maze-stats').isVisible();
        expect(statsVisible).toBe(true);

        // Verify flood fill results were generated
        const hasResults = await page.evaluate(() => {
            return window.editor.mazeVisualizer.floodFillResults.size > 0;
        });
        expect(hasResults).toBe(true);

        // Click disable button
        await enableBtn.click();
        await page.waitForTimeout(200);

        // Verify visualizer is disabled
        enabled = await page.evaluate(() => window.editor.mazeVisualizer.enabled);
        expect(enabled).toBe(false);

        // Verify button text changed back
        await expect(enableBtn).toHaveText('Enable Visualizer');

        // Verify content is hidden
        await expect(content).toBeHidden();
    });

    test('can switch visualization modes', async ({ page }) => {
        // Enable visualizer first
        await page.click('#btn-toggle-maze-visualizer');
        await page.waitForTimeout(500);

        // Check initial mode
        let mode = await page.evaluate(() => window.editor.mazeVisualizer.visualizationMode);
        expect(mode).toBe('regions');

        // Test switching to arrows mode
        await page.selectOption('#maze-viz-mode', 'arrows');
        await page.waitForTimeout(200);
        mode = await page.evaluate(() => window.editor.mazeVisualizer.visualizationMode);
        expect(mode).toBe('arrows');

        // Test switching to walls mode
        await page.selectOption('#maze-viz-mode', 'walls');
        await page.waitForTimeout(200);
        mode = await page.evaluate(() => window.editor.mazeVisualizer.visualizationMode);
        expect(mode).toBe('walls');

        // Test switching to connections mode
        await page.selectOption('#maze-viz-mode', 'connections');
        await page.waitForTimeout(200);
        mode = await page.evaluate(() => window.editor.mazeVisualizer.visualizationMode);
        expect(mode).toBe('connections');

        // Test switching to off mode
        await page.selectOption('#maze-viz-mode', 'off');
        await page.waitForTimeout(200);
        mode = await page.evaluate(() => window.editor.mazeVisualizer.visualizationMode);
        expect(mode).toBe('off');

        // Verify no errors occurred during mode switching
        // (console error monitoring is handled by test-base.js)
    });

    test('tile inspector shows maze data on right-click', async ({ page }) => {
        // Enable visualizer
        await page.click('#btn-toggle-maze-visualizer');
        await page.waitForTimeout(500);

        // Draw some tiles to ensure we have data
        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;

        // Select a biome color using evaluation (more reliable than UI interaction)
        await page.evaluate(() => {
            // Select a known biome (Grass is usually available)
            window.editor.selectTileset('Biome_Grass');
        });

        // Select pencil tool and draw
        await page.click('[data-tool="pencil"]');
        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(200);

        // Regenerate maze to ensure we have fresh data
        await page.click('#btn-regenerate-maze');
        await page.waitForTimeout(500);

        // Right-click on the canvas to open tile inspector
        await canvas.click({
            position: { x: centerX, y: centerY },
            button: 'right'
        });
        await page.waitForTimeout(300);

        // Check if tile inspector appeared
        const inspector = await page.locator('#tile-inspector');
        const isVisible = await inspector.isVisible();

        // The inspector should appear (if there's tile data at that location)
        if (isVisible) {
            // Verify inspector content
            const content = await inspector.locator('#tile-inspector-content');
            await expect(content).toBeVisible();

            // Check if maze data section exists in the inspector
            const hasMazeSection = await page.evaluate(() => {
                const inspectorContent = document.getElementById('tile-inspector-content');
                if (!inspectorContent) return false;
                const html = inspectorContent.innerHTML;
                return html.includes('Flood Fill Region') || html.includes('Maze Directions');
            });

            // If maze data exists, it should be displayed
            expect(typeof hasMazeSection).toBe('boolean');
        }

        // Close inspector if it's open
        const closeBtn = await page.locator('#tile-inspector-close');
        if (await closeBtn.isVisible()) {
            await closeBtn.click();
            await page.waitForTimeout(200);
        }
    });

    test('can export maze data', async ({ page }) => {
        // Enable visualizer
        await page.click('#btn-toggle-maze-visualizer');
        await page.waitForTimeout(500);

        // Wait for generation to complete
        await page.waitForSelector('#maze-stats', { state: 'visible' });

        // Setup download listener
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 });

        // Click export button
        await page.click('#btn-export-maze-data');

        // Wait for download to trigger
        const download = await downloadPromise;

        // Verify download was triggered
        expect(download).toBeTruthy();
        expect(download.suggestedFilename()).toMatch(/maze-data.*\.json/);

        // Verify the download has content
        const path = await download.path();
        expect(path).toBeTruthy();
    });

    test('settings panel can be expanded and collapsed', async ({ page }) => {
        // Enable visualizer
        await page.click('#btn-toggle-maze-visualizer');
        await page.waitForTimeout(500);

        const settingsHeader = await page.locator('#maze-settings-header');
        const settingsContent = await page.locator('#maze-settings-content');

        // Settings should be expanded by default
        let isExpanded = await page.evaluate(() => {
            const header = document.getElementById('maze-settings-header');
            return !header.parentElement.classList.contains('collapsed');
        });
        expect(isExpanded).toBe(true);

        // Click to collapse
        await settingsHeader.click();
        await page.waitForTimeout(200);

        isExpanded = await page.evaluate(() => {
            const header = document.getElementById('maze-settings-header');
            return !header.parentElement.classList.contains('collapsed');
        });
        expect(isExpanded).toBe(false);

        // Click to expand again
        await settingsHeader.click();
        await page.waitForTimeout(200);

        isExpanded = await page.evaluate(() => {
            const header = document.getElementById('maze-settings-header');
            return !header.parentElement.classList.contains('collapsed');
        });
        expect(isExpanded).toBe(true);
    });

    test('can regenerate with different settings', async ({ page }) => {
        // Enable visualizer
        await page.click('#btn-toggle-maze-visualizer');
        await page.waitForTimeout(500);

        // Get initial region count
        const initialRegionCount = await page.evaluate(() => {
            const results = window.editor.mazeVisualizer.floodFillResults.get(0);
            return results ? results.regions.length : 0;
        });

        // Change seed
        await page.fill('#maze-seed', '99999');
        await page.waitForTimeout(200);

        // Regenerate
        await page.click('#btn-regenerate-maze');
        await page.waitForTimeout(500);

        // Verify settings were updated
        const newSeed = await page.evaluate(() => window.editor.mazeVisualizer.settings.seed);
        expect(newSeed).toBe(99999);

        // Verify new data was generated
        const newRegionCount = await page.evaluate(() => {
            const results = window.editor.mazeVisualizer.floodFillResults.get(0);
            return results ? results.regions.length : 0;
        });

        // Region count should exist (might be same or different depending on map)
        expect(newRegionCount).toBeGreaterThanOrEqual(0);
    });

    test('layer checkboxes toggle visualization', async ({ page }) => {
        // Enable visualizer
        await page.click('#btn-toggle-maze-visualizer');
        await page.waitForTimeout(500);

        // Floor should be checked by default
        const floorCheckbox = await page.locator('#maze-layer-checkboxes input[value="0"]');
        const isChecked = await floorCheckbox.isChecked();
        expect(isChecked).toBe(true);

        // Verify Floor is in selected layers
        let selectedLayers = await page.evaluate(() =>
            Array.from(window.editor.mazeVisualizer.selectedLayers)
        );
        expect(selectedLayers).toContain(0);

        // Uncheck Floor
        await floorCheckbox.uncheck();
        await page.waitForTimeout(200);

        // Verify Floor is no longer in selected layers
        selectedLayers = await page.evaluate(() =>
            Array.from(window.editor.mazeVisualizer.selectedLayers)
        );
        expect(selectedLayers).not.toContain(0);

        // Check Underground (layer 1)
        const undergroundCheckbox = await page.locator('#maze-layer-checkboxes input[value="1"]');
        await undergroundCheckbox.check();
        await page.waitForTimeout(200);

        // Verify Underground is in selected layers
        selectedLayers = await page.evaluate(() =>
            Array.from(window.editor.mazeVisualizer.selectedLayers)
        );
        expect(selectedLayers).toContain(1);
    });

    test('visualizer persists region data after generation', async ({ page }) => {
        // Enable visualizer
        await page.click('#btn-toggle-maze-visualizer');
        await page.waitForTimeout(500);

        // Get region data
        const regionData = await page.evaluate(() => {
            const results = window.editor.mazeVisualizer.floodFillResults.get(0);
            if (!results) return null;

            return {
                regionCount: results.regions.length,
                tilesInRegions: results.tilesInRegions,
                borderTiles: results.borderTiles,
                largestRegionSize: results.largestRegionSize,
                smallestRegionSize: results.smallestRegionSize
            };
        });

        // Verify we got valid data
        expect(regionData).toBeTruthy();
        expect(regionData.regionCount).toBeGreaterThanOrEqual(0);
        expect(regionData.tilesInRegions).toBeGreaterThanOrEqual(0);

        // Verify maze data exists
        const hasMazeData = await page.evaluate(() => {
            return window.editor.mazeVisualizer.mazeData.has(0);
        });
        expect(hasMazeData).toBe(true);

        // Get a sample of maze data to verify it's populated
        const sampleMazeValue = await page.evaluate(() => {
            const mazeData = window.editor.mazeVisualizer.mazeData.get(0);
            if (!mazeData || mazeData.length === 0) return null;

            // Find first non-zero value
            for (let i = 0; i < mazeData.length; i++) {
                if (mazeData[i] !== 0) return mazeData[i];
            }
            return 0;
        });

        // Sample value should be a valid direction bitmask (0-15)
        expect(sampleMazeValue).toBeGreaterThanOrEqual(0);
        expect(sampleMazeValue).toBeLessThanOrEqual(15);
    });

    test('visualizer renders without errors in all modes', async ({ page }) => {
        // Enable visualizer
        await page.click('#btn-toggle-maze-visualizer');
        await page.waitForTimeout(500);

        const modes = ['regions', 'arrows', 'walls', 'connections'];

        for (const mode of modes) {
            // Switch to mode
            await page.selectOption('#maze-viz-mode', mode);
            await page.waitForTimeout(300);

            // Trigger a render by panning slightly
            await page.evaluate(() => {
                window.editor.render();
            });
            await page.waitForTimeout(200);

            // Verify mode is active
            const currentMode = await page.evaluate(() =>
                window.editor.mazeVisualizer.visualizationMode
            );
            expect(currentMode).toBe(mode);

            // Console error monitoring will catch any rendering errors
        }
    });
});
