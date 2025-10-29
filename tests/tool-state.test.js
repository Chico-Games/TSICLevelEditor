/**
 * Tool State Persistence Tests
 * Tests for tool state preservation and keyboard shortcuts
 */

const { test, expect } = require('./test-base');

test.describe('Tool State Persistence', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500);
    });

    test('should persist brush size when switching tools', async ({ page }) => {
        // Change brush size to 3
        await page.selectOption('#brush-size', '3');
        await page.waitForTimeout(200);

        // Verify brush size is 3
        let brushSize = await page.evaluate(() => window.editor.brushSize);
        expect(brushSize).toBe(3);

        // Switch to eraser
        await page.click('[data-tool="eraser"]');
        await page.waitForTimeout(200);

        // Switch back to pencil
        await page.click('[data-tool="pencil"]');
        await page.waitForTimeout(200);

        // Verify brush size is still 3
        brushSize = await page.evaluate(() => window.editor.brushSize);
        expect(brushSize).toBe(3);
    });

    test('should persist fill mode when switching between shape tools', async ({ page }) => {
        // Switch to rectangle tool (which has fill mode)
        await page.click('[data-tool="rectangle"]');
        await page.waitForTimeout(200);

        // Set fill mode to outline
        await page.selectOption('#fill-mode', 'outline');
        await page.waitForTimeout(200);

        // Verify fill mode is outline
        let fillMode = await page.evaluate(() => window.editor.fillMode);
        expect(fillMode).toBe('outline');

        // Switch to pencil tool
        await page.click('[data-tool="pencil"]');
        await page.waitForTimeout(200);

        // Switch back to rectangle
        await page.click('[data-tool="rectangle"]');
        await page.waitForTimeout(200);

        // Verify fill mode is still outline
        fillMode = await page.evaluate(() => window.editor.fillMode);
        expect(fillMode).toBe('outline');
    });

    test('should preserve diagonal option for wand tool', async ({ page }) => {
        // Switch to wand tool
        await page.click('[data-tool="wand"]');
        await page.waitForTimeout(200);

        // Enable diagonal
        await page.check('#wand-diagonal');
        await page.waitForTimeout(200);

        // Verify diagonal is enabled
        let diagonal = await page.locator('#wand-diagonal').isChecked();
        expect(diagonal).toBe(true);

        // Switch to pencil
        await page.click('[data-tool="pencil"]');
        await page.waitForTimeout(200);

        // Switch back to wand
        await page.click('[data-tool="wand"]');
        await page.waitForTimeout(200);

        // Verify diagonal is still enabled
        diagonal = await page.locator('#wand-diagonal').isChecked();
        expect(diagonal).toBe(true);
    });

    test('should use keyboard shortcuts for tool switching', async ({ page }) => {
        // Test pencil (B)
        await page.keyboard.press('b');
        await page.waitForTimeout(200);
        let activeTool = await page.evaluate(() => window.editor.currentTool.name);
        expect(activeTool).toBe('pencil');

        // Test eraser (E)
        await page.keyboard.press('e');
        await page.waitForTimeout(200);
        activeTool = await page.evaluate(() => window.editor.currentTool.name);
        expect(activeTool).toBe('eraser');

        // Test bucket (G)
        await page.keyboard.press('g');
        await page.waitForTimeout(200);
        activeTool = await page.evaluate(() => window.editor.currentTool.name);
        expect(activeTool).toBe('bucket');

        // Test selection (M)
        await page.keyboard.press('m');
        await page.waitForTimeout(200);
        activeTool = await page.evaluate(() => window.editor.currentTool.name);
        expect(activeTool).toBe('selection');

        // Test wand (W)
        await page.keyboard.press('w');
        await page.waitForTimeout(200);
        activeTool = await page.evaluate(() => window.editor.currentTool.name);
        expect(activeTool).toBe('wand');
    });

    test('should persist selected color when switching tools', async ({ page }) => {
        // Select a biome color
        await page.click('[data-type="biome"]');
        const biomeColor = await page.locator('.color-category:has-text("Biomes") .color-item:visible').first();
        await biomeColor.click();
        await page.waitForTimeout(200);

        // Get selected color ID
        const colorId = await page.evaluate(() => window.editor.selectedColor);
        expect(colorId).not.toBeNull();

        // Switch tools
        await page.click('[data-tool="eraser"]');
        await page.waitForTimeout(200);
        await page.click('[data-tool="pencil"]');
        await page.waitForTimeout(200);

        // Verify color is still selected
        const newColorId = await page.evaluate(() => window.editor.selectedColor);
        expect(newColorId).toBe(colorId);
    });

    test('should maintain active data type when switching tools', async ({ page }) => {
        // Switch to height data type
        await page.click('[data-type="height"]');
        await page.waitForTimeout(200);

        // Verify height is active
        let dataType = await page.evaluate(() => window.editor.layerManager.activeDataType);
        expect(dataType).toBe('height');

        // Switch tools
        await page.click('[data-tool="bucket"]');
        await page.waitForTimeout(200);
        await page.click('[data-tool="pencil"]');
        await page.waitForTimeout(200);

        // Verify height is still active
        dataType = await page.evaluate(() => window.editor.layerManager.activeDataType);
        expect(dataType).toBe('height');
    });
});

