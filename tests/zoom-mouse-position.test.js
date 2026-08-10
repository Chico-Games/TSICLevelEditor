/**
 * Zoom on Mouse Position Tests
 * Tests for zooming centered on mouse cursor position
 */

const { test, expect } = require('./test-base');

test.describe('Zoom on Mouse Position', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500);
    });

    test('mouse wheel zoom keeps the world point under the cursor fixed', async ({ page }) => {
        // The old assertion here was `expect(newOffsetX).not.toBe(initialOffsetX)` — but
        // *any* zoom implementation moves the offsets, including one that zooms on the
        // viewport centre. What "zoom on the cursor" actually means is that the world
        // coordinate beneath the pointer is unchanged, which is what setZoom() computes.
        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        // A point deliberately away from the centre, so centre-anchored zoom would fail.
        const mouseX = box.x + box.width * 0.25;
        const mouseY = box.y + box.height * 0.25;

        const worldUnderCursor = (localX, localY) => page.evaluate(({ x, y }) => {
            const editor = window.editor;
            const rect = editor.gridCanvas.getBoundingClientRect();
            const canvasX = x - rect.left;
            const canvasY = y - rect.top;
            return {
                worldX: (canvasX - editor.offsetX) / (editor.tileSize * editor.zoom),
                worldY: (canvasY - editor.offsetY) / (editor.tileSize * editor.zoom),
                zoom: editor.zoom
            };
        }, { x: localX, y: localY });

        await page.mouse.move(mouseX, mouseY);
        const before = await worldUnderCursor(mouseX, mouseY);

        for (let i = 0; i < 5; i++) {
            await page.mouse.wheel(0, -100); // zoom in
            await page.waitForTimeout(20);
        }
        await page.waitForTimeout(100);

        const after = await worldUnderCursor(mouseX, mouseY);

        expect(after.zoom).toBeGreaterThan(before.zoom);
        // Sub-tile tolerance for float accumulation over five steps.
        expect(Math.abs(after.worldX - before.worldX)).toBeLessThan(0.5);
        expect(Math.abs(after.worldY - before.worldY)).toBeLessThan(0.5);
    });

    test('zooming out also keeps the world point under the cursor fixed', async ({ page }) => {
        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const mouseX = box.x + box.width * 0.7;
        const mouseY = box.y + box.height * 0.3;

        const worldUnderCursor = () => page.evaluate(({ x, y }) => {
            const editor = window.editor;
            const rect = editor.gridCanvas.getBoundingClientRect();
            return {
                worldX: ((x - rect.left) - editor.offsetX) / (editor.tileSize * editor.zoom),
                worldY: ((y - rect.top) - editor.offsetY) / (editor.tileSize * editor.zoom),
                zoom: editor.zoom
            };
        }, { x: mouseX, y: mouseY });

        await page.mouse.move(mouseX, mouseY);
        const before = await worldUnderCursor();

        for (let i = 0; i < 4; i++) {
            await page.mouse.wheel(0, 100); // zoom out
            await page.waitForTimeout(20);
        }
        await page.waitForTimeout(100);

        const after = await worldUnderCursor();

        expect(after.zoom).toBeLessThan(before.zoom);
        expect(Math.abs(after.worldX - before.worldX)).toBeLessThan(0.5);
        expect(Math.abs(after.worldY - before.worldY)).toBeLessThan(0.5);
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
