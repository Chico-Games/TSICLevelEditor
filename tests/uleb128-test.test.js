/**
 * ULEB128 run-length encoding inside rle-base64-v1
 *
 * A run of 0-30 fits in the tag byte's low 5 bits. 31 is reserved as "the real length
 * follows as ULEB128", so the interesting boundaries are 30/31/32 and each 7-bit
 * ULEB128 rollover (127/128, 16383/16384, ...).
 *
 * Previously this file had two tests and neither could fail:
 *  - "test each value individually" `break`s out of the loop before its expect() when
 *    the encoder throws, so an exception was indistinguishable from a pass;
 *  - "manually test tag byte encoding" re-computed `(colorIndex << 5) | lenPart` inside
 *    the test and asserted that its own arithmetic agreed with itself. It never called
 *    base64RLEEncoder at all.
 */

const { test, expect, initializeEditor } = require('./test-base');

// 2048x2048 is the largest world size the format allows, so 4194304 is the longest
// run that can ever occur.
const BOUNDARY_RUNS = [
    0, 1, 2, 29, 30, 31, 32, 33,
    126, 127, 128, 129,
    16382, 16383, 16384, 16385,
    65535, 65536,
    262144, 1048576, 4194304
];

test.describe('ULEB128 run lengths', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('every boundary run length survives a round-trip', async ({ page }) => {
        const results = await page.evaluate((runs) => {
            return runs.map(runLength => {
                try {
                    const encoded = window.base64RLEEncoder.encodeToBase64([[0, runLength]]);
                    const decoded = window.base64RLEEncoder.decodeFromBase64(encoded);
                    return { runLength, decoded, error: null };
                } catch (err) {
                    // Report, don't swallow: an exception must fail the test.
                    return { runLength, decoded: null, error: err.message };
                }
            });
        }, BOUNDARY_RUNS);

        for (const result of results) {
            expect(result.error, `run length ${result.runLength} threw: ${result.error}`).toBeNull();
            expect(result.decoded, `run length ${result.runLength}`).toEqual([[0, result.runLength]]);
        }
        // Guard against the loop silently covering nothing.
        expect(results).toHaveLength(BOUNDARY_RUNS.length);
    });

    test('the tag byte carries the colour index alongside the run length', async ({ page }) => {
        // Exercised through the real encoder: a short run and a long (ULEB128) run for
        // each index the format supports.
        const results = await page.evaluate(() => {
            const out = [];
            for (let colorIndex = 0; colorIndex <= 7; colorIndex++) {
                for (const runLength of [1, 30, 31, 5000]) {
                    const encoded = window.base64RLEEncoder.encodeToBase64([[colorIndex, runLength]]);
                    const bytes = Array.from(window.base64RLEEncoder.base64ToBytes(encoded));
                    out.push({
                        colorIndex,
                        runLength,
                        tagByte: bytes[0],
                        byteCount: bytes.length,
                        decoded: window.base64RLEEncoder.decodeFromBase64(encoded)
                    });
                }
            }
            return out;
        });

        for (const r of results) {
            const label = `index ${r.colorIndex}, run ${r.runLength}`;

            // Top 3 bits of the tag byte are the palette index.
            expect(r.tagByte >> 5, `${label}: tag byte index`).toBe(r.colorIndex);

            // Low 5 bits are the length, or 31 meaning "ULEB128 follows".
            if (r.runLength <= 30) {
                expect(r.tagByte & 31, `${label}: inline length`).toBe(r.runLength);
                expect(r.byteCount, `${label}: should be a single byte`).toBe(1);
            } else {
                expect(r.tagByte & 31, `${label}: ULEB128 escape`).toBe(31);
                expect(r.byteCount, `${label}: should have ULEB128 bytes`).toBeGreaterThan(1);
            }

            expect(r.decoded, label).toEqual([[r.colorIndex, r.runLength]]);
        }
    });

    test('ULEB128 continuation bits are set correctly', async ({ page }) => {
        const bytes = await page.evaluate(() => {
            // 5000 = 0b1001110001000 -> ULEB128 = [0x88, 0x27]
            const encoded = window.base64RLEEncoder.encodeToBase64([[0, 5000]]);
            return Array.from(window.base64RLEEncoder.base64ToBytes(encoded));
        });

        expect(bytes).toEqual([31, 0x88, 0x27]);
        // Continuation bit set on all but the last ULEB128 byte.
        expect(bytes[1] & 0x80).toBe(0x80);
        expect(bytes[2] & 0x80).toBe(0);
    });

    test('a truncated payload is rejected rather than decoded as garbage', async ({ page }) => {
        const outcome = await page.evaluate(() => {
            const encoder = window.base64RLEEncoder;
            const full = encoder.base64ToBytes(encoder.encodeToBase64([[3, 5000]]));
            // Drop the final ULEB128 byte.
            const truncated = encoder.bytesToBase64(full.slice(0, full.length - 1));
            try {
                return { threw: false, decoded: encoder.decodeFromBase64(truncated) };
            } catch (err) {
                return { threw: true, message: err.message };
            }
        });

        expect(outcome.threw, `decoded truncated data as ${JSON.stringify(outcome.decoded)}`).toBe(true);
        expect(outcome.message).toMatch(/truncated/i);
    });
});
