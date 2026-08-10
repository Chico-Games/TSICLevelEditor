/**
 * Undo / redo
 *
 * Two things made the old version of this file untrustworthy:
 *
 *  - It selected colours via `.color-category:has(.color-category-header:has-text(...))`,
 *    markup that the tabbed-palette rewrite removed, so every test timed out in
 *    beforeEach-adjacent setup rather than exercising undo at all.
 *  - Its assertions were written for a model where undo empties the layer
 *    (`expect(getTotalTileCount()).toBe(0)`) and the eraser deletes tiles
 *    (`expect(getTile(...) !== null).toBe(false)`). Neither holds: layers start out
 *    completely filled with their default colour, and the eraser repaints that default.
 *
 * The right question for undo is "did the tile go back to the colour it had before",
 * so that is what these tests check.
 */

const { test, expect, initializeEditor, clickLayer, selectColor } = require('./test-base');

/** Paint tiles through the editor, with an undo checkpoint, exactly as a tool does. */
async function paint(page, tiles) {
    await page.evaluate((coords) => {
        window.editor.saveState();
        window.editor.setTiles(coords);
    }, tiles);
}

test.describe('Undo / redo', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
        await clickLayer(page, 'Floor');
    });

    test('undo restores the previous colour and redo re-applies it', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');

        const original = await page.evaluate(() =>
            window.editor.layerManager.getActiveLayer().tileData.get('30,30')
        );
        expect(original).toBe('#ff6b6b'); // Floor default

        await paint(page, [{ x: 30, y: 30 }]);
        const painted = await page.evaluate(() =>
            window.editor.layerManager.getActiveLayer().tileData.get('30,30')
        );
        expect(painted).toBe('#4ecdc4');

        await page.click('#btn-undo');
        const afterUndo = await page.evaluate(() =>
            window.editor.layerManager.getActiveLayer().tileData.get('30,30')
        );
        expect(afterUndo).toBe(original);

        await page.click('#btn-redo');
        const afterRedo = await page.evaluate(() =>
            window.editor.layerManager.getActiveLayer().tileData.get('30,30')
        );
        expect(afterRedo).toBe(painted);
    });

    test('undo restores the whole layer, not just the last tile', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');

        const before = await page.evaluate(() =>
            Object.fromEntries(window.editor.layerManager.getActiveLayer().tileData)
        );

        const tiles = [];
        for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) tiles.push({ x, y });
        await paint(page, tiles);

        const changed = await page.evaluate((snapshot) => {
            const layer = window.editor.layerManager.getActiveLayer();
            let n = 0;
            for (const [key, color] of layer.tileData) if (snapshot[key] !== color) n++;
            return n;
        }, before);
        expect(changed).toBe(400);

        await page.click('#btn-undo');

        const stillChanged = await page.evaluate((snapshot) => {
            const layer = window.editor.layerManager.getActiveLayer();
            const diffs = [];
            for (const [key, color] of layer.tileData) {
                if (snapshot[key] !== color && diffs.length < 5) diffs.push({ key, was: snapshot[key], now: color });
            }
            return { diffs, size: layer.tileData.size, expected: layer.width * layer.height };
        }, before);

        expect(stillChanged.diffs, JSON.stringify(stillChanged.diffs)).toEqual([]);
        // Undo must not leave holes in the layer either.
        expect(stillChanged.size).toBe(stillChanged.expected);
    });

    test('undo restores tiles a bucket fill replaced', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');

        const before = await page.evaluate(() =>
            Object.fromEntries(window.editor.layerManager.getActiveLayer().tileData)
        );

        await page.evaluate(() => {
            const editor = window.editor;
            editor.saveState();
            const layer = editor.layerManager.getActiveLayer();
            const tiles = [];
            for (let y = 0; y < layer.height; y++) {
                for (let x = 0; x < layer.width; x++) tiles.push({ x, y });
            }
            editor.setTiles(tiles);
        });

        const filledColors = await page.evaluate(() =>
            Array.from(new Set(window.editor.layerManager.getActiveLayer().tileData.values()))
        );
        expect(filledColors).toEqual(['#4ecdc4']);

        await page.click('#btn-undo');

        const restored = await page.evaluate((snapshot) => {
            const layer = window.editor.layerManager.getActiveLayer();
            for (const [key, color] of layer.tileData) {
                if (snapshot[key] !== color) return { key, was: snapshot[key], now: color };
            }
            return null;
        }, before);

        expect(restored, `tile not restored: ${JSON.stringify(restored)}`).toBeNull();
    });

    test('undo restores a colour the eraser overwrote with the layer default', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');
        await paint(page, [{ x: 60, y: 60 }]);

        await page.evaluate(() => {
            window.editor.saveState();
            window.editor.clearTiles([{ x: 60, y: 60 }]);
        });

        const afterErase = await page.evaluate(() =>
            window.editor.layerManager.getActiveLayer().tileData.get('60,60')
        );
        // Erasing repaints the default rather than removing the tile.
        expect(afterErase).toBe('#ff6b6b');

        await page.click('#btn-undo');
        const afterUndo = await page.evaluate(() =>
            window.editor.layerManager.getActiveLayer().tileData.get('60,60')
        );
        expect(afterUndo).toBe('#4ecdc4');

        await page.click('#btn-redo');
        const afterRedo = await page.evaluate(() =>
            window.editor.layerManager.getActiveLayer().tileData.get('60,60')
        );
        expect(afterRedo).toBe('#ff6b6b');
    });

    test('undo/redo buttons enable and disable with the stacks', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');

        const initial = await page.evaluate(() => ({
            undo: document.getElementById('btn-undo').disabled,
            redo: document.getElementById('btn-redo').disabled
        }));
        expect(initial).toEqual({ undo: true, redo: true });

        await paint(page, [{ x: 70, y: 70 }]);
        await page.evaluate(() => window.editor.updateUndoRedoButtons());
        expect(await page.evaluate(() => document.getElementById('btn-undo').disabled)).toBe(false);

        await page.click('#btn-undo');
        expect(await page.evaluate(() => document.getElementById('btn-redo').disabled)).toBe(false);

        await page.click('#btn-redo');
        expect(await page.evaluate(() => document.getElementById('btn-redo').disabled)).toBe(true);
    });

    test('a whole-document operation undoes and redoes every layer together', async ({ page }) => {
        // clearAll() rewrites all 8 layers. It used to checkpoint only the active one,
        // so Ctrl+Z reverted 1 layer and silently left the other 7 changed.
        await selectColor(page, 'Biome_Warehouse');
        await page.evaluate(() => {
            window.editor.saveState();
            window.editor.setTiles([{ x: 90, y: 90 }]);
        });

        const painted = await page.evaluate(() => {
            const layers = window.editor.layerManager.layers;
            return {
                floor: layers.find(l => l.layerType === 'Floor').tileData.get('90,90'),
                sky: layers.find(l => l.layerType === 'Sky').tileData.get('90,90')
            };
        });
        expect(painted.floor).toBe('#4ecdc4');

        // Wipe everything back to defaults.
        await page.evaluate(() => window.editor.clearAll());
        const cleared = await page.evaluate(() => {
            const layers = window.editor.layerManager.layers;
            return {
                floor: layers.find(l => l.layerType === 'Floor').tileData.get('90,90'),
                sky: layers.find(l => l.layerType === 'Sky').tileData.get('90,90')
            };
        });
        expect(cleared.floor).toBe('#ff6b6b');

        await page.click('#btn-undo');
        const afterUndo = await page.evaluate(() => {
            const layers = window.editor.layerManager.layers;
            return layers.map(l => ({ type: l.layerType, at90: l.tileData.get('90,90') }));
        });
        // Every layer comes back, not just the active one.
        expect(afterUndo.find(l => l.type === 'Floor').at90).toBe('#4ecdc4');
        expect(afterUndo.find(l => l.type === 'Sky').at90).toBe(painted.sky);

        await page.click('#btn-redo');
        const afterRedo = await page.evaluate(() => {
            const layers = window.editor.layerManager.layers;
            return layers.map(l => ({ type: l.layerType, at90: l.tileData.get('90,90') }));
        });
        expect(afterRedo.find(l => l.type === 'Floor').at90).toBe('#ff6b6b');
        expect(afterRedo.find(l => l.type === 'Sky').at90).toBe('#b8b8b8');
    });

    test('undo on one layer does not disturb another', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');
        await paint(page, [{ x: 80, y: 80 }]);

        await clickLayer(page, 'Sky');
        await selectColor(page, 'Biome_SkyCeiling');
        await paint(page, [{ x: 80, y: 80 }]);

        await page.click('#btn-undo'); // undoes the Sky edit only

        const state = await page.evaluate(() => {
            const layers = window.editor.layerManager.layers;
            return {
                floor: layers.find(l => l.layerType === 'Floor').tileData.get('80,80'),
                sky: layers.find(l => l.layerType === 'Sky').tileData.get('80,80')
            };
        });

        expect(state.sky).toBe('#b8b8b8');   // Sky default, edit undone
        expect(state.floor).toBe('#4ecdc4'); // Floor edit untouched
    });
});
