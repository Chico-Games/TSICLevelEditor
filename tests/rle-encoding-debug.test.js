const { test, expect, initializeEditor } = require('./test-base');

test.describe('RLE Encoding Debug', () => {
    let page;

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage;
        await initializeEditor(page);
        await page.waitForTimeout(500);
    });

    test('should compare RLE data before and after base64 encoding', async () => {
        const comparison = await page.evaluate(() => {
            const layer = window.editor.layerManager.getActiveLayer();

            // Clear and add test pattern
            layer.clear();
            for (let i = 0; i < 100; i++) {
                const x = Math.floor(Math.random() * layer.width);
                const y = Math.floor(Math.random() * layer.height);
                layer.setTile(x, y, 1, { color: '#ff0000', value: 1 });
            }

            // Get RLE data before encoding
            const exported = layer.exportRLEDataBase64();

            // Manually create RLE without base64 encoding
            const totalTiles = layer.width * layer.height;
            const defaultColor = '#000000';
            const colorGrid = new Array(totalTiles).fill(defaultColor);

            for (const [key, color] of layer.tileData.entries()) {
                const [x, y] = key.split(',').map(Number);
                const index = y * layer.width + x;
                colorGrid[index] = color;
            }

            const palette = [];
            const colorToIndex = new Map();

            for (const color of colorGrid) {
                if (!colorToIndex.has(color)) {
                    colorToIndex.set(color, palette.length);
                    palette.push(color);
                }
            }

            const rleOriginal = [];
            let currentColor = colorGrid[0];
            let currentIndex = colorToIndex.get(currentColor);
            let count = 1;

            for (let i = 1; i < colorGrid.length; i++) {
                if (colorGrid[i] === currentColor) {
                    count++;
                } else {
                    rleOriginal.push([currentIndex, count]);
                    currentColor = colorGrid[i];
                    currentIndex = colorToIndex.get(currentColor);
                    count = 1;
                }
            }
            rleOriginal.push([currentIndex, count]);

            // Count tiles in original RLE
            let originalTotal = 0;
            for (const [idx, cnt] of rleOriginal) {
                originalTotal += cnt;
            }

            // Decode from base64
            const rleDecoded = window.base64RLEEncoder.decodeFromBase64(exported.data_b64);

            // Count tiles in decoded RLE
            let decodedTotal = 0;
            for (const [idx, cnt] of rleDecoded) {
                decodedTotal += cnt;
            }

            return {
                gridSize: totalTiles,
                originalRLERunCount: rleOriginal.length,
                originalTileCount: originalTotal,
                decodedRLERunCount: rleDecoded.length,
                decodedTileCount: decodedTotal,
                originalRLE: rleOriginal.slice(0, 10),
                decodedRLE: rleDecoded.slice(0, 10),
                allOriginalRuns: rleOriginal,
                allDecodedRuns: rleDecoded
            };
        });

        console.log(`\n=== Base64 Encoding Comparison ===`);
        console.log(`Grid size: ${comparison.gridSize.toLocaleString()}`);
        console.log(`\nOriginal RLE (before base64):`);
        console.log(`  Run count: ${comparison.originalRLERunCount}`);
        console.log(`  Tile count: ${comparison.originalTileCount.toLocaleString()}`);
        console.log(`\nDecoded RLE (after base64):`);
        console.log(`  Run count: ${comparison.decodedRLERunCount}`);
        console.log(`  Tile count: ${comparison.decodedTileCount.toLocaleString()}`);

        console.log(`\nFirst 10 runs comparison:`);
        for (let i = 0; i < 10; i++) {
            const orig = comparison.originalRLE[i] || [null, null];
            const decoded = comparison.decodedRLE[i] || [null, null];
            const match = orig[0] === decoded[0] && orig[1] === decoded[1];
            console.log(`  ${i}: [${orig[0]}, ${orig[1]}] → [${decoded[0]}, ${decoded[1]}] ${match ? '✓' : '❌'}`);
        }

        // Find first mismatch
        let firstMismatch = -1;
        for (let i = 0; i < Math.max(comparison.allOriginalRuns.length, comparison.allDecodedRuns.length); i++) {
            const orig = comparison.allOriginalRuns[i];
            const decoded = comparison.allDecodedRuns[i];

            if (!orig || !decoded || orig[0] !== decoded[0] || orig[1] !== decoded[1]) {
                firstMismatch = i;
                console.log(`\n❌ First mismatch at run ${i}:`);
                console.log(`   Original: [${orig ? orig[0] : 'missing'}, ${orig ? orig[1] : 'missing'}]`);
                console.log(`   Decoded:  [${decoded ? decoded[0] : 'missing'}, ${decoded ? decoded[1] : 'missing'}]`);
                break;
            }
        }

        if (firstMismatch === -1) {
            console.log(`\n✓ All runs match!`);
        }

        expect(comparison.decodedTileCount).toBe(comparison.gridSize);
    });

    test('should test ULEB128 encoding for various values', async () => {
        const results = await page.evaluate(() => {
            const testValues = [
                0, 1, 31, 32, 100, 127, 128, 255, 256,
                1000, 10000, 50000, 65535, 65536, 100000, 262144
            ];

            const results = [];
            for (const value of testValues) {
                // Create simple RLE data with this count
                const rleData = [[0, value]];

                // Encode to base64
                const base64String = window.base64RLEEncoder.encodeToBase64(rleData);

                // Decode back
                const decoded = window.base64RLEEncoder.decodeFromBase64(base64String);

                const match = decoded.length === 1 && decoded[0][0] === 0 && decoded[0][1] === value;

                results.push({
                    value: value,
                    encoded: base64String,
                    decoded: decoded[0] ? decoded[0][1] : null,
                    match: match
                });
            }

            return results;
        });

        console.log(`\n=== ULEB128 Encoding Test ===`);
        console.log(`Testing various run lengths:\n`);

        let allMatch = true;
        for (const result of results) {
            const status = result.match ? '✓' : '❌';
            console.log(`${status} ${result.value.toLocaleString().padStart(10)} → decoded as ${result.decoded !== null ? result.decoded.toLocaleString() : 'null'}`);

            if (!result.match) {
                allMatch = false;
                console.log(`   Base64: ${result.encoded}`);
            }
        }

        expect(allMatch).toBe(true);
    });
});
