/**
 * Layer Management Tests
 * Tests for layer operations and switching
 */

const { test, expect } = require('./test-base');

test.describe('Layer Management', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500);
    });

    test('should have 6 default layers', async ({ page }) => {
        const layerCount = await page.evaluate(() => window.editor.layerManager.layers.length);
        expect(layerCount).toBe(6);

        // Verify layer names
        const layerNames = await page.evaluate(() =>
            window.editor.layerManager.layers.map(layer => layer.name)
        );
        expect(layerNames).toEqual(['Height', 'Difficulty', 'Hazard', 'Sky', 'Floor', 'Underground']);
    });

    test('should switch active layer when clicked', async ({ page }) => {
        // Click on the second layer
        const layers = await page.locator('.layer-item');
        await layers.nth(1).click();
        await page.waitForTimeout(200);

        // Verify active layer changed
        const activeName = await page.evaluate(() => window.editor.layerManager.getActiveLayer().name);
        expect(activeName).toBe('Difficulty');
    });

    test('should draw on different layers', async ({ page }) => {
        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;

        // Draw on first layer (Height)
        await page.click('[data-type="biome"]');
        await page.click('[data-tool="pencil"]');
        const biomeColor = await page.locator('.color-category:has-text("Biomes") .color-item').first();
        await biomeColor.click();
        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(200);

        // Verify data was drawn on layer 0
        const layer0HasData = await page.evaluate(({ clickX, clickY }) => {
            const gridX = Math.floor((clickX - window.editor.offsetX) / (window.editor.tileSize * window.editor.zoom));
            const gridY = Math.floor((clickY - window.editor.offsetY) / (window.editor.tileSize * window.editor.zoom));
            return window.editor.layerManager.layers[0].getData('biome', gridX, gridY) !== null;
        }, { clickX: centerX, clickY: centerY });

        expect(layer0HasData).toBe(true);
    });
});
