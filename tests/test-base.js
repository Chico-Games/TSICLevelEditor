/**
 * Base Test Configuration with Console Log Monitoring
 * All tests should import test/expect from this file instead of @playwright/test
 */

const base = require('@playwright/test');

// Extend the base test to add console log monitoring
const test = base.test.extend({
    page: async ({ page }, use, testInfo) => {
        const consoleErrors = [];
        const consoleWarnings = [];

        // Listen for console errors
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();

            // Collect errors
            if (type === 'error') {
                // Filter out known benign errors
                const isKnownBenign =
                    text.includes('Failed to load resource') && text.includes('404') ||
                    text.includes('favicon.ico') ||
                    text.includes('test-map.json') || // E2E test file that doesn't exist
                    text.includes('Import error:') || // Expected errors from file loading tests
                    text.includes('exceeded the quota'); // localStorage quota exceeded (autosave)

                if (!isKnownBenign) {
                    consoleErrors.push(text);
                    console.log(`[CONSOLE ERROR in "${testInfo.title}"]: ${text}`);
                }
            }

            // Collect warnings
            if (type === 'warning') {
                // Filter out known benign warnings
                const isKnownBenignWarning =
                    text.includes('willReadFrequently') || // Canvas performance warning
                    text.includes('Import warnings:') || // Expected warnings from validation
                    text.includes('Skipping maze generation') || // Expected for large regions
                    text.includes('Failed to generate maze'); // Expected maze generation warnings

                if (!isKnownBenignWarning) {
                    consoleWarnings.push(text);
                    console.log(`[CONSOLE WARNING in "${testInfo.title}"]: ${text}`);
                }
            }
        });

        // Listen for page errors (uncaught exceptions)
        page.on('pageerror', error => {
            const message = error.message;

            // Filter out known benign page errors
            const isKnownBenign =
                message.includes('Failed to load resource') && message.includes('404') ||
                message.includes('favicon.ico') ||
                message.includes('test-map.json') ||
                message.includes('Import error:') ||
                message.includes('exceeded the quota'); // localStorage quota exceeded

            if (!isKnownBenign) {
                consoleErrors.push(message);
                console.log(`[PAGE ERROR in "${testInfo.title}"]: ${message}`);
            }
        });

        // Use the page in the test
        await use(page);

        // After test completes, check for errors/warnings
        if (consoleErrors.length > 0) {
            throw new Error(
                `Test "${testInfo.title}" had ${consoleErrors.length} console error(s):\n` +
                consoleErrors.map((err, i) => `  ${i + 1}. ${err}`).join('\n')
            );
        }

        if (consoleWarnings.length > 0) {
            throw new Error(
                `Test "${testInfo.title}" had ${consoleWarnings.length} console warning(s):\n` +
                consoleWarnings.map((warn, i) => `  ${i + 1}. ${warn}`).join('\n')
            );
        }
    }
});

/**
 * Helper function to initialize editor.
 *
 * Note: with no project loaded the app fills EVERY layer with that layer's default
 * colour (app.js "[INIT] No project loaded - filling layers with valid defaults"),
 * so `layer.tileData.size` is already width*height before the test does anything.
 * Assertions about drawing must therefore compare against a snapshot — counting
 * tiles proves nothing. Use countChangedTiles() / snapshotLayer() below.
 */
async function initializeEditor(page) {
    await page.goto('/index.html');
    await page.waitForFunction(() => window.editor && window.editor.layerManager);
    // The default fill happens after the editor object exists; wait for it to land.
    await page.waitForFunction(() => {
        const lm = window.editor.layerManager;
        return lm.layers.length > 0 &&
            lm.layers.every(l => l.tileData.size === l.width * l.height);
    });
}

/**
 * Snapshot the active layer's tile colours as a plain object, for before/after diffs.
 */
async function snapshotActiveLayer(page) {
    return await page.evaluate(() => {
        const layer = window.editor.layerManager.getActiveLayer();
        return Object.fromEntries(layer.tileData);
    });
}

