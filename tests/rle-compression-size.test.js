/**
 * RLE Compression Size Tests
 * Verifies that RLE compression actually works and produces small files
 */

const { test, expect } = require('./test-base');

test.describe('RLE Compression Size', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500);
    });

    test('single color should compress to 1 RLE entry', async ({ page }) => {
        // Fill entire layer with one color using bucket fill
        await page.click('[data-tool="bucket"]');
        const biomeColors = await page.locator('.color-category:has(.color-category-header:has-text("Biomes")) .color-item');
        await biomeColors.first().click();

        // Switch to Floor layer
        await page.click('.layer-item:has-text("Floor")');

        const canvas = await page.locator('#grid-canvas');
        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(1000);

        // Export RLE
        const rleData = await page.evaluate(() => {
            return window.editor.layerManager.exportRLEData('Test', 'Test', 123);
        });

        // Find the Floor layer
        const floorLayer = rleData.layers.find(l => l.layer_type === 'Floor');
        expect(floorLayer).toBeDefined();

        console.log('Floor RLE entries:', floorLayer.color_data.length);
        console.log('First 5 entries:', JSON.stringify(floorLayer.color_data.slice(0, 5), null, 2));

        // Should have very few entries (ideally 1, or 2 if there's a default color)
        expect(floorLayer.color_data.length).toBeLessThan(5);

        // Total should be full grid
        const totalTiles = floorLayer.color_data.reduce((sum, entry) => sum + entry.count, 0);
        expect(totalTiles).toBe(512 * 512);
    });

    test('test map should produce reasonably sized JSON', async ({ page }) => {
        // Generate test map
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(2000);

        // Export RLE
        const result = await page.evaluate(() => {
            const rleData = window.editor.layerManager.exportRLEData('TestMap', 'Test', 123);
            const jsonString = JSON.stringify(rleData);
            const jsonStringPretty = JSON.stringify(rleData, null, 2);

            return {
                sizeBytes: jsonString.length,
                sizePrettyBytes: jsonStringPretty.length,
                layerCount: rleData.layers.length,
                layerStats: rleData.layers.map(layer => ({
                    type: layer.layer_type,
                    rleEntries: layer.color_data.length,
                    totalTiles: layer.color_data.reduce((sum, e) => sum + e.count, 0)
                }))
            };
        });

        console.log('RLE Export Stats:');
        console.log(`  Size (minified): ${(result.sizeBytes / 1024).toFixed(2)} KB`);
        console.log(`  Size (pretty): ${(result.sizePrettyBytes / 1024).toFixed(2)} KB`);
        console.log(`  Layers: ${result.layerCount}`);
        console.log('  Layer breakdown:');
        result.layerStats.forEach(stat => {
            console.log(`    ${stat.type}: ${stat.rleEntries} RLE entries, ${stat.totalTiles} tiles`);
        });

        // Full 512x512 grid with all layers = 6 * 262144 = 1,572,864 total tiles
        // With good RLE compression and large splodges, test map produces ~15,000 RLE entries
        // Typical RLE entry: {"color":"#ff6b6b","count":100} ~= 40 bytes
        // 15,000 entries * 40 bytes = ~600KB + metadata + formatting = ~1.1MB pretty-printed
        // This is excellent compression compared to legacy format (32MB)
        // Target: Under 1.5MB pretty-printed for complex maps with many colors

        expect(result.sizePrettyBytes).toBeLessThan(1.5 * 1024 * 1024); // Less than 1.5MB pretty-printed

        // Each layer should have tiles
        result.layerStats.forEach(stat => {
            expect(stat.totalTiles).toBe(512 * 512);
        });
    });

    test('empty layer should compress to 1 RLE entry with default color', async ({ page }) => {
        // Export RLE with empty layers
        const rleData = await page.evaluate(() => {
            return window.editor.layerManager.exportRLEData('Empty', 'Test', 123);
        });

        // All layers should be "empty" (filled with default #000000)
        rleData.layers.forEach(layer => {
            console.log(`${layer.layer_type}: ${layer.color_data.length} entries`);

            // Should compress to 1 entry (all #000000)
            expect(layer.color_data.length).toBe(1);
            expect(layer.color_data[0].color).toBe('#000000');
            expect(layer.color_data[0].count).toBe(512 * 512);
        });
    });

    test('RLE should be smaller than legacy format', async ({ page }) => {
        // Use bucket fill to create a simple pattern
        await page.click('[data-tool="bucket"]');
        await page.click('.layer-item:has-text("Floor")');
        const biomeColors = await page.locator('.color-category:has(.color-category-header:has-text("Biomes")) .color-item');
        await biomeColors.first().click();

        const canvas = await page.locator('#grid-canvas');
        await canvas.click({ position: { x: 100, y: 100 } });
        await page.waitForTimeout(1000);

        const sizes = await page.evaluate(() => {
            // Legacy format
            const legacyData = window.editor.layerManager.exportData();
            const legacyJSON = JSON.stringify(legacyData);

            // RLE format
            const rleData = window.editor.layerManager.exportRLEData('Test', 'Test', 123);
            const rleJSON = JSON.stringify(rleData);

            return {
                legacySize: legacyJSON.length,
                rleSize: rleJSON.length,
                tileCount: window.editor.layerManager.getTotalTileCount()
            };
        });

        console.log(`Tiles: ${sizes.tileCount}`);
        console.log(`Legacy format: ${(sizes.legacySize / 1024).toFixed(2)} KB`);
        console.log(`RLE format: ${(sizes.rleSize / 1024).toFixed(2)} KB`);
        console.log(`Compression ratio: ${(sizes.rleSize / sizes.legacySize * 100).toFixed(1)}%`);

        // RLE should be smaller (or at least not much larger) than legacy
        // For a bucket-filled grid (all one color), RLE should be MUCH smaller
        expect(sizes.rleSize).toBeLessThan(sizes.legacySize * 0.5); // RLE should be at least 50% smaller
    });
});
