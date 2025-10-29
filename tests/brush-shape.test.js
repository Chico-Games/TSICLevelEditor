/**
 * Brush Shape Tests
 * Tests for square and circle brush shapes
 */

const { test, expect } = require('./test-base');

test.describe('Brush Shape Options', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500);
    });

    test('brush shape selector should be visible', async ({ page }) => {
        const shapeSelect = await page.locator('#brush-shape');
        await expect(shapeSelect).toBeVisible();

        // Check options
        const options = await shapeSelect.locator('option').allTextContents();
        expect(options).toContain('Square');
        expect(options).toContain('Circle');
    });

    test('default brush shape should be square', async ({ page }) => {
        const shape = await page.evaluate(() => window.editor.brushShape);
        expect(shape).toBe('square');

        const shapeSelect = await page.locator('#brush-shape');
        const value = await shapeSelect.inputValue();
        expect(value).toBe('square');
    });

    test('changing brush shape should update editor state', async ({ page }) => {
        const shapeSelect = await page.locator('#brush-shape');

        // Change to circle
        await shapeSelect.selectOption('circle');
        await page.waitForTimeout(50);

        const shape = await page.evaluate(() => window.editor.brushShape);
        expect(shape).toBe('circle');

        // Change back to square
        await shapeSelect.selectOption('square');
        await page.waitForTimeout(50);

        const shape2 = await page.evaluate(() => window.editor.brushShape);
        expect(shape2).toBe('square');
    });

    test('square brush size 5 should paint 25 tiles', async ({ page }) => {
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        // Set to square brush, size 5
        await page.locator('#brush-shape').selectOption('square');
        await page.locator('#brush-size').fill('5');
        await page.waitForTimeout(50);

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
        await page.waitForTimeout(100);

        const tileCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());
        expect(tileCount).toBe(25); // 5x5 square
    });

    test('circle brush size 5 should paint fewer tiles than square', async ({ page }) => {
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;

        // Test square brush
        await page.locator('#brush-shape').selectOption('square');
        await page.locator('#brush-size').fill('5');
        await page.waitForTimeout(50);

        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(50);

        const squareCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());

        // Clear and test circle brush
        await page.keyboard.press('Control+N');
        await page.waitForTimeout(50);

        await page.locator('#brush-shape').selectOption('circle');
        await page.waitForTimeout(50);

        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(50);

        const circleCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());

        // Circle should paint fewer tiles (no corners)
        expect(circleCount).toBeLessThan(squareCount);
        expect(circleCount).toBeGreaterThan(0);
    });

    test('circle brush size 1 should paint 1 tile', async ({ page }) => {
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        await page.locator('#brush-shape').selectOption('circle');
        await page.locator('#brush-size').fill('1');
        await page.waitForTimeout(50);

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
        await page.waitForTimeout(50);

        const tileCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());
        expect(tileCount).toBe(1);
    });

    test('large circle brush (size 10) should paint approximate circle', async ({ page }) => {
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        await page.locator('#brush-shape').selectOption('circle');
        await page.locator('#brush-size').fill('10');
        await page.waitForTimeout(50);

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
        await page.waitForTimeout(100);

        const tileCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());

        // Circle area = π * r^2 ≈ 3.14 * 5^2 ≈ 78.5 tiles
        // Should be less than square (100 tiles) but more than 70
        expect(tileCount).toBeGreaterThan(70);
        expect(tileCount).toBeLessThan(100);
    });

    test('eraser should respect brush shape', async ({ page }) => {
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        // Draw square
        await page.locator('#brush-shape').selectOption('square');
        await page.locator('#brush-size').fill('10');

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;

        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(100);

        const initialCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());
        expect(initialCount).toBe(100); // 10x10

        // Erase with circle
        await page.click('[data-tool="eraser"]');
        await page.locator('#brush-shape').selectOption('circle');
        await page.locator('#brush-size').fill('5');
        await page.waitForTimeout(50);

        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(100);

        const finalCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());

        // Should have erased circle-shaped area (less than 25 tiles)
        expect(finalCount).toBeLessThan(initialCount);
        expect(finalCount).toBeGreaterThan(initialCount - 25);
    });

    test('line tool should respect brush shape', async ({ page }) => {
        await page.click('[data-tool="line"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        await page.locator('#brush-shape').selectOption('circle');
        await page.locator('#brush-size').fill('5');
        await page.waitForTimeout(50);

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        // Draw horizontal line
        await page.mouse.move(box.x + 100, box.y + 100);
        await page.mouse.down();
        await page.mouse.move(box.x + 200, box.y + 100);
        await page.mouse.up();
        await page.waitForTimeout(100);

        const tileCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());

        // Should paint a line of circles
        expect(tileCount).toBeGreaterThan(0);
    });

    test('brush shape should persist when switching tools', async ({ page }) => {
        // Set circle brush
        await page.locator('#brush-shape').selectOption('circle');
        await page.waitForTimeout(50);

        // Switch between tools
        await page.click('[data-tool="pencil"]');
        expect(await page.evaluate(() => window.editor.brushShape)).toBe('circle');

        await page.click('[data-tool="eraser"]');
        expect(await page.evaluate(() => window.editor.brushShape)).toBe('circle');

        await page.click('[data-tool="line"]');
        expect(await page.evaluate(() => window.editor.brushShape)).toBe('circle');
    });

    test('preview should show correct shape', async ({ page }) => {
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        // Move mouse over canvas to trigger preview
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(100);

        // Check that preview is being rendered (we can't easily check the shape visually in tests)
        const hasPreview = await page.evaluate(() => {
            const tool = window.editor.currentTool;
            const preview = tool.getPreview(window.editor, window.editor.gridX, window.editor.gridY);
            return preview.length > 0;
        });

        expect(hasPreview).toBeTruthy();
    });
});
