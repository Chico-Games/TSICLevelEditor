/**
 * Undo/Redo Tests
 * Tests for undo and redo functionality with color-only system
 */

const { test, expect } = require('./test-base');

test.describe('Undo/Redo Functionality', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');

        // Wait for editor to be fully initialized
        await page.waitForFunction(() => window.editor !== undefined && window.editor !== null, { timeout: 5000 });
        await page.waitForTimeout(500);
    });

    test('should undo and redo drawing with pencil tool', async ({ page }) => {
        // Select pencil tool
        await page.click('[data-tool="pencil"]');
        await page.waitForTimeout(200);

        // Select first biome color
        const biomeColors = await page.locator('.color-category:has(.color-category-header:has-text("Biomes")) .color-item');
        await biomeColors.first().click();
        await page.waitForTimeout(200);

        // Get the grid position where we'll draw
        const gridPos = await page.evaluate(() => {
            const x = 100;
            const y = 100;
            const gridX = Math.floor((x - window.editor.offsetX) / (window.editor.tileSize * window.editor.zoom));
            const gridY = Math.floor((y - window.editor.offsetY) / (window.editor.tileSize * window.editor.zoom));
            return { gridX, gridY };
        });

        // Draw on canvas
        const canvas = await page.locator('#grid-canvas');
        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(300);

        // Check that data was drawn
        const drawnData = await page.evaluate(({ gridX, gridY }) => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.getTile(gridX, gridY) !== null;
        }, gridPos);
        expect(drawnData).toBe(true);

        // Click undo button
        await page.click('#btn-undo');
        await page.waitForTimeout(300);

        // Check that data was removed
        const afterUndo = await page.evaluate(({ gridX, gridY }) => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.getTile(gridX, gridY) !== null;
        }, gridPos);
        expect(afterUndo).toBe(false);

        // Click redo button
        await page.click('#btn-redo');
        await page.waitForTimeout(300);

        // Check that data was restored
        const afterRedo = await page.evaluate(({ gridX, gridY }) => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.getTile(gridX, gridY) !== null;
        }, gridPos);
        expect(afterRedo).toBe(true);
    });

    test('should undo and redo drawing on different layers', async ({ page }) => {
        // Select pencil tool
        await page.click('[data-tool="pencil"]');
        await page.waitForTimeout(200);

        // Select first height color
        const heightColors = await page.locator('.color-category:has(.color-category-header:has-text("Height")) .color-item');
        await heightColors.first().click();
        await page.waitForTimeout(200);

        // Draw on canvas
        const canvas = await page.locator('#grid-canvas');
        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(300);

        // Get initial tile count
        const beforeUndo = await page.evaluate(() => {
            return window.editor.layerManager.getTotalTileCount();
        });
        expect(beforeUndo).toBeGreaterThan(0);

        // Click undo button
        await page.click('#btn-undo');
        await page.waitForTimeout(300);

        // Check that tiles were removed
        const afterUndo = await page.evaluate(() => {
            return window.editor.layerManager.getTotalTileCount();
        });
        expect(afterUndo).toBe(0);

        // Click redo button
        await page.click('#btn-redo');
        await page.waitForTimeout(300);

        // Check that tiles were restored
        const afterRedo = await page.evaluate(() => {
            return window.editor.layerManager.getTotalTileCount();
        });
        expect(afterRedo).toBe(beforeUndo);
    });

    test('should work with bucket fill tool', async ({ page }) => {
        // Select bucket tool
        await page.click('[data-tool="bucket"]');
        await page.waitForTimeout(200);

        // Select a biome color
        const biomeColors = await page.locator('.color-category:has(.color-category-header:has-text("Biomes")) .color-item');
        await biomeColors.first().click();
        await page.waitForTimeout(200);

        // Use bucket fill
        const canvas = await page.locator('#grid-canvas');
        await canvas.click({ position: { x: 150, y: 150 } });
        await page.waitForTimeout(500);

        // Check that tiles were filled
        const tileCount = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.tileData.size;
        });
        expect(tileCount).toBeGreaterThan(0);

        // Undo
        await page.click('#btn-undo');
        await page.waitForTimeout(300);

        // Check that tiles were cleared
        const afterUndo = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.tileData.size;
        });
        expect(afterUndo).toBe(0);

        // Redo
        await page.click('#btn-redo');
        await page.waitForTimeout(300);

        // Check that tiles were restored
        const afterRedo = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.tileData.size;
        });
        expect(afterRedo).toBe(tileCount);
    });

    test('should work with eraser tool', async ({ page }) => {
        // First draw something
        await page.click('[data-tool="pencil"]');
        const biomeColors = await page.locator('.color-category:has(.color-category-header:has-text("Biomes")) .color-item');
        await biomeColors.first().click();

        const canvas = await page.locator('#grid-canvas');
        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(300);

        // Get grid position
        const gridPos = await page.evaluate(() => {
            const x = 100;
            const y = 100;
            const gridX = Math.floor((x - window.editor.offsetX) / (window.editor.tileSize * window.editor.zoom));
            const gridY = Math.floor((y - window.editor.offsetY) / (window.editor.tileSize * window.editor.zoom));
            return { gridX, gridY };
        });

        // Now erase it
        await page.click('[data-tool="eraser"]');
        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(300);

        // Check that data was erased
        const afterErase = await page.evaluate(({ gridX, gridY }) => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.getTile(gridX, gridY) !== null;
        }, gridPos);
        expect(afterErase).toBe(false);

        // Undo the erase
        await page.click('#btn-undo');
        await page.waitForTimeout(300);

        // Check that data was restored
        const afterUndo = await page.evaluate(({ gridX, gridY }) => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.getTile(gridX, gridY) !== null;
        }, gridPos);
        expect(afterUndo).toBe(true);

        // Redo the erase
        await page.click('#btn-redo');
        await page.waitForTimeout(300);

        // Check that data was erased again
        const afterRedo = await page.evaluate(({ gridX, gridY }) => {
            const layer = window.editor.layerManager.getActiveLayer();
            return layer.getTile(gridX, gridY) !== null;
        }, gridPos);
        expect(afterRedo).toBe(false);
    });

    test('should preserve color when undoing and redoing', async ({ page }) => {
        const canvas = await page.locator('#grid-canvas');

        // Draw with first color
        await page.click('[data-tool="pencil"]');
        const biomeColors = await page.locator('.color-category:has(.color-category-header:has-text("Biomes")) .color-item');
        await biomeColors.first().click();
        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(300);

        // Get the color
        const drawnColor = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            const key = `${Math.floor((100 - window.editor.offsetX) / (window.editor.tileSize * window.editor.zoom))},${Math.floor((100 - window.editor.offsetY) / (window.editor.tileSize * window.editor.zoom))}`;
            return layer.tileData.get(key);
        });

        // Undo
        await page.click('#btn-undo');
        await page.waitForTimeout(300);

        // Redo
        await page.click('#btn-redo');
        await page.waitForTimeout(300);

        // Check color is the same
        const restoredColor = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            const key = `${Math.floor((100 - window.editor.offsetX) / (window.editor.tileSize * window.editor.zoom))},${Math.floor((100 - window.editor.offsetY) / (window.editor.tileSize * window.editor.zoom))}`;
            return layer.tileData.get(key);
        });

        expect(restoredColor).toBe(drawnColor);
    });
});
