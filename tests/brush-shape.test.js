/**
 * Brush shape (square / circle)
 *
 * The control is a segmented button group — `#brush-shape-control .segment[data-value]`
 * — and the default is CIRCLE. The old tests drove `selectOption('#brush-shape', ...)`
 * against a `<select id="brush-shape">` that does not exist, and asserted the default
 * was square.
 *
 * They also measured painting with `layerManager.getTotalTileCount()`, which counts
 * every tile in every layer (524,288 before you draw anything, because layers start out
 * full). Tile counts are compared against a snapshot here instead, and against the exact
 * footprint Editor.getBrushTiles() produces rather than a "less than square" heuristic.
 */

const { test, expect, initializeEditor, clickLayer, selectColor } = require('./test-base');

// Exact footprints from Editor.getBrushTiles(): a circle keeps tiles whose centre is
// strictly inside radius size/2. Note size 3 gives 9 for BOTH shapes — the corners of a
// 3x3 sit at 1.41 < 1.5 — so it is useless for telling the shapes apart.
const SQUARE_TILES = { 1: 1, 2: 4, 3: 9, 5: 25, 10: 100, 20: 400, 30: 900, 50: 2500 };
const CIRCLE_TILES = { 1: 1, 2: 4, 3: 9, 5: 21, 10: 80, 20: 316, 30: 716, 50: 1976 };

async function setShape(page, shape) {
    await page.click(`#brush-shape-control .segment[data-value="${shape}"]`);
    await page.waitForTimeout(50);
}

async function setSize(page, size) {
    await page.locator('#brush-size').fill(String(size));
    await page.waitForTimeout(50);
}

/** Paint once at the centre of the layer and report how many tiles actually changed. */
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

