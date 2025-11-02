const { test, expect, initializeEditor } = require('./test-base');

test.describe('Export Format for Unreal', () => {
    let page;

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage;
        await initializeEditor(page);
        await page.waitForTimeout(500);
    });

    test('should check what data format Unreal expects vs what we export', async () => {
        // Generate test map
        await page.evaluate(() => {
            window.generateTestMap();
        });

        await page.waitForTimeout(3000);

        const analysis = await page.evaluate(() => {
            const exported = window.editor.layerManager.exportRLEDataBase64('TestMap', 'Test', 12345);
            const difficultyLayer = exported.layers.find(layer => layer.layer_type === 'Difficulty');

            // Decode RLE
            const rleData = window.base64RLEEncoder.decodeFromBase64(difficultyLayer.data_b64);

            // What we're currently exporting: palette indices
            const paletteIndices = rleData.map(([idx, count]) => idx);
            const uniquePaletteIndices = [...new Set(paletteIndices)];

            // What Unreal might expect: actual difficulty values (0-4)
            const difficultyValues = rleData.map(([idx, count]) => {
                const color = difficultyLayer.palette[idx];
                const tileset = window.configManager.getTilesetByColor(color);
                return tileset ? tileset.value : null;
            });
            const uniqueDifficultyValues = [...new Set(difficultyValues)];

            // Check first 20 entries
            const first20Comparison = [];
            for (let i = 0; i < Math.min(20, rleData.length); i++) {
                const [paletteIdx, count] = rleData[i];
                const color = difficultyLayer.palette[paletteIdx];
                const tileset = window.configManager.getTilesetByColor(color);
                const value = tileset ? tileset.value : null;

                first20Comparison.push({
                    run: i,
                    paletteIndex: paletteIdx,
                    color: color,
                    tilesetValue: value,
                    count: count
                });
            }

            return {
                exportFormat: 'base64-RLE with palette indices',
                palette: difficultyLayer.palette,
                uniquePaletteIndices: uniquePaletteIndices,
                uniqueDifficultyValues: uniqueDifficultyValues,
                first20Comparison: first20Comparison
            };
        });

        console.log(`\n=== Export Format Analysis ===`);
        console.log(`Format: ${analysis.exportFormat}`);
        console.log(`\nPalette: ${analysis.palette.join(', ')}`);
        console.log(`\nWhat we export (palette indices): ${analysis.uniquePaletteIndices.join(', ')}`);
        console.log(`What Unreal expects (difficulty values): ${analysis.uniqueDifficultyValues.join(', ')}`);

        console.log(`\n=== First 20 RLE Runs ===`);
        console.log(`Run | Palette Idx | Color     | Difficulty Value | Count`);
        console.log(`----|-------------|-----------|------------------|------`);
        for (const entry of analysis.first20Comparison) {
            console.log(`${entry.run.toString().padStart(3)} | ${entry.paletteIndex.toString().padStart(11)} | ${entry.color} | ${entry.tilesetValue !== null ? entry.tilesetValue.toString().padStart(16) : '            null'} | ${entry.count}`);
        }

        console.log(`\n⚠️  ISSUE: We're exporting palette indices (${analysis.uniquePaletteIndices.join(', ')})`);
        console.log(`   but Unreal might expect difficulty values (${analysis.uniqueDifficultyValues.join(', ')})`);
    });

    test('should simulate what Unreal sees when reading our export', async () => {
        // Generate test map
        await page.evaluate(() => {
            window.generateTestMap();
        });

        await page.waitForTimeout(3000);

        const simulation = await page.evaluate(() => {
            const exported = window.editor.layerManager.exportRLEDataBase64('TestMap', 'Test', 12345);
            const difficultyLayer = exported.layers.find(layer => layer.layer_type === 'Difficulty');

            // Decode base64 to get palette indices
            const rleData = window.base64RLEEncoder.decodeFromBase64(difficultyLayer.data_b64);

            // Simulate what Unreal sees if it reads palette indices as difficulty values
            const unrealInterpretation = [];
            for (let i = 0; i < Math.min(10, rleData.length); i++) {
                const [paletteIdx, count] = rleData[i];
                const color = difficultyLayer.palette[paletteIdx];
                const tileset = window.configManager.getTilesetByColor(color);
                const actualValue = tileset ? tileset.value : null;

                unrealInterpretation.push({
                    entry: i,
                    whatWeExport: paletteIdx,
                    whatUnrealReadsAsValue: paletteIdx, // If Unreal reads paletteIdx as value
                    whatItShouldBe: actualValue,
                    isValid: paletteIdx >= 0 && paletteIdx <= 4,
                    error: paletteIdx > 4 ? `Invalid difficulty value ${paletteIdx} (max: 4)` : null
                });
            }

            return unrealInterpretation;
        });

        console.log(`\n=== Unreal Engine Interpretation Simulation ===`);
        console.log(`Entry | Exported | Unreal Reads | Should Be | Valid? | Error`);
        console.log(`------|----------|--------------|-----------|--------|------`);

        let hasErrors = false;
        for (const sim of simulation) {
            const status = sim.isValid ? '✓' : '❌';
            const error = sim.error || '';
            console.log(`${sim.entry.toString().padStart(5)} | ${sim.whatWeExport.toString().padStart(8)} | ${sim.whatUnrealReadsAsValue.toString().padStart(12)} | ${sim.whatItShouldBe.toString().padStart(9)} | ${status.padEnd(6)} | ${error}`);

            if (!sim.isValid) {
                hasErrors = true;
            }
        }

        if (hasErrors) {
            console.log(`\n❌ Unreal would see invalid difficulty values!`);
            console.log(`   Solution: Export difficulty VALUES instead of palette INDICES`);
        }
    });
});
