/**
 * Test Map Generation Tests
 * Tests for the random splodge test map generator
 */

const { test, expect } = require('./test-base');

test.describe('Test Map Generation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500); // Wait for initialization
    });

    test('should have Load Test Map button visible', async ({ page }) => {
        const button = await page.locator('#btn-load-test-map');
        const isVisible = await button.isVisible();
        expect(isVisible).toBe(true);

        const buttonText = await button.textContent();
        expect(buttonText).toContain('Load Test Map');
    });

    test('should generate test map when button is clicked', async ({ page }) => {
        // Click the Load Test Map button
        await page.click('#btn-load-test-map');

        // Wait for generation to complete
        await page.waitForTimeout(1000);

        // Check that tiles were generated
        const tileCount = await page.evaluate(() => {
            return window.editor.layerManager.getTotalTileCount();
        });

        // Should have generated many tiles
        expect(tileCount).toBeGreaterThan(100);
    });

    test('should generate splodges on all layer types', async ({ page }) => {
        // Click the Load Test Map button
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(1000);

        // Check each layer has tiles (now using tileData)
        const layerStats = await page.evaluate(() => {
            const stats = {};
            window.editor.layerManager.layers.forEach(layer => {
                const layerType = layer.layerType || layer.name;
                stats[layerType] = {
                    tiles: layer.tileData?.size || 0
                };
            });
            return stats;
        });

        console.log('Layer statistics:', layerStats);

        // Verify at least some layers have data
        let totalTiles = 0;
        for (const [layerName, data] of Object.entries(layerStats)) {
            totalTiles += data.tiles;
        }

        expect(totalTiles).toBeGreaterThan(500); // Should have generated lots of tiles
    });

    test('should generate biome splodges on Floor layer', async ({ page }) => {
        // Click the Load Test Map button
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(1000);

        // Check Floor layer has tile data
        const floorTiles = await page.evaluate(() => {
            const layer = window.editor.layerManager.layers.find(
                l => l.layerType && l.layerType.toLowerCase() === 'floor'
            );
            return layer ? layer.tileData.size : 0;
        });

        expect(floorTiles).toBeGreaterThan(50);
    });

    test('should generate height splodges on Height layer', async ({ page }) => {
        // Click the Load Test Map button
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(1000);

        // Check Height layer has tile data
        const heightTiles = await page.evaluate(() => {
            const layer = window.editor.layerManager.layers.find(
                l => l.layerType && l.layerType.toLowerCase() === 'height'
            );
            return layer ? layer.tileData.size : 0;
        });

        expect(heightTiles).toBeGreaterThan(50);
    });

    test('should generate difficulty splodges on Difficulty layer', async ({ page }) => {
        // Click the Load Test Map button
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(1000);

        // Check Difficulty layer has tile data
        const difficultyTiles = await page.evaluate(() => {
            const layer = window.editor.layerManager.layers.find(
                l => l.layerType && l.layerType.toLowerCase() === 'difficulty'
            );
            return layer ? layer.tileData.size : 0;
        });

        expect(difficultyTiles).toBeGreaterThan(50);
    });

    test('should generate hazard splodges on Hazard layer', async ({ page }) => {
        // Click the Load Test Map button
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(1000);

        // Check Hazard layer has tile data
        const hazardTiles = await page.evaluate(() => {
            const layer = window.editor.layerManager.layers.find(
                l => l.layerType && l.layerType.toLowerCase() === 'hazard'
            );
            return layer ? layer.tileData.size : 0;
        });

        expect(hazardTiles).toBeGreaterThan(20);
    });

    test('should generate tiles on multiple layers', async ({ page }) => {
        // Click the Load Test Map button
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(1000);

        // Check that tiles were generated on at least 4 different layers
        const layersWithTiles = await page.evaluate(() => {
            let layerCount = 0;
            window.editor.layerManager.layers.forEach(layer => {
                if (layer.tileData.size > 0) layerCount++;
            });
            return layerCount;
        });

        // Should have tiles on at least 4 layers
        expect(layersWithTiles).toBeGreaterThanOrEqual(4);
    });

    test('should render splodges on canvas', async ({ page }) => {
        // Click the Load Test Map button
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(1000);

        // Take a screenshot to verify visually (optional)
        const canvas = await page.locator('#grid-canvas');
        const screenshot = await canvas.screenshot();
        expect(screenshot).toBeTruthy();

        // Check canvas has content (non-blank)
        const hasContent = await page.evaluate(() => {
            const canvas = document.getElementById('grid-canvas');
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Check if canvas has any non-black pixels
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) {
                    return true;
                }
            }
            return false;
        });

        expect(hasContent).toBe(true);
    });

    test('should update status message', async ({ page }) => {
        // Click the Load Test Map button
        await page.click('#btn-load-test-map');

        // Check status message appears
        await page.waitForTimeout(100);
        const statusMessage = await page.locator('#status-message').textContent();
        expect(statusMessage).toContain('Test map generated');
    });

    test('should mark editor as dirty after generation', async ({ page }) => {
        // Click the Load Test Map button
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(1000);

        // Check that editor is marked as dirty
        const isDirty = await page.evaluate(() => {
            return window.editor.isDirty;
        });

        expect(isDirty).toBe(true);
    });

    test('should support undo after generation', async ({ page }) => {
        // Get initial tile count
        const initialCount = await page.evaluate(() => {
            return window.editor.layerManager.getTotalTileCount();
        });

        // Click the Load Test Map button
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(1000);

        // Get count after generation
        const afterGenCount = await page.evaluate(() => {
            return window.editor.layerManager.getTotalTileCount();
        });

        expect(afterGenCount).toBeGreaterThan(initialCount);

        // Undo
        await page.keyboard.press('Control+Z');
        await page.waitForTimeout(500);

        // Should be back to initial count
        const afterUndoCount = await page.evaluate(() => {
            return window.editor.layerManager.getTotalTileCount();
        });

        expect(afterUndoCount).toBe(initialCount);
    });

    test('should generate consistent amount of tiles', async ({ page }) => {
        // Generate first map
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(1000);

        // Get first map tile count
        const firstMapTiles = await page.evaluate(() => {
            let totalTiles = 0;
            window.editor.layerManager.layers.forEach(layer => {
                totalTiles += layer.tileData.size;
            });
            return totalTiles;
        });

        // Clear and generate second map
        await page.click('#btn-new');
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(1000);

        // Get second map tile count
        const secondMapTiles = await page.evaluate(() => {
            let totalTiles = 0;
            window.editor.layerManager.layers.forEach(layer => {
                totalTiles += layer.tileData.size;
            });
            return totalTiles;
        });

        // Both maps should have substantial tiles (both > 500)
        expect(firstMapTiles).toBeGreaterThan(500);
        expect(secondMapTiles).toBeGreaterThan(500);

        // Tile counts should be reasonably similar (within 50% of each other)
        expect(Math.abs(firstMapTiles - secondMapTiles)).toBeLessThan(firstMapTiles * 0.5);
    });
});