test.describe('Brush shape', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
        await clickLayer(page, 'Floor');
        // Anything other than the Floor default (#ff6b6b), so painted tiles are a
        // visible change rather than a no-op.
        await selectColor(page, 'Biome_Warehouse');
        await page.click('[data-tool="pencil"]');
    });

    test('the shape control offers square and circle, and starts on circle', async ({ page }) => {
        const control = await page.evaluate(() => {
            const segments = Array.from(document.querySelectorAll('#brush-shape-control .segment'));
            return {
                values: segments.map(s => s.dataset.value),
                labels: segments.map(s => s.textContent.trim()),
                active: segments.filter(s => s.classList.contains('active')).map(s => s.dataset.value),
                editorShape: window.editor.brushShape,
                optionsVisible: !!document.getElementById('brush-shape-options')?.offsetParent
            };
        });

        expect(control.values).toEqual(['square', 'circle']);
        expect(control.labels).toEqual(['Square', 'Circle']);
        expect(control.active).toEqual(['circle']);
        expect(control.editorShape).toBe('circle');
        expect(control.optionsVisible).toBe(true);
    });

    test('clicking a segment updates both the editor state and the highlight', async ({ page }) => {
        await setShape(page, 'square');
        let state = await page.evaluate(() => ({
            shape: window.editor.brushShape,
            active: Array.from(document.querySelectorAll('#brush-shape-control .segment.active')).map(s => s.dataset.value)
        }));
        expect(state.shape).toBe('square');
        expect(state.active).toEqual(['square']);

        await setShape(page, 'circle');
        state = await page.evaluate(() => ({
            shape: window.editor.brushShape,
            active: Array.from(document.querySelectorAll('#brush-shape-control .segment.active')).map(s => s.dataset.value)
        }));
        expect(state.shape).toBe('circle');
        expect(state.active).toEqual(['circle']);
    });

    test('a square brush paints exactly size x size tiles', async ({ page }) => {
        await setShape(page, 'square');
        for (const size of [1, 5, 10, 30, 50]) {
            await setSize(page, size);
            expect(await paintAndCountChanged(page), `square size ${size}`).toBe(SQUARE_TILES[size]);
            // Reset so the next measurement starts from a clean layer.
            await page.evaluate(() => window.editor.clearTiles(window.editor.getBrushTiles(128, 128, 50, 'square')));
        }
    });

    test('a circle brush paints the exact disc footprint', async ({ page }) => {
        await setShape(page, 'circle');
        for (const size of [1, 5, 10, 30, 50]) {
            await setSize(page, size);
            expect(await paintAndCountChanged(page), `circle size ${size}`).toBe(CIRCLE_TILES[size]);
            await page.evaluate(() => window.editor.clearTiles(window.editor.getBrushTiles(128, 128, 50, 'square')));
        }
    });

    test('a circle paints strictly fewer tiles than a square at the same size', async ({ page }) => {
        // Size 5 and above: at size 3 the two footprints are identical (9 tiles each),
        // which is why a "circle < square" check needs a size that actually differs.
        for (const size of [5, 10, 20]) {
            await setShape(page, 'square');
            await setSize(page, size);
            const square = await paintAndCountChanged(page);
            await page.evaluate(() => window.editor.clearTiles(window.editor.getBrushTiles(128, 128, 50, 'square')));

            await setShape(page, 'circle');
            const circle = await paintAndCountChanged(page);
            await page.evaluate(() => window.editor.clearTiles(window.editor.getBrushTiles(128, 128, 50, 'square')));

            expect(circle, `size ${size}`).toBeLessThan(square);
            expect(circle).toBe(CIRCLE_TILES[size]);
            expect(square).toBe(SQUARE_TILES[size]);
        }
    });

    test('the circle footprint is actually round, not just smaller', async ({ page }) => {
        await setShape(page, 'circle');
        await setSize(page, 10);

        const geometry = await page.evaluate(() => {
            const tiles = window.editor.getBrushTiles(128, 128);
            const keys = new Set(tiles.map(t => `${t.x},${t.y}`));
            return {
                // Corners of the bounding box must be outside a disc...
                corners: [
                    keys.has('123,123'), keys.has('132,123'),
                    keys.has('123,132'), keys.has('132,132')
                ],
                // ...while the mid-points of each edge stay inside.
                edgeMidpoints: [
                    keys.has('128,123'), keys.has('128,132'),
                    keys.has('123,128'), keys.has('132,128')
                ]
            };
        });

        expect(geometry.corners).toEqual([false, false, false, false]);
        expect(geometry.edgeMidpoints).toEqual([true, true, true, true]);
    });

    test('the eraser uses the current brush shape', async ({ page }) => {
        // Paint a solid 20x20 block, then erase a size-10 circle out of the middle.
        await setShape(page, 'square');
        await setSize(page, 20);
        expect(await paintAndCountChanged(page)).toBe(400);

        await page.click('[data-tool="eraser"]');
        await setShape(page, 'circle');
        await setSize(page, 10);

        const erased = await page.evaluate(() => {
            const editor = window.editor;
            const layer = editor.layerManager.getActiveLayer();
            const before = new Map(layer.tileData);

            editor.clearTiles(editor.getBrushTiles(128, 128));

            let changed = 0;
            for (const [key, color] of layer.tileData) {
                if (before.get(key) !== color) changed++;
            }
            return { changed, tileCount: layer.tileData.size, expected: layer.width * layer.height };
        });

        expect(erased.changed).toBe(CIRCLE_TILES[10]);
        // Erasing repaints the default; it must not remove tiles.
        expect(erased.tileCount).toBe(erased.expected);
    });

    test('brush shape persists across tool switches', async ({ page }) => {
        await setShape(page, 'square');

        for (const tool of ['pencil', 'eraser', 'rectangle', 'line', 'pencil']) {
            await page.click(`[data-tool="${tool}"]`);
            expect(await page.evaluate(() => window.editor.brushShape), `after ${tool}`).toBe('square');
        }
    });

    test('the shape options only show for tools that use a brush', async ({ page }) => {
        const visibility = {};
        for (const tool of ['pencil', 'eraser', 'rectangle', 'bucket', 'wand', 'pan']) {
            await page.click(`[data-tool="${tool}"]`);
            await page.waitForTimeout(50);
            visibility[tool] = await page.evaluate(() =>
                !!document.getElementById('brush-shape-options')?.offsetParent
            );
        }

        // Mirrors brushShapeTools in js/app.js.
        expect(visibility).toEqual({
            pencil: true, eraser: true, rectangle: true,
            bucket: false, wand: false, pan: false
        });
    });

    test('the brush preview matches the tiles that get painted', async ({ page }) => {
        await setShape(page, 'circle');
        await setSize(page, 10);

        const match = await page.evaluate(() => {
            const editor = window.editor;
            const preview = editor.currentTool.getPreview(editor, 128, 128);
            const brush = editor.getBrushTiles(128, 128);

            const key = t => `${t.x},${t.y}`;
            const previewKeys = new Set(preview.map(key));
            const brushKeys = new Set(brush.map(key));

            return {
                previewCount: previewKeys.size,
                brushCount: brushKeys.size,
                identical: previewKeys.size === brushKeys.size &&
                    [...brushKeys].every(k => previewKeys.has(k))
            };
        });

        // The old test only asserted `preview.length > 0`, which any preview satisfies.
        expect(match.brushCount).toBe(CIRCLE_TILES[10]);
        expect(match.identical, `preview ${match.previewCount} vs brush ${match.brushCount}`).toBe(true);
    });
});
