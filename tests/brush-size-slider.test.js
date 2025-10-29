/**
 * Brush Size Slider Tests
 * Tests for the brush size slider (1-50 range)
 */

const { test, expect } = require('./test-base');

test.describe('Brush Size Slider', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500);
    });

    test('brush size slider should be visible', async ({ page }) => {
        const slider = await page.locator('#brush-size');
        await expect(slider).toBeVisible();

        // Check slider attributes
        const min = await slider.getAttribute('min');
        const max = await slider.getAttribute('max');
        const value = await slider.getAttribute('value');

        expect(min).toBe('1');
        expect(max).toBe('50');
        expect(value).toBe('1');
    });

    test('brush size label should show correct initial value', async ({ page }) => {
        const label = await page.locator('#brush-size-label');
        await expect(label).toBeVisible();

        const labelText = await label.textContent();
        expect(labelText).toBe('Brush Size: 1');
    });

    test('moving slider should update brush size and label', async ({ page }) => {
        const slider = await page.locator('#brush-size');
        const label = await page.locator('#brush-size-label');

        // Set slider to 10
        await slider.fill('10');
        await page.waitForTimeout(100);

        // Check label updated
        const labelText = await label.textContent();
        expect(labelText).toBe('Brush Size: 10');

        // Check editor brushSize updated
        const brushSize = await page.evaluate(() => window.editor.brushSize);
        expect(brushSize).toBe(10);
    });

    test('slider should support full range 1-50', async ({ page }) => {
        const slider = await page.locator('#brush-size');
        const label = await page.locator('#brush-size-label');

        // Test minimum
        await slider.fill('1');
        await page.waitForTimeout(50);
        expect(await label.textContent()).toBe('Brush Size: 1');
        expect(await page.evaluate(() => window.editor.brushSize)).toBe(1);

        // Test middle value
        await slider.fill('25');
        await page.waitForTimeout(50);
        expect(await label.textContent()).toBe('Brush Size: 25');
        expect(await page.evaluate(() => window.editor.brushSize)).toBe(25);

        // Test maximum
        await slider.fill('50');
        await page.waitForTimeout(50);
        expect(await label.textContent()).toBe('Brush Size: 50');
        expect(await page.evaluate(() => window.editor.brushSize)).toBe(50);
    });

    test('keyboard shortcuts 1-9 should set predefined brush sizes', async ({ page }) => {
        const slider = await page.locator('#brush-size');
        const label = await page.locator('#brush-size-label');

        // Key 1 -> size 1
        await page.keyboard.press('1');
        await page.waitForTimeout(50);
        expect(await label.textContent()).toBe('Brush Size: 1');
        expect(await slider.inputValue()).toBe('1');

        // Key 2 -> size 2
        await page.keyboard.press('2');
        await page.waitForTimeout(50);
        expect(await label.textContent()).toBe('Brush Size: 2');
        expect(await slider.inputValue()).toBe('2');

        // Key 3 -> size 3
        await page.keyboard.press('3');
        await page.waitForTimeout(50);
        expect(await label.textContent()).toBe('Brush Size: 3');
        expect(await slider.inputValue()).toBe('3');

        // Key 5 -> size 7
        await page.keyboard.press('5');
        await page.waitForTimeout(50);
        expect(await label.textContent()).toBe('Brush Size: 7');
        expect(await slider.inputValue()).toBe('7');

        // Key 9 -> size 25
        await page.keyboard.press('9');
        await page.waitForTimeout(50);
        expect(await label.textContent()).toBe('Brush Size: 25');
        expect(await slider.inputValue()).toBe('25');
    });

    test('drawing with different brush sizes should work', async ({ page }) => {
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;

        // Test size 1
        await page.locator('#brush-size').fill('1');
        await page.waitForTimeout(50);
        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(50);

        let tileCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());
        expect(tileCount).toBeGreaterThan(0);
        const size1Count = tileCount;

        // Clear
        await page.keyboard.press('Control+N');
        await page.waitForTimeout(50);

        // Test size 5
        await page.locator('#brush-size').fill('5');
        await page.waitForTimeout(50);
        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(50);

        tileCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());
        expect(tileCount).toBe(5 * 5); // 5x5 = 25 tiles
        expect(tileCount).toBeGreaterThan(size1Count);

        // Clear
        await page.keyboard.press('Control+N');
        await page.waitForTimeout(50);

        // Test size 10
        await page.locator('#brush-size').fill('10');
        await page.waitForTimeout(50);
        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(50);

        tileCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());
        expect(tileCount).toBe(10 * 10); // 10x10 = 100 tiles
    });

    test('large brush sizes (30-50) should work without errors', async ({ page }) => {
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;

        // Test size 30
        await page.locator('#brush-size').fill('30');
        await page.waitForTimeout(50);
        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(100);

        let tileCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());
        expect(tileCount).toBe(30 * 30); // 900 tiles

        // Clear
        await page.keyboard.press('Control+N');
        await page.waitForTimeout(50);

        // Test size 50 (maximum)
        await page.locator('#brush-size').fill('50');
        await page.waitForTimeout(50);
        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(150);

        tileCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());
        expect(tileCount).toBe(50 * 50); // 2500 tiles
    });

    test('brush size should affect eraser tool', async ({ page }) => {
        // Draw some tiles first
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        await page.locator('#brush-size').fill('10');
        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;
        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(100);

        let tileCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());
        expect(tileCount).toBe(100);

        // Switch to eraser with size 5
        await page.click('[data-tool="eraser"]');
        await page.locator('#brush-size').fill('5');
        await page.waitForTimeout(50);

        // Erase center
        await canvas.click({ position: { x: centerX, y: centerY } });
        await page.waitForTimeout(100);

        tileCount = await page.evaluate(() => window.editor.layerManager.getTotalTileCount());
        expect(tileCount).toBe(100 - 25); // Removed 5x5 = 25 tiles
    });

    test('brush size slider should be styled correctly', async ({ page }) => {
        const slider = await page.locator('#brush-size');

        // Check it has correct width style
        const width = await slider.evaluate(el => el.style.width);
        expect(width).toBe('150px');
    });

    test('slider should respond to input event while dragging', async ({ page }) => {
        const slider = await page.locator('#brush-size');
        const label = await page.locator('#brush-size-label');

        // Simulate dragging by setting multiple values quickly
        await slider.fill('5');
        await page.waitForTimeout(20);
        expect(await label.textContent()).toBe('Brush Size: 5');

        await slider.fill('15');
        await page.waitForTimeout(20);
        expect(await label.textContent()).toBe('Brush Size: 15');

        await slider.fill('35');
        await page.waitForTimeout(20);
        expect(await label.textContent()).toBe('Brush Size: 35');
    });

    test('brush size should persist when switching tools', async ({ page }) => {
        // Set size to 20
        await page.locator('#brush-size').fill('20');
        await page.waitForTimeout(50);

        // Switch to pencil
        await page.click('[data-tool="pencil"]');
        expect(await page.evaluate(() => window.editor.brushSize)).toBe(20);

        // Switch to eraser
        await page.click('[data-tool="eraser"]');
        expect(await page.evaluate(() => window.editor.brushSize)).toBe(20);

        // Switch to line
        await page.click('[data-tool="line"]');
        expect(await page.evaluate(() => window.editor.brushSize)).toBe(20);
    });
});
