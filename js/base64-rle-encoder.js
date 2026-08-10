/**
 * Base64 RLE Encoder
 * Ultra-compact binary RLE format encoded as base64 strings
 *
 * Format:
 * - Tag byte = (colorIndex << 5) | lenPart
 *   The colour index occupies the TOP 3 BITS (the decoder reads it back as
 *   `tag >> 5`), so the palette can hold at most 8 colours — see MAX_PALETTE_SIZE.
 * - lenPart 0-30 is the run length itself; lenPart == 31 flags "full run length
 *   follows as ULEB128".
 * - Encode to bytes, then base64
 *
 * Benefits:
 * - 3-6x smaller than array format before gzip
 * - Still benefits from gzip compression
 * - Single string instead of large arrays
 */

class Base64RLEEncoder {
    /**
     * Largest palette this encoding can represent.
     * The tag byte gives the colour index 3 bits, so indices run 0..7.
     * Callers with a bigger palette must use the array RLE form instead —
     * see WorldLayer.exportRLEDataBase64().
     */
    static get MAX_PALETTE_SIZE() {
        return 8;
    }

    static get MAX_COLOR_INDEX() {
        return Base64RLEEncoder.MAX_PALETTE_SIZE - 1;
    }

    /**
     * Can this RLE data be represented in rle-base64-v1 at all?
     * @param {Array<[number, number]>} rleData - Array of [paletteIndex, count] pairs
     * @returns {boolean}
     */
    canEncode(rleData) {
        return rleData.every(([colorIndex]) =>
            Number.isInteger(colorIndex) &&
            colorIndex >= 0 &&
            colorIndex <= Base64RLEEncoder.MAX_COLOR_INDEX
        );
    }

    /**
     * Encode RLE data to base64 string
     * @param {Array<[number, number]>} rleData - Array of [paletteIndex, count] pairs
     * @returns {string} - Base64 encoded string
     * @throws {RangeError} if a palette index or run length cannot be represented
     */
    encodeToBase64(rleData) {
        const bytes = [];

        for (const [colorIndex, runLength] of rleData) {
            // The tag byte only has 3 bits for the index. Anything larger used to be
            // written anyway and then truncated by Uint8Array, silently swapping tile
            // colours on export (index 8 decoded as 0, 9 as 1, ...). Refuse instead.
            if (!Number.isInteger(colorIndex) ||
                colorIndex < 0 ||
                colorIndex > Base64RLEEncoder.MAX_COLOR_INDEX) {
                throw new RangeError(
                    `Palette index ${colorIndex} cannot be encoded: rle-base64-v1 stores the ` +
                    `index in the top 3 bits of the tag byte, so it supports at most ` +
                    `${Base64RLEEncoder.MAX_PALETTE_SIZE} colours (indices 0-${Base64RLEEncoder.MAX_COLOR_INDEX}). ` +
                    `Use the array RLE format for larger palettes.`
                );
            }

            if (!Number.isInteger(runLength) || runLength < 0) {
                throw new RangeError(
                    `Run length ${runLength} cannot be encoded: expected a non-negative integer.`
                );
            }

            // Encode tag byte: (colorIndex << 5) | lenPart
            // Reserve lenPart=31 as flag for "ULEB128 follows"
            // For runLength 0-30: store directly in lenPart
            // For runLength >= 31: store 31 in lenPart + full runLength in ULEB128
            let lenPart, tagByte;

            if (runLength <= 30) {
                // Store directly in tag byte
                lenPart = runLength;
                tagByte = (colorIndex << 5) | lenPart;
                bytes.push(tagByte);
            } else {
                // Use lenPart=31 as flag, write full runLength as ULEB128
                lenPart = 31;
                tagByte = (colorIndex << 5) | lenPart;
                bytes.push(tagByte);

                // ULEB128 encoding of full runLength: 7 bits per byte, MSB=1 means more bytes follow
                let value = runLength;
                while (value >= 128) {
                    bytes.push((value & 0x7F) | 0x80);
                    value >>>= 7; // unsigned: >> would sign-extend past 2^31
                }
                bytes.push(value & 0x7F);
            }
        }

        // Convert bytes to Uint8Array and then to base64
        const uint8Array = new Uint8Array(bytes);
        return this.bytesToBase64(uint8Array);
    }