/**
 * Count the tiles on the active layer whose colour differs from `snapshot`.
 * This is the meaningful "how much did I paint" measure, because the layer starts
 * out completely filled with its default colour.
 */
async function countChangedTiles(page, snapshot) {
    return await page.evaluate((before) => {
        const layer = window.editor.layerManager.getActiveLayer();
        let changed = 0;
        for (const [key, color] of layer.tileData) {
            if (before[key] !== color) changed++;
        }
        for (const key of Object.keys(before)) {
            if (!layer.tileData.has(key)) changed++;
        }
        return changed;
    }, snapshot);
}

/**
 * Generate the Perlin test map and wait for it to finish.
 */
async function generateTestMap(page) {
    await page.evaluate(() => window.generateTestMap());
    await page.waitForFunction(() => {
        const floor = window.editor.layerManager.layers.find(l => l.layerType === 'Floor');
        // Generation replaces tileData wholesale; more than one distinct colour means
        // it actually ran rather than leaving the uniform default fill in place.
        if (!floor || floor.tileData.size === 0) return false;
        const seen = new Set();
        for (const color of floor.tileData.values()) {
            seen.add(color);
            if (seen.size > 1) return true;
        }
        return false;
    }, null, { timeout: 20000 });
}

/**
 * Helper function to click on a layer by name
 */
async function clickLayer(page, layerName) {
    await page.evaluate((name) => {
        const layersList = document.getElementById('layers-list');
        const layerItems = Array.from(layersList.querySelectorAll('.layer-item'));
        const layerItem = layerItems.find(item => {
            const layerNameElement = item.querySelector('.layer-name');
            return layerNameElement && layerNameElement.textContent.trim() === name;
        });
        if (!layerItem) throw new Error(`No layer named "${name}" in the layers panel`);
        layerItem.click();
    }, layerName);
}

/**
 * Helper function to get currently selected color
 */
async function getSelectedColor(page) {
    return await page.evaluate(() => {
        const selectedTileset = window.editor.selectedTileset;
        if (!selectedTileset) return null;

        return {
            name: selectedTileset.name,
            color: selectedTileset.color,
            category: selectedTileset.category
        };
    });
}

/**
 * Names of the colour sub-categories currently on screen.
 *
 * The palette was rebuilt as tabs (`.palette-tab` / `.palette-tab-content`) holding
 * `.color-subcategory` blocks — the old `.color-category` / `.color-category-header`
 * markup these helpers used to query no longer exists anywhere in index.html, so the
 * old version of this helper silently returned [] and every assertion built on it
 * ("expect(categories).not.toContain('Height')") passed vacuously.
 */
async function getVisibleColorSubcategories(page) {
    return await page.evaluate(() => {
        const inActiveTab = Array.from(
            document.querySelectorAll('.palette-tab-content.active .color-subcategory')
        );
        return inActiveTab
            .filter(sub => !sub.classList.contains('hidden'))
            .map(sub => sub.querySelector('.color-subcategory-header'))
            .filter(Boolean)
            .map(header => header.textContent.trim());
    });
}

/**
 * The colour names currently selectable (visible sub-category, not hidden by search).
 */
async function getVisibleColorNames(page) {
    return await page.evaluate(() => {
        return Array.from(
            document.querySelectorAll('.palette-tab-content.active .color-subcategory:not(.hidden) .color-item:not(.hidden)')
        ).map(item => item.dataset.name);
    });
}

/**
 * Helper function to select a color by name
 */
async function selectColor(page, colorName) {
    await page.evaluate((name) => {
        window.editor.selectTileset(name);
    }, colorName);
}

module.exports = {
    test,
    expect: base.expect,
    initializeEditor,
    clickLayer,
    getSelectedColor,
    getVisibleColorSubcategories,
    getVisibleColorNames,
    selectColor,
    snapshotActiveLayer,
    countChangedTiles,
    generateTestMap
};
