/**
 * Perlin Noise Generator
 * Based on improved Perlin noise algorithm for natural terrain generation
 */

class PerlinNoise {
    constructor(seed = null) {
        this.seed = seed !== null ? seed : Math.random() * 65536;
        this.permutation = this.generatePermutation();
    }

    /**
     * Generate permutation table for Perlin noise
     */
    generatePermutation() {
        const p = [];
        for (let i = 0; i < 256; i++) {
            p[i] = i;
        }

        // Fisher-Yates shuffle with seeded random
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(this.seededRandom(i) * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }

        // Duplicate the permutation table
        return [...p, ...p];
    }

    /**
     * Seeded random number generator
     */
    seededRandom(n) {
        const x = Math.sin(this.seed + n) * 10000;
        return x - Math.floor(x);
    }

    /**
     * Fade function for smooth interpolation
     */
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    /**
     * Linear interpolation
     */
    lerp(t, a, b) {
        return a + t * (b - a);
    }

    /**
     * Gradient function
     */
    grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    /**
     * 2D Perlin noise at coordinates (x, y)
     * Returns value between -1 and 1
     */
    noise2D(x, y) {
        // Find unit grid cell containing point
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;

        // Get relative xy coordinates of point within cell
        x -= Math.floor(x);
        y -= Math.floor(y);

        // Compute fade curves for x and y
        const u = this.fade(x);
        const v = this.fade(y);

        // Hash coordinates of the 4 square corners
        const p = this.permutation;
        const aa = p[p[X] + Y];
        const ab = p[p[X] + Y + 1];
        const ba = p[p[X + 1] + Y];
        const bb = p[p[X + 1] + Y + 1];

        // Blend results from the 4 corners
        const x1 = this.lerp(u, this.grad(aa, x, y), this.grad(ba, x - 1, y));
        const x2 = this.lerp(u, this.grad(ab, x, y - 1), this.grad(bb, x - 1, y - 1));

        return this.lerp(v, x1, x2);
    }

    /**
     * Octave noise - layered noise with different frequencies
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} octaves - Number of octaves to layer
     * @param {number} persistence - Amplitude multiplier per octave (0-1)
     * @param {number} lacunarity - Frequency multiplier per octave
     * @returns {number} - Noise value between -1 and 1
     */
    octaveNoise(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0; // Used for normalizing result to -1 to 1

        for (let i = 0; i < octaves; i++) {
            total += this.noise2D(x * frequency, y * frequency) * amplitude;

            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return total / maxValue;
    }

    /**
     * Generate noise map for a grid
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @param {number} scale - Scale factor (smaller = more zoomed in)
     * @param {number} octaves - Number of octaves
     * @param {number} persistence - Persistence value
     * @param {number} lacunarity - Lacunarity value
     * @returns {Array<Array<number>>} - 2D array of noise values (0-1 normalized)
     */
    generateNoiseMap(width, height, scale = 50, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
        const noiseMap = [];

        for (let y = 0; y < height; y++) {
            const row = [];
            for (let x = 0; x < width; x++) {
                // Scale coordinates
                const sampleX = x / scale;
                const sampleY = y / scale;

                // Get octave noise value
                let noiseValue = this.octaveNoise(sampleX, sampleY, octaves, persistence, lacunarity);

                // Normalize to 0-1
                noiseValue = (noiseValue + 1) / 2;

                row.push(noiseValue);
            }
            noiseMap.push(row);
        }

        return noiseMap;
    }

    /**
     * Generate colored terrain from noise map using thresholds
     * @param {Array<Array<number>>} noiseMap - 2D noise map (0-1 values)
     * @param {Array<{threshold: number, value: any}>} colorRanges - Color ranges with thresholds
     * @returns {Array<Array<any>>} - 2D array of values
     */
    applyColorRanges(noiseMap, colorRanges) {
        const result = [];

        // Sort color ranges by threshold
        colorRanges.sort((a, b) => a.threshold - b.threshold);

        for (let y = 0; y < noiseMap.length; y++) {
            const row = [];
            for (let x = 0; x < noiseMap[y].length; x++) {
                const noiseValue = noiseMap[y][x];

                // Find appropriate color range
                let selectedValue = colorRanges[0].value;
                for (const range of colorRanges) {
                    if (noiseValue >= range.threshold) {
                        selectedValue = range.value;
                    } else {
                        break;
                    }
                }

                row.push(selectedValue);
            }
            result.push(row);
        }

        return result;
    }

    /**
     * Generate multi-layer noise with different characteristics per layer
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @param {Array<Object>} layerConfigs - Configuration per layer
     * @returns {Object} - Map of layer names to 2D arrays
     */
    generateMultiLayerNoise(width, height, layerConfigs) {
        const result = {};

        for (const config of layerConfigs) {
            const noiseMap = this.generateNoiseMap(
                width,
                height,
                config.scale || 50,
                config.octaves || 4,
                config.persistence || 0.5,
                config.lacunarity || 2.0
            );

            if (config.colorRanges) {
                result[config.name] = this.applyColorRanges(noiseMap, config.colorRanges);
            } else {
                result[config.name] = noiseMap;
            }
        }

        return result;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.PerlinNoise = PerlinNoise;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerlinNoise;
}