    /**
     * Decode base64 string back to RLE data
     * @param {string} base64String - Base64 encoded RLE data
     * @returns {Array<[number, number]>} - Array of [paletteIndex, count] pairs
     */
    decodeFromBase64(base64String) {
        const bytes = this.base64ToBytes(base64String);
        const rleData = [];
        let p = 0;

        while (p < bytes.length) {
            // Read tag byte
            const tag = bytes[p++];
            const colorIndex = tag >> 5;
            const lenPart = tag & 31;
            let runLength;

            // If lenPart == 31, read full runLength from ULEB128
            // Otherwise, runLength is stored directly in lenPart
            if (lenPart === 31) {
                // Read ULEB128 encoded full runLength
                let shift = 0;
                let byte;
                let value = 0;

                do {
                    if (p >= bytes.length) {
                        throw new Error('Truncated ULEB128 data');
                    }
                    byte = bytes[p++];
                    value |= (byte & 0x7F) << shift;
                    shift += 7;
                } while (byte & 0x80);

                runLength = value; // Use full value, not lenPart + value
            } else {
                // Use lenPart directly as runLength (0-30)
                runLength = lenPart;
            }

            rleData.push([colorIndex, runLength]);
        }

        return rleData;
    }

    /**
     * Convert Uint8Array to base64 string
     * @param {Uint8Array} bytes - Byte array
     * @returns {string} - Base64 string
     */
    bytesToBase64(bytes) {
        // Use browser's btoa with binary string
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert base64 string to Uint8Array
     * @param {string} base64 - Base64 string
     * @returns {Uint8Array} - Byte array
     */
    base64ToBytes(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Encode layer to base64-RLE format
     * @param {Array<[number, number]>} rleData - RLE data
     * @param {Array<string>} palette - Color palette
     * @param {string} layerType - Layer type
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @returns {object} - Layer data with base64-encoded RLE
     */
    encodeLayer(rleData, palette, layerType, width, height) {
        const base64Data = this.encodeToBase64(rleData);

        return {
            layer_type: layerType,
            palette: palette,
            encoding: 'rle-base64-v1',
            width: width,
            height: height,
            data_b64: base64Data
        };
    }

    /**
     * Decode layer from base64-RLE format
     * @param {object} layerData - Layer data with base64-encoded RLE
     * @returns {object} - Decoded layer with RLE array
     */
    decodeLayer(layerData) {
        if (layerData.encoding !== 'rle-base64-v1') {
            throw new Error(`Unsupported encoding: ${layerData.encoding}`);
        }

        const rleData = this.decodeFromBase64(layerData.data_b64);

        return {
            layer_type: layerData.layer_type,
            palette: layerData.palette,
            color_data: rleData,
            width: layerData.width,
            height: layerData.height
        };
    }

    /**
     * Get compression statistics
     * @param {Array<[number, number]>} rleData - Original RLE array
     * @param {string} base64String - Encoded base64 string
     * @returns {object} - Compression stats
     */
    getCompressionStats(rleData, base64String) {
        const arraySize = JSON.stringify(rleData).length;
        const base64Size = base64String.length + 20; // Include quotes and field name
        const ratio = ((1 - base64Size / arraySize) * 100).toFixed(1);

        return {
            arraySize,
            base64Size,
            ratio: ratio + '%',
            savedBytes: arraySize - base64Size
        };
    }

    /**
     * Optimize palette by removing unused colors and reindexing
     * @param {Array<string>} palette - Original palette
     * @param {Array<[number, number]>} rleData - RLE data
     * @returns {object} - { palette, rleData } with optimized indices
     */
    optimizePalette(palette, rleData) {
        // Find which palette indices are actually used
        const usedIndices = new Set();
        for (const [idx, count] of rleData) {
            usedIndices.add(idx);
        }

        // Create new palette with only used colors
        const indexMap = new Map();
        const newPalette = [];

        for (const idx of Array.from(usedIndices).sort((a, b) => a - b)) {
            indexMap.set(idx, newPalette.length);
            newPalette.push(palette[idx]);
        }

        // Remap RLE data to new indices
        const newRleData = rleData.map(([idx, count]) => [indexMap.get(idx), count]);

        return {
            palette: newPalette,
            rleData: newRleData
        };
    }
}

// Export singleton instance
const base64RLEEncoder = new Base64RLEEncoder();

// Make available globally
if (typeof window !== 'undefined') {
    window.base64RLEEncoder = base64RLEEncoder;
    window.Base64RLEEncoder = Base64RLEEncoder;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Base64RLEEncoder;
}
