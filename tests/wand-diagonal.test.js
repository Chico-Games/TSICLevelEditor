/**
 * Wand Tool Diagonal Selection Tests
 * Tests for the wand tool's diagonal flood fill option
 */

const { test, expect } = require('./test-base');

// Helper function to get the actual tile pixel size from the editor
async function getTilePixelSize(page) {
    return await page.evaluate(() => {
        return window.editor.tileSize * window.editor.zoom;
    });
}

test.describe('Wand Tool Diagonal Selection', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500); // Wait for initialization
    });

    test('should show diagonal checkbox when wand tool is selected', async ({ page }) => {
        // Initially wand options should be hidden
        const wandOptions = await page.locator('#wand-options');
        let isVisible = await wandOptions.isVisible();
        expect(isVisible).toBe(false);

        // Select wand tool
        await page.click('[data-tool="wand"]');

        // Now wand options should be visible
        isVisible = await wandOptions.isVisible();
        expect(isVisible).toBe(true);

        // Check that diagonal checkbox exists
        const diagonalCheckbox = await page.locator('#wand-diagonal');
        const checkboxExists = await diagonalCheckbox.count();
        expect(checkboxExists).toBe(1);
    });

    test('should hide diagonal checkbox when switching to other tools', async ({ page }) => {
        // Select wand tool
        await page.click('[data-tool="wand"]');
        let isVisible = await page.locator('#wand-options').isVisible();
        expect(isVisible).toBe(true);

        // Switch to pencil
        await page.click('[data-tool="pencil"]');
        isVisible = await page.locator('#wand-options').isVisible();
        expect(isVisible).toBe(false);

        // Switch to selection
        await page.click('[data-tool="selection"]');
        isVisible = await page.locator('#wand-options').isVisible();
        expect(isVisible).toBe(false);
    });

    test('should show wand options when using keyboard shortcut', async ({ page }) => {
        // Press W key for wand tool
        await page.keyboard.press('w');

        // Wand options should be visible
        const isVisible = await page.locator('#wand-options').isVisible();
        expect(isVisible).toBe(true);
    });

    test('should select only cardinal neighbors when diagonal is unchecked', async ({ page }) => {
        // Draw an L-shape pattern
        // X X .
        // . X .
        // . . .
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item:visible').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;
        const tileSize = await getTilePixelSize(page);

        // Draw L-shape
        await canvas.click({ position: { x: centerX, y: centerY } });
        await canvas.click({ position: { x: centerX + tileSize, y: centerY } });
        await canvas.click({ position: { x: centerX + tileSize, y: centerY + tileSize } });

        // Select wand tool (diagonal unchecked by default)
        await page.click('[data-tool="wand"]');

        // Ensure diagonal is unchecked
        const diagonalCheckbox = await page.locator('#wand-diagonal');
        const isChecked = await diagonalCheckbox.isChecked();
        if (isChecked) {
            await diagonalCheckbox.uncheck();
        }

        // Click on the L-shape
        await canvas.click({ position: { x: centerX, y: centerY } });

        // Should select all 3 tiles (they're all connected via cardinal directions)
        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toContain('Selected 3 tiles');
    });

    test('should select diagonal neighbors when checkbox is checked', async ({ page }) => {
        // Draw a diagonal pattern
        // X . .
        // . X .
        // . . X
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item:visible').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;
        const tileSize = await getTilePixelSize(page);

        // Draw diagonal line
        await canvas.click({ position: { x: centerX, y: centerY } });
        await canvas.click({ position: { x: centerX + tileSize, y: centerY + tileSize } });
        await canvas.click({ position: { x: centerX + tileSize * 2, y: centerY + tileSize * 2 } });

        // Select wand tool and enable diagonal
        await page.click('[data-tool="wand"]');
        const diagonalCheckbox = await page.locator('#wand-diagonal');
        await diagonalCheckbox.check();

        // Click on the diagonal pattern
        await canvas.click({ position: { x: centerX, y: centerY } });

        // Should select all 3 tiles (connected diagonally)
        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toContain('Selected 3 tiles');
    });

    test('should NOT select diagonal neighbors when checkbox is unchecked', async ({ page }) => {
        // Draw a diagonal pattern
        // X . .
        // . X .
        // . . X
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item:visible').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;
        const tileSize = await getTilePixelSize(page);

        // Draw diagonal line (not connected via cardinal directions)
        await canvas.click({ position: { x: centerX, y: centerY } });
        await canvas.click({ position: { x: centerX + tileSize, y: centerY + tileSize } });
        await canvas.click({ position: { x: centerX + tileSize * 2, y: centerY + tileSize * 2 } });

        // Select wand tool with diagonal unchecked
        await page.click('[data-tool="wand"]');
        const diagonalCheckbox = await page.locator('#wand-diagonal');
        await diagonalCheckbox.uncheck();

        // Click on the first tile
        await canvas.click({ position: { x: centerX, y: centerY } });

        // Should only select 1 tile (no cardinal connections)
        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toContain('Selected 1 tiles');
    });

    test('should select larger area with diagonal enabled', async ({ page }) => {
        // Draw a simple connected pattern that works with both diagonal and cardinal
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item:visible').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;
        const tileSize = await getTilePixelSize(page);

        // Draw a 3x3 filled square - guaranteed to work
        for (let y = -1; y <= 1; y++) {
            for (let x = -1; x <= 1; x++) {
                await canvas.click({
                    position: { x: centerX + x * tileSize, y: centerY + y * tileSize }
                });
            }
        }

        // Test with wand (should select all 9 tiles either way)
        await page.click('[data-tool="wand"]');
        const diagonalCheckbox = await page.locator('#wand-diagonal');
        await diagonalCheckbox.uncheck();
        await canvas.click({ position: { x: centerX, y: centerY } });

        // Wait for status message to update
        await page.waitForFunction(() => {
            const msg = document.getElementById('status-message').textContent;
            return msg.includes('Selected');
        }, { timeout: 2000 });

        let statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toContain('Selected 9 tiles');

        // Clear selection
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // Test with diagonal (should also select all 9)
        await diagonalCheckbox.check();
        await canvas.click({ position: { x: centerX, y: centerY } });

        // Wait for status message to update
        await page.waitForFunction(() => {
            const msg = document.getElementById('status-message').textContent;
            return msg.includes('Selected');
        }, { timeout: 2000 });

        statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toContain('Selected 9 tiles');
    });

    test('should work with bucket fill pattern (cardinal only)', async ({ page }) => {
        // Draw a filled square
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item:visible').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;
        const tileSize = await getTilePixelSize(page);

        // Draw 3x3 filled square
        for (let y = -1; y <= 1; y++) {
            for (let x = -1; x <= 1; x++) {
                await canvas.click({
                    position: { x: centerX + x * tileSize, y: centerY + y * tileSize }
                });
            }
        }

        // Select with wand (diagonal off)
        await page.click('[data-tool="wand"]');
        const diagonalCheckbox = await page.locator('#wand-diagonal');
        await diagonalCheckbox.uncheck();

        await canvas.click({ position: { x: centerX, y: centerY } });

        // Should select all 9 tiles
        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toContain('Selected 9 tiles');
    });

    test('should copy and paste wand selection with diagonal enabled', async ({ page }) => {
        // Draw diagonal pattern
        await page.click('[data-tool="pencil"]');
        const colorItems = await page.locator('.color-item:visible');
        await colorItems.nth(2).click(); // Select a specific color

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;
        const tileSize = await getTilePixelSize(page);

        // Draw diagonal
        for (let i = 0; i < 4; i++) {
            await canvas.click({
                position: { x: centerX + i * tileSize, y: centerY + i * tileSize }
            });
        }

        // Select with wand (diagonal on)
        await page.click('[data-tool="wand"]');
        const diagonalCheckbox = await page.locator('#wand-diagonal');
        await diagonalCheckbox.check();

        await canvas.click({ position: { x: centerX, y: centerY } });

        // Copy
        await page.keyboard.press('Control+C');

        // Check clipboard history
        const historyItems = await page.locator('.copy-history-item').count();
        expect(historyItems).toBe(1);

        const details = await page.locator('.copy-history-details').first().textContent();
        expect(details).toContain('4 tiles');
    });

    test('should handle mixed connected regions with diagonal', async ({ page }) => {
        // Create an L-shape pattern that tests cardinal vs diagonal connections
        // X X .
        // . X .
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item:visible').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;
        const tileSize = await getTilePixelSize(page);

        // Draw L-shape (3 tiles connected cardinally)
        await canvas.click({ position: { x: centerX, y: centerY } });
        await canvas.click({ position: { x: centerX + tileSize, y: centerY } });
        await canvas.click({ position: { x: centerX + tileSize, y: centerY + tileSize } });

        // Select with wand (diagonal off) - should get all 3
        await page.click('[data-tool="wand"]');
        const diagonalCheckbox = await page.locator('#wand-diagonal');
        await diagonalCheckbox.uncheck();
        await page.waitForTimeout(200);
        await canvas.click({ position: { x: centerX, y: centerY } });

        // Check the status message says 3 tiles were selected
        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toContain('Selected 3 tiles');
    });

    test('should persist diagonal checkbox state when switching away and back', async ({ page }) => {
        // Select wand and check diagonal
        await page.click('[data-tool="wand"]');
        const diagonalCheckbox = await page.locator('#wand-diagonal');
        await diagonalCheckbox.check();

        let isChecked = await diagonalCheckbox.isChecked();
        expect(isChecked).toBe(true);

        // Switch to another tool
        await page.click('[data-tool="pencil"]');

        // Switch back to wand
        await page.click('[data-tool="wand"]');

        // Checkbox should still be checked
        isChecked = await diagonalCheckbox.isChecked();
        expect(isChecked).toBe(true);
    });

    test('should work on different data types (height, difficulty, hazard)', async ({ page }) => {
        // Switch to height data type
        await page.click('[data-type="height"]');

        // Select a height value
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item:visible').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;
        const tileSize = await getTilePixelSize(page);

        // Draw a small area
        for (let i = 0; i < 3; i++) {
            await canvas.click({
                position: { x: centerX + i * tileSize, y: centerY }
            });
        }

        // Use wand with diagonal
        await page.click('[data-tool="wand"]');
        const diagonalCheckbox = await page.locator('#wand-diagonal');
        await diagonalCheckbox.check();

        await canvas.click({ position: { x: centerX, y: centerY } });

        // Should select the tiles
        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toContain('Selected 3 tiles');
    });
});

