/**
 * Tool state persistence and tool-option UI
 *
 * Corrections to the previous version:
 *  - `selectOption('#brush-size', '3')` — #brush-size is an <input type=range>, not a
 *    <select>, so the call threw before any state was checked.
 *  - `selectOption('#fill-mode', 'outline')` — #fill-mode is a checkbox now, and its
 *    option group is #shape-fill-options.
 *  - `[data-type="height"]` / `[data-type="biome"]` — those data-type buttons were
 *    removed; the palette is driven by the active layer instead.
 *  - `editor.layerManager.activeDataType` no longer exists.
 */

const { test, expect, initializeEditor, clickLayer, selectColor, getSelectedColor } = require('./test-base');

async function currentTool(page) {
    return await page.evaluate(() => window.editor.currentTool.name);
}

test.describe('Tool state persistence', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('brush size survives a tool switch', async ({ page }) => {
        await page.locator('#brush-size').fill('7');
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => window.editor.brushSize)).toBe(7);

        await page.click('[data-tool="eraser"]');
        await page.click('[data-tool="pencil"]');

        expect(await page.evaluate(() => window.editor.brushSize)).toBe(7);
        expect(await page.locator('#brush-size').inputValue()).toBe('7');
    });

    test('fill mode survives a switch away from the shape tools', async ({ page }) => {
        await page.click('[data-tool="rectangle"]');
        await page.waitForTimeout(100);

        // #fill-mode is a checkbox: checked = filled, unchecked = outline.
        await page.uncheck('#fill-mode');
        await page.waitForTimeout(50);
        expect(await page.isChecked('#fill-mode')).toBe(false);

        await page.click('[data-tool="pencil"]');
        await page.click('[data-tool="rectangle"]');
        await page.waitForTimeout(100);

        expect(await page.isChecked('#fill-mode')).toBe(false);
    });

    test('the wand diagonal option survives a tool switch', async ({ page }) => {
        await page.click('[data-tool="wand"]');
        await page.check('#wand-diagonal');
        expect(await page.isChecked('#wand-diagonal')).toBe(true);

        await page.click('[data-tool="pencil"]');
        await page.click('[data-tool="wand"]');

        expect(await page.isChecked('#wand-diagonal')).toBe(true);
    });

    test('keyboard shortcuts select the right tool', async ({ page }) => {
        const shortcuts = { b: 'pencil', e: 'eraser', g: 'bucket', m: 'selection', w: 'wand' };

        for (const [key, tool] of Object.entries(shortcuts)) {
            await page.evaluate(() => document.activeElement?.blur());
            await page.keyboard.press(key);
            await page.waitForTimeout(80);
            expect(await currentTool(page), `key "${key}"`).toBe(tool);

            // The toolbar highlight must follow the shortcut, not just the model.
            const activeButtons = await page.evaluate(() =>
                Array.from(document.querySelectorAll('[data-tool].active')).map(b => b.dataset.tool)
            );
            expect(activeButtons, `key "${key}" toolbar highlight`).toEqual([tool]);
        }
    });

    test('the selected colour survives a tool switch', async ({ page }) => {
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Restaurant');

        const before = await getSelectedColor(page);
        expect(before.name).toBe('Biome_Restaurant');

        await page.click('[data-tool="eraser"]');
        await page.click('[data-tool="bucket"]');
        await page.click('[data-tool="pencil"]');

        expect(await getSelectedColor(page)).toEqual(before);
    });

    test('the active layer survives a tool switch', async ({ page }) => {
        // Replaces the old activeDataType test — data types were folded into layers.
        await clickLayer(page, 'Hazard');
        expect(await page.evaluate(() => window.editor.layerManager.getActiveLayer().name)).toBe('Hazard');

        await page.click('[data-tool="bucket"]');
        await page.click('[data-tool="pencil"]');

        expect(await page.evaluate(() => window.editor.layerManager.getActiveLayer().name)).toBe('Hazard');
        expect((await getSelectedColor(page)).category).toBe('Hazards');
    });
});

test.describe('Tool options UI', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('each tool shows exactly the options it uses', async ({ page }) => {
        const optionGroups = {
            brushSize: 'brush-size-options',
            brushShape: 'brush-shape-options',
            shapeFill: 'shape-fill-options',
            wand: 'wand-options'
        };

        const observed = {};
        for (const tool of ['pencil', 'eraser', 'rectangle', 'wand', 'bucket', 'pan']) {
            await page.click(`[data-tool="${tool}"]`);
            await page.waitForTimeout(80);
            observed[tool] = await page.evaluate((groups) => {
                const out = {};
                for (const [key, id] of Object.entries(groups)) {
                    out[key] = !!document.getElementById(id)?.offsetParent;
                }
                return out;
            }, optionGroups);
        }

        expect(observed.pencil).toEqual({ brushSize: true, brushShape: true, shapeFill: false, wand: false });
        expect(observed.eraser).toEqual({ brushSize: true, brushShape: true, shapeFill: false, wand: false });
        expect(observed.rectangle).toEqual({ brushSize: true, brushShape: true, shapeFill: true, wand: false });
        expect(observed.wand).toEqual({ brushSize: false, brushShape: false, shapeFill: false, wand: true });
        expect(observed.bucket).toEqual({ brushSize: false, brushShape: false, shapeFill: false, wand: false });
        expect(observed.pan).toEqual({ brushSize: false, brushShape: false, shapeFill: false, wand: false });
    });

    test('the brush size slider drives the editor', async ({ page }) => {
        for (const size of [1, 5, 50]) {
            await page.locator('#brush-size').fill(String(size));
            await page.waitForTimeout(50);
            expect(await page.evaluate(() => window.editor.brushSize)).toBe(size);
        }
    });

    test('the fill-mode checkbox drives the editor', async ({ page }) => {
        await page.click('[data-tool="rectangle"]');
        await page.waitForTimeout(100);

        await page.check('#fill-mode');
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => window.editor.fillMode)).toBe('filled');

        await page.uncheck('#fill-mode');
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => window.editor.fillMode)).toBe('outline');
    });

    test('the wand diagonal checkbox toggles both ways', async ({ page }) => {
        await page.click('[data-tool="wand"]');

        await page.check('#wand-diagonal');
        expect(await page.isChecked('#wand-diagonal')).toBe(true);

        await page.uncheck('#wand-diagonal');
        expect(await page.isChecked('#wand-diagonal')).toBe(false);
    });
});
