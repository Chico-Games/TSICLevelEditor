/**
 * Layer hover highlighting
 *
 * Hovering a tile highlights, in the layers panel, the layer that owns the colour under
 * the cursor. Priority order (Editor.highlightLayerAtPosition): the primary selected
 * layer, then the secondary selected layer, then the first visible layer with data.
 * Only #000000 counts as "no data".
 *
 * Fixes to the previous version:
 *  - "should NOT highlight when hovering over an empty pixel" assumed a blank canvas
 *    has empty tiles. Every layer is filled with its default colour at startup, so
 *    something is always highlighted; the only genuinely empty case is out-of-bounds.
 *  - "should ignore invisible layers" toggled `input[id^="layer-visible-"]`, a control
 *    the layers panel no longer has.
 *  - colour selection went through `.color-item` clicks that are hidden for the active
 *    layer's palette tab and therefore timed out.
 */

const { test, expect, initializeEditor, clickLayer, selectColor } = require('./test-base');

/** Ask the editor to evaluate the hover highlight at a grid position. */
async function hoverTile(page, x, y) {
    return await page.evaluate(({ gx, gy }) => {
        window.editor.highlightLayerAtPosition(gx, gy);
        return {
            highlighted: Array.from(document.querySelectorAll('.layer-item'))
                .map((item, index) => ({ index, on: item.classList.contains('layer-hover') }))
                .filter(entry => entry.on)
                .map(entry => entry.index),
            hoverInfo: document.getElementById('status-hover-info').textContent
        };
    }, { gx: x, gy: y });
}

test.describe('Layer hover highlighting', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('hovering a painted tile highlights the layer that owns it', async ({ page }) => {
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Warehouse');
        await page.evaluate(() => window.editor.setTiles([{ x: 100, y: 100 }]));

        const result = await hoverTile(page, 100, 100);

        // Floor is index 4 and is the primary selection, so it wins.
        expect(result.highlighted).toEqual([4]);
        expect(result.hoverInfo).toContain('Floor');
        expect(result.hoverInfo).toContain('Warehouse');
    });

    test('exactly one layer is highlighted at a time', async ({ page }) => {
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Warehouse');
        await page.evaluate(() => window.editor.setTiles([{ x: 101, y: 101 }]));

        const result = await hoverTile(page, 101, 101);
        expect(result.highlighted).toHaveLength(1);
    });

    test('hovering outside the grid clears the highlight', async ({ page }) => {
        await clickLayer(page, 'Floor');
        await page.evaluate(() => window.editor.setTiles([{ x: 102, y: 102 }]));
        expect((await hoverTile(page, 102, 102)).highlighted).toHaveLength(1);

        for (const [x, y] of [[-1, 50], [50, -1], [256, 50], [50, 256]]) {
            const result = await hoverTile(page, x, y);
            expect(result.highlighted, `at (${x},${y})`).toEqual([]);
            expect(result.hoverInfo).toBe('');
        }
    });

    test('a default-filled tile still highlights, because it is not empty', async ({ page }) => {
        // Every layer is pre-filled with its default colour, so there is no such thing
        // as an unpainted tile inside the grid. The old test asserted the opposite.
        const result = await hoverTile(page, 5, 5);

        expect(result.highlighted).toHaveLength(1);
        expect(result.hoverInfo).not.toBe('');
    });

    test('a #000000 tile counts as empty and is skipped', async ({ page }) => {
        const result = await page.evaluate(() => {
            const editor = window.editor;
            // Make every visible layer transparent at this cell.
            for (const layer of editor.layerManager.layers) {
                layer.tileData.set('120,120', '#000000');
            }
            editor.highlightLayerAtPosition(120, 120);
            return {
                highlighted: Array.from(document.querySelectorAll('.layer-item.layer-hover')).length,
                hoverInfo: document.getElementById('status-hover-info').textContent
            };
        });

        expect(result.highlighted).toBe(0);
        expect(result.hoverInfo).toBe('');
    });

    test('invisible layers are ignored', async ({ page }) => {
        const result = await page.evaluate(() => {
            const editor = window.editor;
            const layers = editor.layerManager.layers;

            // Only the Underground layer (index 5) has data at this cell...
            for (const layer of layers) layer.tileData.set('130,130', '#000000');
            layers[5].tileData.set('130,130', '#2f2f2f');

            // ...and it is hidden, so nothing should highlight.
            layers.forEach(l => { l.visible = false; });
            editor.recentLayerSelections = [5];
            editor.highlightLayerAtPosition(130, 130);
            const whileHidden = document.querySelectorAll('.layer-item.layer-hover').length;

            // Make it visible and the highlight must appear.
            layers[5].visible = true;
            editor.highlightLayerAtPosition(130, 130);
            const whileVisible = Array.from(document.querySelectorAll('.layer-item'))
                .findIndex(i => i.classList.contains('layer-hover'));

            return { whileHidden, whileVisible };
        });

        expect(result.whileHidden).toBe(0);
        expect(result.whileVisible).toBe(5);
    });

    test('the primary selected layer wins over lower layers', async ({ page }) => {
        const result = await page.evaluate(() => {
            const editor = window.editor;
            const layers = editor.layerManager.layers;

            // Data on both Height (0) and Floor (4); Floor is the primary selection.
            layers.forEach(l => { l.visible = true; });
            layers[0].tileData.set('140,140', '#525d6b');
            layers[4].tileData.set('140,140', '#4ecdc4');

            editor.recentLayerSelections = [4];
            editor.highlightLayerAtPosition(140, 140);
            const primaryWins = Array.from(document.querySelectorAll('.layer-item'))
                .findIndex(i => i.classList.contains('layer-hover'));

            // Swap the primary selection and the answer must follow it.
            editor.recentLayerSelections = [0];
            editor.highlightLayerAtPosition(140, 140);
            const afterSwap = Array.from(document.querySelectorAll('.layer-item'))
                .findIndex(i => i.classList.contains('layer-hover'));

            return { primaryWins, afterSwap };
        });

        expect(result.primaryWins).toBe(4);
        expect(result.afterSwap).toBe(0);
    });

    test('the secondary selection is used when the primary has no data', async ({ page }) => {
        const result = await page.evaluate(() => {
            const editor = window.editor;
            const layers = editor.layerManager.layers;

            layers.forEach(l => { l.visible = true; });
            layers[0].tileData.set('150,150', '#000000'); // primary: empty
            layers[3].tileData.set('150,150', '#b8b8b8'); // secondary: has data

            editor.recentLayerSelections = [0, 3];
            editor.highlightLayerAtPosition(150, 150);

            return Array.from(document.querySelectorAll('.layer-item'))
                .findIndex(i => i.classList.contains('layer-hover'));
        });

        expect(result).toBe(3);
    });

    test('leaving the canvas clears the highlight', async ({ page }) => {
        await clickLayer(page, 'Floor');
        await page.evaluate(() => window.editor.setTiles([{ x: 160, y: 160 }]));
        expect((await hoverTile(page, 160, 160)).highlighted).toHaveLength(1);

        await page.evaluate(() => window.editor.clearLayerHoverHighlight());

        const remaining = await page.evaluate(() =>
            document.querySelectorAll('.layer-item.layer-hover').length);
        expect(remaining).toBe(0);
    });
});
