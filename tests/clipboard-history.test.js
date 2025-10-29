/**
 * Clipboard History Tests
 * Tests for the clipboard history manager and copy/paste functionality
 */

const { test, expect } = require('./test-base');

test.describe('Clipboard History Manager', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500); // Wait for initialization
    });

    test('should initialize with empty history', async ({ page }) => {
        const emptyText = await page.locator('.copy-history-empty').textContent();
        expect(emptyText).toBe('No copies yet');
    });

    test('should add entry to history when copying selection', async ({ page }) => {
        // Select pencil tool and draw some tiles
        await page.click('[data-tool="pencil"]');

        // Select a color
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        // Draw a 5x5 square
        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
                await canvas.click({
                    position: { x: box.width / 2 + i * 10, y: box.height / 2 + j * 10 }
                });
            }
        }

        // Switch to selection tool
        await page.click('[data-tool="selection"]');
        await page.waitForTimeout(200);

        // Draw selection box
        await canvas.click({ position: { x: box.width / 2 - 10, y: box.height / 2 - 10 } });
        await canvas.click({ position: { x: box.width / 2 + 60, y: box.height / 2 + 60 } });

        // Copy
        await page.keyboard.press('Control+C');

        // Check history panel
        const historyItems = await page.locator('.copy-history-item').count();
        expect(historyItems).toBe(1);

        const historyLabel = await page.locator('.copy-history-label').first().textContent();
        expect(historyLabel).toBe('Copy 1');
    });

    test('should maintain up to 10 history entries', async ({ page }) => {
        // Select pencil tool
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        // Create and copy 12 different selections
        for (let i = 0; i < 12; i++) {
            // Draw a tile
            await canvas.click({
                position: { x: box.width / 2 + i * 15, y: box.height / 2 + i * 15 }
            });

            // Switch to selection tool
            await page.click('[data-tool="selection"]');

            // Select the tile
            await canvas.click({ position: { x: box.width / 2 + i * 15, y: box.height / 2 + i * 15 } });

            // Copy
            await page.keyboard.press('Control+C');

            // Switch back to pencil
            await page.click('[data-tool="pencil"]');

            await page.waitForTimeout(100);
        }

        // Should only have 10 entries (oldest 2 removed)
        const historyItems = await page.locator('.copy-history-item').count();
        expect(historyItems).toBe(10);
    });

    test('should set active entry when clicked', async ({ page }) => {
        // Setup: Create 3 copies
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        for (let i = 0; i < 3; i++) {
            await canvas.click({
                position: { x: box.width / 2 + i * 20, y: box.height / 2 }
            });

            await page.click('[data-tool="selection"]');
            await canvas.click({ position: { x: box.width / 2 + i * 20, y: box.height / 2 } });
            await page.keyboard.press('Control+C');
            await page.click('[data-tool="pencil"]');
            await page.waitForTimeout(100);
        }

        // Click on second entry
        const secondEntry = await page.locator('.copy-history-item').nth(1);
        await secondEntry.click();

        // Verify it's active
        const activeClass = await secondEntry.getAttribute('class');
        expect(activeClass).toContain('active');
    });

    test('should delete entry when delete button clicked', async ({ page }) => {
        // Setup: Create 3 copies
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        for (let i = 0; i < 3; i++) {
            await canvas.click({
                position: { x: box.width / 2 + i * 20, y: box.height / 2 }
            });

            await page.click('[data-tool="selection"]');
            await canvas.click({ position: { x: box.width / 2 + i * 20, y: box.height / 2 } });
            await page.keyboard.press('Control+C');
            await page.click('[data-tool="pencil"]');
            await page.waitForTimeout(100);
        }

        // Delete middle entry
        const deleteBtn = await page.locator('.copy-history-delete').nth(1);
        await deleteBtn.click();

        // Should have 2 entries now
        const historyItems = await page.locator('.copy-history-item').count();
        expect(historyItems).toBe(2);
    });

    test('should paste from active history entry', async ({ page }) => {
        // Draw a colored tile
        await page.click('[data-tool="pencil"]');
        const colorItems = await page.locator('.color-item');
        await colorItems.nth(1).click(); // Select second color

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

        // Copy it
        await page.click('[data-tool="selection"]');
        await canvas.click({ position: { x: box.width / 2 - 5, y: box.height / 2 - 5 } });
        await canvas.click({ position: { x: box.width / 2 + 5, y: box.height / 2 + 5 } });
        await page.keyboard.press('Control+C');

        // Verify history entry exists
        const historyItems = await page.locator('.copy-history-item').count();
        expect(historyItems).toBe(1);

        // Paste
        await page.keyboard.press('Control+V');

        // Should create floating selection
        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toContain('Pasted');
    });

    test('should show tile count and dimensions in history entry', async ({ page }) => {
        // Draw a 3x3 grid
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                await canvas.click({
                    position: { x: box.width / 2 + i * 10, y: box.height / 2 + j * 10 }
                });
            }
        }

        // Select and copy
        await page.click('[data-tool="selection"]');
        await canvas.click({ position: { x: box.width / 2 - 10, y: box.height / 2 - 10 } });
        await canvas.click({ position: { x: box.width / 2 + 30, y: box.height / 2 + 30 } });
        await page.keyboard.press('Control+C');

        // Check details
        const details = await page.locator('.copy-history-details').first().textContent();
        expect(details).toContain('tiles');
        expect(details).toContain('×'); // Dimension separator
    });

    test('should work with wand tool selections', async ({ page }) => {
        // Draw a connected region
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        // Draw a small connected area
        for (let i = 0; i < 5; i++) {
            await canvas.click({
                position: { x: box.width / 2 + i * 10, y: box.height / 2 }
            });
        }

        // Use wand to select
        await page.click('[data-tool="wand"]');
        await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

        // Copy
        await page.keyboard.press('Control+C');

        // Check history
        const historyItems = await page.locator('.copy-history-item').count();
        expect(historyItems).toBe(1);

        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toContain('history');
    });
});

