const { test, expect, initializeEditor } = require('./test-base');

test.describe('ULEB128 Isolated Test', () => {
    let page;

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage;
        await initializeEditor(page);
        await page.waitForTimeout(500);
    });

    test('should test each value individually to find the bug', async () => {
        const testValues = [0, 1, 31, 32, 100, 127, 128, 255, 256, 1000, 10000, 50000, 65535, 65536, 100000, 262144];

        for (const value of testValues) {
            const result = await page.evaluate((testValue) => {
                try {
                    // Create simple RLE data with this count
                    const rleData = [[0, testValue]];

                    // Encode to base64
                    const base64String = window.base64RLEEncoder.encodeToBase64(rleData);

                    // Decode back
                    const decoded = window.base64RLEEncoder.decodeFromBase64(base64String);

                    const match = decoded.length === 1 && decoded[0][0] === 0 && decoded[0][1] === testValue;

                    return {
                        success: true,
                        value: testValue,
                        encoded: base64String,
                        decoded: decoded[0] ? decoded[0][1] : null,
                        match: match,
                        error: null
                    };
                } catch (error) {
                    return {
                        success: false,
                        value: testValue,
                        encoded: null,
                        decoded: null,
                        match: false,
                        error: error.message
                    };
                }
            }, value);

            const status = result.match ? '✓' : '❌';
            console.log(`${status} Value ${result.value.toLocaleString().padStart(10)}: ${result.success ? `decoded as ${result.decoded}` : `ERROR: ${result.error}`}`);

            if (!result.success) {
                console.log(`   Attempting to encode/decode value ${result.value} failed`);
                console.log(`   This is the first failing value`);
                break;
            }

            expect(result.match).toBe(true);
        }
    });

    test('should manually test tag byte encoding for edge cases', async () => {
        const results = await page.evaluate(() => {
            const testCases = [
                { colorIndex: 0, runLength: 0 },
                { colorIndex: 0, runLength: 1 },
                { colorIndex: 0, runLength: 30 },
                { colorIndex: 0, runLength: 31 },
                { colorIndex: 0, runLength: 32 },
                { colorIndex: 0, runLength: 100 },
                { colorIndex: 1, runLength: 31 },
                { colorIndex: 1, runLength: 32 },
            ];

            return testCases.map(({ colorIndex, runLength }) => {
                const lenPart = Math.min(runLength, 31);
                const tagByte = (colorIndex << 5) | lenPart;

                // Will there be ULEB128 data?
                const hasULEB128 = runLength > 31;
                const remainder = hasULEB128 ? runLength - 31 : 0;

                // Decode tag byte
                const decodedColorIndex = tagByte >> 5;
                const decodedLenPart = tagByte & 31;

                return {
                    colorIndex,
                    runLength,
                    tagByte,
                    tagByteBinary: tagByte.toString(2).padStart(8, '0'),
                    lenPart,
                    hasULEB128,
                    remainder,
                    decodedColorIndex,
                    decodedLenPart,
                    decodesCorrectly: decodedColorIndex === colorIndex && decodedLenPart === lenPart
                };
            });
        });

        console.log(`\n=== Tag Byte Encoding Test ===\n`);
        for (const result of results) {
            console.log(`Color ${result.colorIndex}, Run ${result.runLength}:`);
            console.log(`  Tag byte: ${result.tagByte} (0b${result.tagByteBinary})`);
            console.log(`  Has ULEB128: ${result.hasULEB128} (remainder: ${result.remainder})`);
            console.log(`  Decoded: color=${result.decodedColorIndex}, lenPart=${result.decodedLenPart}`);
            console.log(`  ${result.decodesCorrectly ? '✓' : '❌'} ${result.decodesCorrectly ? 'OK' : 'FAILED'}\n`);

            expect(result.decodesCorrectly).toBe(true);
        }
    });
});
