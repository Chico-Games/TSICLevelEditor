const { test, expect, initializeEditor } = require('./test-base');

test.describe('Difficulty Layer Validation', () => {
    let page;

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage;
        await initializeEditor(page);
        await page.waitForTimeout(500);
    });

    test('should validate difficulty layer has only valid values (0-4)', async () => {
        // Generate test map
        await page.evaluate(() => {
            window.generateTestMap();
        });

        await page.waitForTimeout(3000);

        // Export and analyze difficulty layer
        const analysis = await page.evaluate(() => {
            const exported = window.editor.layerManager.exportRLEDataBase64(
                'TestMap',
                'Difficulty validation test',
                12345
            );

            // Find difficulty layer
            const difficultyLayer = exported.layers.find(layer => layer.layer_type === 'Difficulty');

            if (!difficultyLayer) {
                return { error: 'Difficulty layer not found' };
            }

            // Decode RLE data
            const rleData = window.base64RLEEncoder.decodeFromBase64(difficultyLayer.data_b64);

            // Check palette values
            const palette = difficultyLayer.palette;
            const paletteIndices = [];
            const invalidValues = [];
            const colorToValueMap = new Map();

            // Check what values are in the RLE data
            for (const [paletteIndex, count] of rleData) {
                if (!paletteIndices.includes(paletteIndex)) {
                    paletteIndices.push(paletteIndex);
                }

                const color = palette[paletteIndex];

                // Try to determine the difficulty value from the color
                // The configManager should have a mapping
                const tileset = window.configManager.getTilesetByColor(color);
                const value = tileset ? tileset.value : null;

                if (!colorToValueMap.has(color)) {
                    colorToValueMap.set(color, value);
                }

                // Check if value is valid (0-4 for difficulty)
                if (value !== null && (value < 0 || value > 4)) {
                    invalidValues.push({
                        paletteIndex,
                        color,
                        value,
                        count
                    });
                }
            }

            return {
                palette: palette,
                paletteSize: palette.length,
                paletteIndices: paletteIndices,
                rleRunCount: rleData.length,
                colorToValueMap: Array.from(colorToValueMap.entries()),
                invalidValues: invalidValues,
                firstRun: rleData[0],
                allRuns: rleData.slice(0, 20)
            };
        });

        console.log(`\n=== Difficulty Layer Analysis ===`);
        console.log(`Palette size: ${analysis.paletteSize}`);
        console.log(`Palette: ${analysis.palette.join(', ')}`);
        console.log(`RLE runs: ${analysis.rleRunCount}`);
        console.log(`\nColor to Value mapping:`);
        for (const [color, value] of analysis.colorToValueMap) {
            console.log(`  ${color} → ${value}`);
        }

        console.log(`\nFirst 20 RLE runs:`);
        for (let i = 0; i < analysis.allRuns.length; i++) {
            const [paletteIndex, count] = analysis.allRuns[i];
            const color = analysis.palette[paletteIndex];
            console.log(`  ${i}: palette[${paletteIndex}] = ${color} × ${count}`);
        }

        if (analysis.invalidValues.length > 0) {
            console.log(`\n❌ Found ${analysis.invalidValues.length} invalid difficulty values:`);
            for (const invalid of analysis.invalidValues) {
                console.log(`  palette[${invalid.paletteIndex}] = ${invalid.color} → value ${invalid.value} (invalid, max is 4)`);
            }
        } else {
            console.log(`\n✓ All difficulty values are valid (0-4)`);
        }

        expect(analysis.invalidValues.length).toBe(0);
    });

    test('should check palette index encoding in base64', async () => {
        // Generate test map
        await page.evaluate(() => {
            window.generateTestMap();
        });

        await page.waitForTimeout(3000);

        const analysis = await page.evaluate(() => {
            const exported = window.editor.layerManager.exportRLEDataBase64('TestMap', 'Test', 12345);
            const difficultyLayer = exported.layers.find(layer => layer.layer_type === 'Difficulty');

            // Decode base64 to bytes
            const bytes = window.base64RLEEncoder.base64ToBytes(difficultyLayer.data_b64);

            // Manually decode first few tag bytes
            const tagByteAnalysis = [];
            let p = 0;

            for (let i = 0; i < Math.min(10, bytes.length) && p < bytes.length; i++) {
                const tag = bytes[p++];
                const colorIndex = tag >> 5;
                const lenPart = tag & 31;

                let runLength;
                if (lenPart === 31) {
                    // Read ULEB128
                    let shift = 0;
                    let byte;
                    let value = 0;

                    do {
                        if (p >= bytes.length) break;
                        byte = bytes[p++];
                        value |= (byte & 0x7F) << shift;
                        shift += 7;
                    } while (byte & 0x80);

                    runLength = value;
                } else {
                    runLength = lenPart;
                }

                tagByteAnalysis.push({
                    position: p - 1,
                    tagByte: tag,
                    tagByteBinary: tag.toString(2).padStart(8, '0'),
                    colorIndex: colorIndex,
                    lenPart: lenPart,
                    runLength: runLength,
                    paletteColor: difficultyLayer.palette[colorIndex]
                });
            }

            return {
                palette: difficultyLayer.palette,
                bytesLength: bytes.length,
                firstBytes: Array.from(bytes.slice(0, 20)),
                tagByteAnalysis: tagByteAnalysis
            };
        });

        console.log(`\n=== Base64 Tag Byte Analysis (Difficulty Layer) ===`);
        console.log(`Palette: ${analysis.palette.join(', ')}`);
        console.log(`Total bytes: ${analysis.bytesLength}`);
        console.log(`First 20 bytes: ${analysis.firstBytes.join(', ')}`);
        console.log(`\nTag byte decoding:`);

        for (const tag of analysis.tagByteAnalysis) {
            console.log(`  Byte ${tag.position}: ${tag.tagByte} (0b${tag.tagByteBinary})`);
            console.log(`    → Color index: ${tag.colorIndex} (${tag.paletteColor})`);
            console.log(`    → Run length: ${tag.runLength}`);
        }

        // All color indices should be < palette size
        for (const tag of analysis.tagByteAnalysis) {
            expect(tag.colorIndex).toBeLessThan(analysis.palette.length);
        }
    });

    test('should verify difficulty layer colors map to valid values', async () => {
        const validation = await page.evaluate(() => {
            // Get difficulty layer
            const layers = window.editor.layerManager.layers;
            const difficultyLayer = layers.find(layer => layer.name === 'Difficulty');

            if (!difficultyLayer) {
                return { error: 'Difficulty layer not found' };
            }

            // Get all unique colors in difficulty layer
            const uniqueColors = new Set();
            for (const [key, color] of difficultyLayer.tileData.entries()) {
                uniqueColors.add(color);
            }

            // Check each color's value mapping
            const colorMappings = [];
            for (const color of uniqueColors) {
                const tileset = window.configManager.getTilesetByColor(color);
                colorMappings.push({
                    color: color,
                    value: tileset ? tileset.value : null,
                    name: tileset ? tileset.name : null,
                    isValid: tileset ? (tileset.value >= 0 && tileset.value <= 4) : false
                });
            }

            return {
                tileCount: difficultyLayer.tileData.size,
                uniqueColorCount: uniqueColors.size,
                colorMappings: colorMappings
            };
        });

        console.log(`\n=== Difficulty Layer Color Mappings ===`);
        console.log(`Tiles: ${validation.tileCount}`);
        console.log(`Unique colors: ${validation.uniqueColorCount}`);
        console.log(`\nColor mappings:`);

        for (const mapping of validation.colorMappings) {
            const status = mapping.isValid ? '✓' : '❌';
            console.log(`${status} ${mapping.color} → value ${mapping.value} (${mapping.name || 'unknown'})`);
        }

        // All colors should map to valid difficulty values (0-4)
        const invalidMappings = validation.colorMappings.filter(m => !m.isValid);
        if (invalidMappings.length > 0) {
            console.log(`\n❌ Found ${invalidMappings.length} invalid color mappings`);
        }

        expect(invalidMappings.length).toBe(0);
    });
});
