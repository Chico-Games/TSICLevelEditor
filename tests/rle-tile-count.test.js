const { test, expect, initializeEditor } = require('./test-base');

test.describe('RLE Tile Count Validation', () => {
    let page;

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage;
        await initializeEditor(page);
        await page.waitForTimeout(500);
    });

    test('should verify RLE tile counts match grid size for test map', async () => {
        // Generate test map
        await page.evaluate(() => {
            window.generateTestMap();
        });

        await page.waitForTimeout(3000);

        // Export and analyze RLE data
        const analysis = await page.evaluate(() => {
            const exported = window.editor.layerManager.exportRLEDataBase64(
                'TestMap',
                'Tile count test',
                12345
            );

            const expectedTileCount = window.editor.layerManager.width * window.editor.layerManager.height;
            const results = [];

            for (const layer of exported.layers) {
                // Decode base64 RLE data
                const rleData = window.base64RLEEncoder.decodeFromBase64(layer.data_b64);

                // Calculate total tile count
                let totalTiles = 0;
                for (const [colorIndex, count] of rleData) {
                    totalTiles += count;
                }

                results.push({
                    layerType: layer.layer_type,
                    expectedTiles: expectedTileCount,
                    actualTiles: totalTiles,
                    mismatch: totalTiles !== expectedTileCount,
                    excess: totalTiles - expectedTileCount,
                    rleRunCount: rleData.length,
                    paletteSize: layer.palette.length
                });
            }

            return {
                width: window.editor.layerManager.width,
                height: window.editor.layerManager.height,
                expectedTileCount,
                layers: results
            };
        });

        console.log(`\n=== RLE Tile Count Analysis ===`);
        console.log(`Grid Size: ${analysis.width}×${analysis.height}`);
        console.log(`Expected Tiles per Layer: ${analysis.expectedTileCount.toLocaleString()}\n`);

        let hasMismatch = false;

        for (const layer of analysis.layers) {
            console.log(`${layer.layerType}:`);
            console.log(`  Expected: ${layer.expectedTiles.toLocaleString()} tiles`);
            console.log(`  Actual:   ${layer.actualTiles.toLocaleString()} tiles`);
            console.log(`  RLE runs: ${layer.rleRunCount}`);
            console.log(`  Palette:  ${layer.paletteSize} colors`);

            if (layer.mismatch) {
                hasMismatch = true;
                console.log(`  ❌ MISMATCH: ${layer.excess > 0 ? '+' : ''}${layer.excess.toLocaleString()} tiles`);
            } else {
                console.log(`  ✓ Correct`);
            }
            console.log('');
        }

        // Assert all layers have correct tile counts
        for (const layer of analysis.layers) {
            expect(layer.actualTiles).toBe(layer.expectedTiles);
        }

        if (hasMismatch) {
            throw new Error('RLE tile count mismatch detected - see console output above');
        }
    });

    test('should verify manual layer export has correct tile count', async () => {
        const analysis = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();
            const gridSize = layer.width * layer.height;

            // Draw some test data
            for (let i = 0; i < 1000; i++) {
                const x = Math.floor(Math.random() * layer.width);
                const y = Math.floor(Math.random() * layer.height);
                layer.setTile(x, y, 1, { color: '#ff0000', value: 1 });
            }

            // Export
            const exported = layer.exportRLEDataBase64();

            // Decode and count
            const rleData = window.base64RLEEncoder.decodeFromBase64(exported.data_b64);
            let totalTiles = 0;
            for (const [colorIndex, count] of rleData) {
                totalTiles += count;
            }

            return {
                width: layer.width,
                height: layer.height,
                expectedTiles: gridSize,
                actualTiles: totalTiles,
                rleRuns: rleData.length
            };
        });

        console.log(`\n=== Manual Layer Test ===`);
        console.log(`Grid: ${analysis.width}×${analysis.height}`);
        console.log(`Expected: ${analysis.expectedTiles.toLocaleString()} tiles`);
        console.log(`Actual:   ${analysis.actualTiles.toLocaleString()} tiles`);
        console.log(`RLE runs: ${analysis.rleRuns}`);

        expect(analysis.actualTiles).toBe(analysis.expectedTiles);
    });

    test('should debug RLE encoding step by step', async () => {
        const debug = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();

            // Clear and add specific pattern
            layer.clear();
            for (let y = 0; y < 10; y++) {
                for (let x = 0; x < 10; x++) {
                    layer.setTile(x, y, 1, { color: '#ff0000', value: 1 });
                }
            }

            // Export using the same logic as exportRLEDataBase64
            const totalTiles = layer.width * layer.height;
            const defaultColor = '#000000';

            // Create color grid
            const colorGrid = new Array(totalTiles).fill(defaultColor);

            // Fill grid from tile data
            for (const [key, color] of layer.tileData.entries()) {
                const [x, y] = key.split(',').map(Number);
                const index = y * layer.width + x;
                colorGrid[index] = color;
            }

            // Build palette
            const palette = [];
            const colorToIndex = new Map();

            for (const color of colorGrid) {
                if (!colorToIndex.has(color)) {
                    colorToIndex.set(color, palette.length);
                    palette.push(color);
                }
            }

            // Compress to RLE
            const rle = [];
            let currentColor = colorGrid[0];
            let currentIndex = colorToIndex.get(currentColor);
            let count = 1;

            for (let i = 1; i < colorGrid.length; i++) {
                if (colorGrid[i] === currentColor) {
                    count++;
                } else {
                    rle.push([currentIndex, count]);
                    currentColor = colorGrid[i];
                    currentIndex = colorToIndex.get(currentColor);
                    count = 1;
                }
            }
            rle.push([currentIndex, count]); // Don't forget the last run!

            // Calculate total from RLE
            let rleTotal = 0;
            for (const [idx, cnt] of rle) {
                rleTotal += cnt;
            }

            return {
                gridSize: totalTiles,
                colorGridLength: colorGrid.length,
                tileDataSize: layer.tileData.size,
                paletteSize: palette.length,
                rleRunCount: rle.length,
                rleTotalTiles: rleTotal,
                rleData: rle,
                palette: palette
            };
        });

        console.log(`\n=== Step-by-Step Debug ===`);
        console.log(`Grid size: ${debug.gridSize.toLocaleString()}`);
        console.log(`Color grid length: ${debug.colorGridLength.toLocaleString()}`);
        console.log(`Tile data entries: ${debug.tileDataSize.toLocaleString()}`);
        console.log(`Palette: ${debug.palette.join(', ')}`);
        console.log(`RLE runs: ${debug.rleRunCount}`);
        console.log(`RLE total tiles: ${debug.rleTotalTiles.toLocaleString()}`);
        console.log(`\nRLE data (first 10 runs):`);
        for (let i = 0; i < Math.min(10, debug.rleData.length); i++) {
            const [colorIdx, count] = debug.rleData[i];
            console.log(`  [${colorIdx}] ${debug.palette[colorIdx]} × ${count.toLocaleString()}`);
        }

        expect(debug.rleTotalTiles).toBe(debug.gridSize);
    });
});
