/**
 * Layer list and per-layer drawing
 *
 * Previously this file expected 6 layers (there are 8 — SkyHeightOffset and
 * UndergroundHeightOffset were added), and its "should draw on different layers" test
 * clicked `[data-type="biome"]`, an attribute that no longer exists anywhere in
 * index.html, so it timed out rather than testing anything. Even had it run, it drew
 * on one layer only and derived the grid cell from the click position with a formula
 * that ignores the canvas origin.
 */

const { test, expect, initializeEditor, clickLayer, selectColor } = require('./test-base');

const EXPECTED_LAYERS = [
    'Height', 'Difficulty', 'Hazard', 'Sky',
    'Floor', 'Underground', 'SkyHeightOffset', 'UndergroundHeightOffset'
];

test.describe('Layer management', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('the configured layers exist, in order, in both the model and the panel', async ({ page }) => {
        const state = await page.evaluate(() => ({
            modelNames: window.editor.layerManager.layers.map(l => l.name),
            modelTypes: window.editor.layerManager.layers.map(l => l.layerType),
            panelNames: Array.from(document.querySelectorAll('#layers-list .layer-item .layer-name'))
                .map(el => el.textContent.trim())
        }));

        expect(state.modelNames).toEqual(EXPECTED_LAYERS);
        expect(state.modelTypes).toEqual(EXPECTED_LAYERS);
        // The panel must show the same set — a layer missing from the UI is unreachable.
        expect(state.panelNames).toEqual(EXPECTED_LAYERS);
    });

    test('clicking a layer in the panel makes it active', async ({ page }) => {
        for (const name of ['Difficulty', 'Floor', 'UndergroundHeightOffset', 'Height']) {
            await clickLayer(page, name);
            const active = await page.evaluate(() => ({
                name: window.editor.layerManager.getActiveLayer().name,
                index: window.editor.layerManager.activeLayerIndex,
                highlighted: Array.from(document.querySelectorAll('#layers-list .layer-item'))
                    .filter(i => i.classList.contains('active'))
                    .map(i => i.querySelector('.layer-name').textContent.trim())
            }));

            expect(active.name, `after clicking ${name}`).toBe(name);
            expect(active.index).toBe(EXPECTED_LAYERS.indexOf(name));
            // Exactly one row highlighted, and it is the right one.
            expect(active.highlighted).toEqual([name]);
        }
    });

    test('drawing affects only the active layer', async ({ page }) => {
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Warehouse');

        const result = await page.evaluate(() => {
            const manager = window.editor.layerManager;
            const before = manager.layers.map(l => new Map(l.tileData));

            window.editor.setTiles([{ x: 40, y: 40 }, { x: 41, y: 40 }]);

            return manager.layers.map((layer, i) => {
                let changed = 0;
                for (const [key, color] of layer.tileData) {
                    if (before[i].get(key) !== color) changed++;
                }
                return { name: layer.name, changed, at40: layer.tileData.get('40,40') };
            });
        });

        for (const layer of result) {
            if (layer.name === 'Floor') {
                expect(layer.changed, 'Floor should have exactly the two painted tiles').toBe(2);
                expect(layer.at40).toBe('#4ecdc4');
            } else {
                expect(layer.changed, `${layer.name} must be untouched`).toBe(0);
            }
        }
    });

    test('each layer keeps its own undo stack', async ({ page }) => {
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Warehouse');
        await page.evaluate(() => {
            window.editor.saveState();
            window.editor.setTiles([{ x: 50, y: 50 }]);
        });

        const stacks = await page.evaluate(() =>
            window.editor.layerManager.layers.map(l => ({ name: l.name, undo: l.undoStack.length }))
        );

        const floor = stacks.find(s => s.name === 'Floor');
        const sky = stacks.find(s => s.name === 'Sky');
        expect(floor.undo).toBeGreaterThan(0);
        expect(sky.undo).toBe(0);
    });
});