test.describe('Tool Options UI', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500);
    });

    test('should show correct options for each tool', async ({ page }) => {
        // Pencil: brush size
        await page.click('[data-tool="pencil"]');
        await page.waitForTimeout(200);
        let brushSizeVisible = await page.locator('#brush-size').isVisible();
        expect(brushSizeVisible).toBe(true);

        // Rectangle: fill mode
        await page.click('[data-tool="rectangle"]');
        await page.waitForTimeout(200);
        let fillModeVisible = await page.locator('#fill-mode').isVisible();
        expect(fillModeVisible).toBe(true);

        // Wand: diagonal option
        await page.click('[data-tool="wand"]');
        await page.waitForTimeout(200);
        const diagonalVisible = await page.locator('#wand-diagonal').isVisible();
        expect(diagonalVisible).toBe(true);
    });

    test('should update brush size dynamically', async ({ page }) => {
        // Set to size 1
        await page.selectOption('#brush-size', '1');
        await page.waitForTimeout(200);
        let brushSize = await page.evaluate(() => window.editor.brushSize);
        expect(brushSize).toBe(1);

        // Set to size 5
        await page.selectOption('#brush-size', '5');
        await page.waitForTimeout(200);
        brushSize = await page.evaluate(() => window.editor.brushSize);
        expect(brushSize).toBe(5);
    });

    test('should toggle fill mode with select', async ({ page }) => {
        // Switch to rectangle tool
        await page.click('[data-tool="rectangle"]');
        await page.waitForTimeout(200);

        // Set to filled
        await page.selectOption('#fill-mode', 'filled');
        await page.waitForTimeout(200);
        let fillMode = await page.evaluate(() => window.editor.fillMode);
        expect(fillMode).toBe('filled');

        // Set to outline
        await page.selectOption('#fill-mode', 'outline');
        await page.waitForTimeout(200);
        fillMode = await page.evaluate(() => window.editor.fillMode);
        expect(fillMode).toBe('outline');
    });

    test('should toggle diagonal option for wand tool', async ({ page }) => {
        // Switch to wand tool
        await page.click('[data-tool="wand"]');
        await page.waitForTimeout(200);

        // Enable diagonal
        await page.check('#wand-diagonal');
        await page.waitForTimeout(200);
        let diagonal = await page.locator('#wand-diagonal').isChecked();
        expect(diagonal).toBe(true);

        // Disable diagonal
        await page.uncheck('#wand-diagonal');
        await page.waitForTimeout(200);
        diagonal = await page.locator('#wand-diagonal').isChecked();
        expect(diagonal).toBe(false);
    });
});
