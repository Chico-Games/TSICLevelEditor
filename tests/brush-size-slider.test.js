/**
 * Brush size slider (range 1-50)
 *
 * Corrections to the previous version:
 *  - "brush size slider should be styled correctly" asserted the inline width was
 *    '150px' when the markup says 100px. It tested a CSS declaration, not behaviour,
 *    so it was deleted rather than re-pinned to the new number.
 *  - Every painting assertion used `layerManager.getTotalTileCount()`, which counts all
 *    8 layers and starts at 524,288 because layers are pre-filled with their default
 *    colour. `expect(tileCount).toBe(25)` could never hold. They now diff against a
 *    snapshot of the layer.
 *  - "brush size should affect eraser tool" expected the tile count to DROP by 25. The
 *    eraser repaints the layer default instead of deleting, so counts never drop.
 *  - `Control+N` was used to "clear" between measurements; it opens the New Project
 *    name prompt and clears nothing.
 */

const { test, expect, initializeEditor, clickLayer, selectColor } = require('./test-base');

async function setSize(page, size) {
    await page.locator('#brush-size').fill(String(size));
    await page.waitForTimeout(50);
}

/** Paint at the layer centre and count tiles whose colour actually changed. */
async function paintAndCountChanged(page) {
    return await page.evaluate(() => {
        const editor = window.editor;
        const layer = editor.layerManager.getActiveLayer();
        const before = new Map(layer.tileData);

        editor.setTiles(editor.getBrushTiles(128, 128));

        let changed = 0;
        for (const [key, color] of layer.tileData) {
            if (before.get(key) !== color) changed++;
        }
        return changed;
    });
}

/** Repaint the working area with the layer default, undoing any previous stroke. */
async function resetArea(page) {
    await page.evaluate(() =>
        window.editor.clearTiles(window.editor.getBrushTiles(128, 128, 50, 'square'))
    );
}

