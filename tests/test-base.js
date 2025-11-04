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
 * Helper function to initialize editor
 */
async function initializeEditor(page) {
    await page.goto('http://localhost:8000/index.html');
    await page.waitForFunction(() => window.editor && window.editor.layerManager);
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
            return layerNameElement && layerNameElement.textContent.includes(name);
        });
        if (layerItem) {
            layerItem.click();
        }
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
 * Helper function to get visible color categories
 */
async function getVisibleColorCategories(page) {
    return await page.evaluate(() => {
        const categories = Array.from(document.querySelectorAll('.color-category'));
        return categories
            .filter(cat => !cat.classList.contains('hidden'))
            .map(cat => {
                const header = cat.querySelector('.color-category-header');
                return header ? header.textContent.trim() : null;
            })
            .filter(name => name !== null);
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
    getVisibleColorCategories,
    selectColor
};
