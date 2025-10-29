/**
 * Layer Hover Highlight Tests
 * Tests for highlighting layers when hovering over pixels
 */

const { test, expect } = require('./test-base');

test.describe('Layer Hover Highlighting', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500);
    });

    test('should highlight layer when hovering over non-empty pixel', async ({ page }) => {
        // Select pencil tool
        await page.click('[data-tool="pencil"]');
        await page.waitForTimeout(200);

        // Select first color
        const colorItems = await page.locator('.color-item');
        await colorItems.first().click();
        await page.waitForTimeout(200);

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        // Click on canvas to draw (using relative position within canvas)
        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(500);

        // Trigger mousemove event manually to simulate hover
        await canvas.dispatchEvent('mousemove', {
            clientX: box.x + 100,
            clientY: box.y + 100,
            bubbles: true
        });
        await page.waitForTimeout(500);

        // Check if any layer has hover class
        const hoverCount = await page.locator('.layer-item.layer-hover').count();
        expect(hoverCount).toBeGreaterThan(0);
    });

    test('should NOT highlight layer when hovering over empty pixel', async ({ page }) => {
        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        // Trigger mousemove over empty area
        await canvas.dispatchEvent('mousemove', {
            clientX: box.x + 50,
            clientY: box.y + 50,
            bubbles: true
        });
        await page.waitForTimeout(300);

        // No layer should have hover class
        const hoverLayers = await page.locator('.layer-item.layer-hover').count();
        expect(hoverLayers).toBe(0);
    });

    test('should clear highlight when mouse leaves canvas', async ({ page }) => {
        // Draw something
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(200);

        // Trigger mousemove to show highlight
        await canvas.dispatchEvent('mousemove', {
            clientX: box.x + 100,
            clientY: box.y + 100,
            bubbles: true
        });
        await page.waitForTimeout(300);

        // Verify highlight exists
        let hoverLayers = await page.locator('.layer-item.layer-hover').count();
        expect(hoverLayers).toBe(1);

        // Trigger mouseleave on canvas container
        const container = await page.locator('#canvas-container');
        await container.dispatchEvent('mouseleave', { bubbles: true });
        await page.waitForTimeout(300);

        // Highlight should be cleared
        hoverLayers = await page.locator('.layer-item.layer-hover').count();
        expect(hoverLayers).toBe(0);
    });

    test('should ignore invisible layers', async ({ page }) => {
        // Draw on first layer
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(200);

        // Make the layer invisible
        const visibilityCheckbox = await page.locator('input[id^="layer-visible-"]').first();
        await visibilityCheckbox.uncheck();
        await page.waitForTimeout(200);

        // Trigger mousemove over the pixel
        await canvas.dispatchEvent('mousemove', {
            clientX: box.x + 100,
            clientY: box.y + 100,
            bubbles: true
        });
        await page.waitForTimeout(300);

        // No layer should be highlighted (invisible layer ignored)
        const hoverLayers = await page.locator('.layer-item.layer-hover').count();
        expect(hoverLayers).toBe(0);
    });

    test('should work with active layer selection', async ({ page }) => {
        // Draw on active layer
        await page.click('[data-tool="pencil"]');
        const colorItems = await page.locator('.color-item');
        await colorItems.first().click();
        await page.waitForTimeout(200);

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        // Draw a pixel
        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(200);

        // Trigger mousemove over it
        await canvas.dispatchEvent('mousemove', {
            clientX: box.x + 100,
            clientY: box.y + 100,
            bubbles: true
        });
        await page.waitForTimeout(300);

        // Should highlight the active layer
        const hoverLayers = await page.locator('.layer-item.layer-hover').count();
        expect(hoverLayers).toBe(1);

        // The active layer should have both active and hover classes
        const activeAndHover = await page.locator('.layer-item.active.layer-hover').count();
        expect(activeAndHover).toBe(1);
    });
});