test.describe('Multiple Clipboard Entries', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500);
    });

    test('should paste different entries when switching active', async ({ page }) => {
        // Create 2 different colored selections
        await page.click('[data-tool="pencil"]');

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();

        // First copy - red tiles
        const colorItems = await page.locator('.color-item');
        await colorItems.nth(1).click(); // First color
        await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

        await page.click('[data-tool="selection"]');
        await canvas.click({ position: { x: box.width / 2 - 5, y: box.height / 2 - 5 } });
        await canvas.click({ position: { x: box.width / 2 + 5, y: box.height / 2 + 5 } });
        await page.keyboard.press('Control+C');

        // Second copy - different color
        await page.click('[data-tool="pencil"]');
        await colorItems.nth(3).click(); // Different color
        await canvas.click({ position: { x: box.width / 2 + 50, y: box.height / 2 } });

        await page.click('[data-tool="selection"]');
        await canvas.click({ position: { x: box.width / 2 + 45, y: box.height / 2 - 5 } });
        await canvas.click({ position: { x: box.width / 2 + 55, y: box.height / 2 + 5 } });
        await page.keyboard.press('Control+C');

        // Should have 2 entries
        const historyItems = await page.locator('.copy-history-item').count();
        expect(historyItems).toBe(2);

        // Click on first entry (older)
        await page.locator('.copy-history-item').nth(1).click();

        // Paste should use the first entry
        await page.keyboard.press('Control+V');

        // Wait for status message to update
        await page.waitForFunction(
            () => document.getElementById('status-message').textContent.includes('Pasted'),
            { timeout: 3000 }
        );

        // Verify paste happened
        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toContain('Pasted');
    });

    test('should handle empty history gracefully', async ({ page }) => {
        // Try to paste without copying
        await page.click('[data-tool="selection"]');
        await page.keyboard.press('Control+V');

        // Should not crash or show error
        const emptyText = await page.locator('.copy-history-empty').textContent();
        expect(emptyText).toBe('No copies yet');
    });
});
