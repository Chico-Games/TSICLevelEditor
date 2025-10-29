/**
 * Tests for layer-specific color filtering and smart color selection
 */

const { test, expect } = require('@playwright/test');
const { initializeEditor, clickLayer, getSelectedColor, getVisibleColorCategories, selectColor } = require('./test-base');

test.describe('Layer Color Filtering', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('should show only Biomes colors when Floor layer is active', async ({ page }) => {
        // Click on Floor layer
        await clickLayer(page, 'Floor');

        // Wait for filtering to apply
        await page.waitForTimeout(100);

        // Check visible categories
        const visibleCategories = await getVisibleColorCategories(page);

        expect(visibleCategories).toContain('Biomes');
        expect(visibleCategories).not.toContain('Height');
        expect(visibleCategories).not.toContain('Difficulty');
        expect(visibleCategories).not.toContain('Hazards');
    });

    test('should show only Height colors when Height layer is active', async ({ page }) => {
        // Click on Height layer
        await clickLayer(page, 'Height');

        // Wait for filtering to apply
        await page.waitForTimeout(100);

        // Check visible categories
        const visibleCategories = await getVisibleColorCategories(page);

        expect(visibleCategories).toContain('Height');
        expect(visibleCategories).not.toContain('Biomes');
        expect(visibleCategories).not.toContain('Difficulty');
        expect(visibleCategories).not.toContain('Hazards');
    });

    test('should show only Difficulty colors when Difficulty layer is active', async ({ page }) => {
        // Click on Difficulty layer
        await clickLayer(page, 'Difficulty');

        // Wait for filtering to apply
        await page.waitForTimeout(100);

        // Check visible categories
        const visibleCategories = await getVisibleColorCategories(page);

        expect(visibleCategories).toContain('Difficulty');
        expect(visibleCategories).not.toContain('Biomes');
        expect(visibleCategories).not.toContain('Height');
        expect(visibleCategories).not.toContain('Hazards');
    });

    test('should show only Hazards colors when Hazard layer is active', async ({ page }) => {
        // Click on Hazard layer
        await clickLayer(page, 'Hazard');

        // Wait for filtering to apply
        await page.waitForTimeout(100);

        // Check visible categories
        const visibleCategories = await getVisibleColorCategories(page);

        expect(visibleCategories).toContain('Hazards');
        expect(visibleCategories).not.toContain('Biomes');
        expect(visibleCategories).not.toContain('Height');
        expect(visibleCategories).not.toContain('Difficulty');
    });

    test('should switch to valid color when switching from Biome layer to Height layer with biome color selected', async ({ page }) => {
        // Select Floor layer
        await clickLayer(page, 'Floor');
        await page.waitForTimeout(100);

        // Select a biome color
        await selectColor(page, 'Biome_Restaurant');
        await page.waitForTimeout(100);

        // Verify biome color is selected
        let selectedColor = await getSelectedColor(page);
        expect(selectedColor.name).toBe('Biome_Restaurant');

        // Switch to Height layer
        await clickLayer(page, 'Height');
        await page.waitForTimeout(200);

        // Verify that a height color is now selected (not the biome color)
        selectedColor = await getSelectedColor(page);
        expect(selectedColor.category).toBe('Height');
        expect(selectedColor.name).toMatch(/^Height_/);
    });

    test('should switch to valid color when switching from Height layer to Biome layer with height color selected', async ({ page }) => {
        // Select Height layer
        await clickLayer(page, 'Height');
        await page.waitForTimeout(100);

        // Select a height color
        await selectColor(page, 'Height_2');
        await page.waitForTimeout(100);

        // Verify height color is selected
        let selectedColor = await getSelectedColor(page);
        expect(selectedColor.name).toBe('Height_2');

        // Switch to Floor layer
        await clickLayer(page, 'Floor');
        await page.waitForTimeout(200);

        // Verify that a biome color is now selected (not the height color)
        selectedColor = await getSelectedColor(page);
        expect(selectedColor.category).toBe('Biomes');
        expect(selectedColor.name).toMatch(/^Biome_/);
    });

    test('should keep valid color when switching between layers with same category', async ({ page }) => {
        // Select Floor layer (Biomes)
        await clickLayer(page, 'Floor');
        await page.waitForTimeout(100);

        // Select a biome color
        await selectColor(page, 'Biome_Restaurant');
        await page.waitForTimeout(100);

        // Verify biome color is selected
        let selectedColor = await getSelectedColor(page);
        expect(selectedColor.name).toBe('Biome_Restaurant');

        // Switch to Sky layer (also Biomes)
        await clickLayer(page, 'Sky');
        await page.waitForTimeout(200);

        // Verify the same color is still selected
        selectedColor = await getSelectedColor(page);
        expect(selectedColor.name).toBe('Biome_Restaurant');
    });

    test('should expand valid color categories when layer is switched', async ({ page }) => {
        // Select Height layer
        await clickLayer(page, 'Height');
        await page.waitForTimeout(100);

        // Check that Height category is expanded (not collapsed)
        const heightCategoryCollapsed = await page.evaluate(() => {
            const categories = Array.from(document.querySelectorAll('.color-category'));
            const heightCategory = categories.find(cat => {
                const header = cat.querySelector('.color-category-header');
                return header && header.textContent.trim() === 'Height';
            });
            return heightCategory ? heightCategory.classList.contains('collapsed') : null;
        });

        expect(heightCategoryCollapsed).toBe(false);
    });

    test('should filter colors on initial load based on active layer', async ({ page }) => {
        // On initial load, the first layer should be active
        // Wait a bit for initialization
        await page.waitForTimeout(200);

        // Get the active layer name
        const activeLayerName = await page.evaluate(() => {
            const activeLayer = window.editor.layerManager.getActiveLayer();
            return activeLayer ? activeLayer.name : null;
        });

        // Get visible categories
        const visibleCategories = await getVisibleColorCategories(page);

        // Determine expected categories based on active layer
        const expectedCategories = {
            'Height': ['Height'],
            'Difficulty': ['Difficulty'],
            'Hazard': ['Hazards'],
            'Floor': ['Biomes'],
            'Sky': ['Biomes'],
            'Underground': ['Biomes']
        };

        const expected = expectedCategories[activeLayerName] || [];

        // Verify only expected categories are visible
        for (const category of expected) {
            expect(visibleCategories).toContain(category);
        }

        // Verify no unexpected categories are visible
        const allCategories = ['Biomes', 'Height', 'Difficulty', 'Hazards'];
        for (const category of allCategories) {
            if (!expected.includes(category)) {
                expect(visibleCategories).not.toContain(category);
            }
        }
    });

    test('should handle multiple layer switches correctly', async ({ page }) => {
        // Switch through multiple layers
        await clickLayer(page, 'Height');
        await page.waitForTimeout(100);
        let visibleCategories = await getVisibleColorCategories(page);
        expect(visibleCategories).toContain('Height');
        expect(visibleCategories).not.toContain('Biomes');

        await clickLayer(page, 'Difficulty');
        await page.waitForTimeout(100);
        visibleCategories = await getVisibleColorCategories(page);
        expect(visibleCategories).toContain('Difficulty');
        expect(visibleCategories).not.toContain('Height');

        await clickLayer(page, 'Hazard');
        await page.waitForTimeout(100);
        visibleCategories = await getVisibleColorCategories(page);
        expect(visibleCategories).toContain('Hazards');
        expect(visibleCategories).not.toContain('Difficulty');

        await clickLayer(page, 'Floor');
        await page.waitForTimeout(100);
        visibleCategories = await getVisibleColorCategories(page);
        expect(visibleCategories).toContain('Biomes');
        expect(visibleCategories).not.toContain('Hazards');
    });

    test('should switch to first available color in valid category when current color is invalid', async ({ page }) => {
        // Select Difficulty layer
        await clickLayer(page, 'Difficulty');
        await page.waitForTimeout(100);

        // Select a difficulty color
        await selectColor(page, 'Difficulty_Easy');
        await page.waitForTimeout(100);

        // Switch to Height layer
        await clickLayer(page, 'Height');
        await page.waitForTimeout(200);

        // Verify that a height color is now selected
        const selectedColor = await getSelectedColor(page);
        expect(selectedColor.category).toBe('Height');

        // Verify it's the first height color available
        const firstHeightColor = await page.evaluate(() => {
            const tilesets = window.configManager.getTilesets();
            for (const [name, tileset] of Object.entries(tilesets)) {
                if (tileset.category === 'Height') {
                    return name;
                }
            }
            return null;
        });

        expect(selectedColor.name).toBe(firstHeightColor);
    });
});
