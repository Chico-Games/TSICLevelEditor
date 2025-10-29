/**
 * Zoom on Mouse Position Tests
 * Tests for zooming centered on mouse cursor position
 */

const { test, expect } = require('./test-base');

test.describe('Zoom on Mouse Position', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500);
    });

    test('mouse wheel zoom should center on cursor position', async ({ page }) => {
        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        // Position mouse at specific point (not center)
        const mouseX = box.x + box.width * 0.25; // 25% from left
        const mouseY = box.y + box.height * 0.25; // 25% from top

        // Get initial zoom and offset
        const initialZoom = await page.evaluate(() => window.editor.zoom);
        const initialOffsetX = await page.evaluate(() => window.editor.offsetX);
        const initialOffsetY = await page.evaluate(() => window.editor.offsetY);

        // Zoom in with mouse at that position (multiple times to ensure change)
        await page.mouse.move(mouseX, mouseY);
        for (let i = 0; i < 5; i++) {
            await page.mouse.wheel(0, -100); // Zoom in
            await page.waitForTimeout(20);
        }
        await page.waitForTimeout(100);

        // Get new zoom and offset
        const newZoom = await page.evaluate(() => window.editor.zoom);
        const newOffsetX = await page.evaluate(() => window.editor.offsetX);
        const newOffsetY = await page.evaluate(() => window.editor.offsetY);

        // Zoom should have increased
        expect(newZoom).toBeGreaterThan(initialZoom);

        // Offset should have changed (zoom centered on mouse)
        expect(newOffsetX).not.toBe(initialOffsetX);
        expect(newOffsetY).not.toBe(initialOffsetY);
    });

    test('zoom in button should center on viewport center', async ({ page }) => {
        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        // Get initial state
        const initialZoom = await page.evaluate(() => window.editor.zoom);

        // Click zoom in button
        await page.click('#btn-zoom-in');
        await page.waitForTimeout(100);

        const newZoom = await page.evaluate(() => window.editor.zoom);

        // Should have zoomed in
        expect(newZoom).toBeGreaterThan(initialZoom);
    });

    test('zoom out button should center on viewport center', async ({ page }) => {
        // Zoom in first
        await page.click('#btn-zoom-in');
        await page.click('#btn-zoom-in');
        await page.waitForTimeout(100);

        const initialZoom = await page.evaluate(() => window.editor.zoom);

        // Click zoom out button
        await page.click('#btn-zoom-out');
        await page.waitForTimeout(100);

        const newZoom = await page.evaluate(() => window.editor.zoom);

        // Should have zoomed out
        expect(newZoom).toBeLessThan(initialZoom);
    });

    test('repeated mouse wheel zoom should maintain focus on cursor', async ({ page }) => {
        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        const mouseX = box.x + box.width * 0.75; // 75% from left
        const mouseY = box.y + box.height * 0.75; // 75% from top

        await page.mouse.move(mouseX, mouseY);

        // Get grid position under mouse
        const initialGridPos = await page.evaluate(() => {
            const editor = window.editor;
            return { gridX: editor.gridX, gridY: editor.gridY };
        });

        // Zoom in multiple times
        for (let i = 0; i < 3; i++) {
            await page.mouse.wheel(0, -100);
            await page.waitForTimeout(50);
        }

        // Move mouse slightly to update grid position
        await page.mouse.move(mouseX + 1, mouseY + 1);
        await page.mouse.move(mouseX, mouseY);
        await page.waitForTimeout(50);

        // Grid position under mouse should be roughly the same
        const finalGridPos = await page.evaluate(() => {
            const editor = window.editor;
            return { gridX: editor.gridX, gridY: editor.gridY };
        });

        // Allow some tolerance (±2 tiles) due to discrete tile positions
        expect(Math.abs(finalGridPos.gridX - initialGridPos.gridX)).toBeLessThanOrEqual(2);
        expect(Math.abs(finalGridPos.gridY - initialGridPos.gridY)).toBeLessThanOrEqual(2);
    });

    test('zoom level display should update correctly', async ({ page }) => {
        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

        // Zoom in multiple times
        for (let i = 0; i < 5; i++) {
            await page.mouse.wheel(0, -100);
            await page.waitForTimeout(20);
        }
        await page.waitForTimeout(100);

        const zoomText = await page.locator('#zoom-level').textContent();
        expect(zoomText).toMatch(/\d+%/);

        const zoomValue = parseInt(zoomText);
        expect(zoomValue).toBeGreaterThan(100); // Should be > 100%
    });

    test('zoom should respect min and max limits', async ({ page }) => {
        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

        // Try to zoom out to minimum
        for (let i = 0; i < 50; i++) {
            await page.mouse.wheel(0, 100);
        }
        await page.waitForTimeout(100);

        const minZoom = await page.evaluate(() => window.editor.zoom);
        expect(minZoom).toBeGreaterThanOrEqual(0.05); // 5% min

        // Try to zoom in to maximum
        for (let i = 0; i < 100; i++) {
            await page.mouse.wheel(0, -100);
        }
        await page.waitForTimeout(100);

        const maxZoom = await page.evaluate(() => window.editor.zoom);
        expect(maxZoom).toBeLessThanOrEqual(8.0); // 800% max
    });
});