test.describe('Brush size slider', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Warehouse'); // differs from the Floor default
        await page.click('[data-tool="pencil"]');
        // Square keeps the expected footprints simple; shape itself is covered by
        // brush-shape.test.js.
        await page.click('#brush-shape-control .segment[data-value="square"]');
    });

    test('the slider exposes the documented range', async ({ page }) => {
        const slider = page.locator('#brush-size');
        await expect(slider).toBeVisible();

        expect(await slider.getAttribute('type')).toBe('range');
        expect(await slider.getAttribute('min')).toBe('1');
        expect(await slider.getAttribute('max')).toBe('50');
        expect(await slider.inputValue()).toBe('1');
        expect(await page.evaluate(() => window.editor.brushSize)).toBe(1);
    });

    test('the label reflects the initial value', async ({ page }) => {
        await expect(page.locator('#brush-size-label')).toHaveText('Brush Size: 1');
    });

    test('moving the slider updates the label and the editor together', async ({ page }) => {
        for (const size of [1, 10, 25, 50]) {
            await setSize(page, size);
            await expect(page.locator('#brush-size-label')).toHaveText(`Brush Size: ${size}`);
            expect(await page.evaluate(() => window.editor.brushSize), `size ${size}`).toBe(size);
            expect(await page.locator('#brush-size').inputValue()).toBe(String(size));
        }
    });

    test('number keys switch layers and leave the brush size alone', async ({ page }) => {
        // The old test asserted 1-9 were brush-size presets (1,2,3,7,25). They are
        // layer shortcuts now (js/app.js "Number keys 1-9 for layer selection"), so
        // that test was checking a shortcut the app no longer has.
        await setSize(page, 17);

        const layerNames = await page.evaluate(() =>
            window.editor.layerManager.layers.map(l => l.name)
        );

        for (const key of ['1', '4', '6']) {
            // Keyboard shortcuts are ignored while an <input> has focus (js/app.js
            // guards on e.target.tagName), and fill() leaves the slider focused.
            await page.evaluate(() => document.activeElement?.blur());
            await page.keyboard.press(key);
            await page.waitForTimeout(80);

            const state = await page.evaluate(() => ({
                brushSize: window.editor.brushSize,
                sliderValue: document.getElementById('brush-size').value,
                activeLayer: window.editor.layerManager.getActiveLayer().name
            }));

            expect(state.activeLayer, `key ${key} should select layer ${key}`)
                .toBe(layerNames[Number(key) - 1]);
            expect(state.brushSize, `key ${key} must not change the brush size`).toBe(17);
            expect(state.sliderValue).toBe('17');
        }
    });

    test('the arrow buttons step the size and clamp at the ends', async ({ page }) => {
        await setSize(page, 2);

        await page.click('#brush-size-decrease');
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => window.editor.brushSize)).toBe(1);

        // Already at the minimum — must not go to 0.
        await page.click('#brush-size-decrease');
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => window.editor.brushSize)).toBe(1);

        await setSize(page, 49);
        await page.click('#brush-size-increase');
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => window.editor.brushSize)).toBe(50);

        await page.click('#brush-size-increase');
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => window.editor.brushSize)).toBe(50);
    });

    test('the painted footprint matches the selected size', async ({ page }) => {
        for (const size of [1, 5, 10]) {
            await setSize(page, size);
            expect(await paintAndCountChanged(page), `size ${size}`).toBe(size * size);
            await resetArea(page);
        }
    });

    test('large brushes (30-50) paint their full footprint', async ({ page }) => {
        for (const size of [30, 50]) {
            await setSize(page, size);
            expect(await paintAndCountChanged(page), `size ${size}`).toBe(size * size);
            await resetArea(page);
        }
    });

    test('the eraser honours the brush size', async ({ page }) => {
        await setSize(page, 10);
        expect(await paintAndCountChanged(page)).toBe(100);

        await page.click('[data-tool="eraser"]');
        await page.click('#brush-shape-control .segment[data-value="square"]');
        await setSize(page, 5);

        const erased = await page.evaluate(() => {
            const editor = window.editor;
            const layer = editor.layerManager.getActiveLayer();
            const before = new Map(layer.tileData);
            const defaultColor = editor.getDefaultColorForLayer(layer.layerType).toLowerCase();

            editor.clearTiles(editor.getBrushTiles(128, 128));

            let restored = 0;
            for (const [key, color] of layer.tileData) {
                if (before.get(key) !== color) restored++;
            }
            return {
                restored,
                centre: layer.tileData.get('128,128'),
                defaultColor,
                tileCount: layer.tileData.size,
                expected: layer.width * layer.height
            };
        });

        // A 5x5 patch of the 10x10 block goes back to the layer default...
        expect(erased.restored).toBe(25);
        expect(erased.centre).toBe(erased.defaultColor);
        // ...and no tile is removed.
        expect(erased.tileCount).toBe(erased.expected);
    });

    test('the slider responds to every input event while dragging', async ({ page }) => {
        for (const size of [5, 15, 35, 2]) {
            await page.locator('#brush-size').fill(String(size));
            await page.waitForTimeout(20);
            await expect(page.locator('#brush-size-label')).toHaveText(`Brush Size: ${size}`);
        }
    });

    test('brush size persists across tool switches', async ({ page }) => {
        await setSize(page, 20);

        for (const tool of ['pencil', 'eraser', 'line', 'rectangle', 'pencil']) {
            await page.click(`[data-tool="${tool}"]`);
            expect(await page.evaluate(() => window.editor.brushSize), `after ${tool}`).toBe(20);
            expect(await page.locator('#brush-size').inputValue(), `after ${tool}`).toBe('20');
        }
    });

    test('brush size persists across layer switches', async ({ page }) => {
        await setSize(page, 12);

        for (const layer of ['Height', 'Difficulty', 'Floor']) {
            await clickLayer(page, layer);
            expect(await page.evaluate(() => window.editor.brushSize), `on ${layer}`).toBe(12);
        }
    });
});