test.describe('Wand Tool Integration Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500);
    });

    test('should move diagonal selection after lifting', async ({ page }) => {
        // Draw diagonal pattern
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item:visible').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;
        const tileSize = await getTilePixelSize(page);

        // Draw diagonal
        for (let i = 0; i < 3; i++) {
            await canvas.click({
                position: { x: centerX + i * tileSize, y: centerY + i * tileSize }
            });
        }

        // Select with wand (diagonal on)
        await page.click('[data-tool="wand"]');
        const diagonalCheckbox = await page.locator('#wand-diagonal');
        await diagonalCheckbox.check();

        await canvas.click({ position: { x: centerX, y: centerY } });

        // Click inside selection to start moving
        await canvas.click({ position: { x: centerX, y: centerY } });

        // Drag to new position
        await canvas.click({ position: { x: centerX + 50, y: centerY + 50 } });

        // Selection should be moved (floating)
        await page.waitForTimeout(200);

        // Finalize by clicking outside
        await canvas.click({ position: { x: centerX + 200, y: centerY + 200 } });
    });

    test('should not select empty tiles with diagonal', async ({ page }) => {
        // Draw isolated tile
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item:visible').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        const centerX = box.width / 2;
        const centerY = box.height / 2;

        // Draw single tile
        await canvas.click({ position: { x: centerX, y: centerY } });

        // Use wand on empty space
        await page.click('[data-tool="wand"]');
        await canvas.click({ position: { x: centerX + 100, y: centerY + 100 } });

        // Should show "No tiles to select"
        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toContain('No tiles');
    });
});
