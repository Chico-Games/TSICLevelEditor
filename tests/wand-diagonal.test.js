/**
 * Wand tool: cardinal vs diagonal flood-fill selection
 *
 * The old version of this file drove everything through canvas clicks at
 * `centerX + i * tileSize`, selected colours via `.color-item:visible` (the palette is
 * tab-based now, and the swatch it picked was frequently the active layer's own default
 * colour — so "select the 3 tiles I drew" actually flood-filled all 65,536), and
 * asserted on `#status-message` text alone. One test, "should move diagonal selection
 * after lifting", had no assertions whatsoever.
 *
 * These drive the tool through its own API and assert on the resulting selection set,
 * which is what the feature is actually about.
 */

const { test, expect, initializeEditor, clickLayer, selectColor } = require('./test-base');

/** Paint `tiles` with a colour distinct from the layer default. */
async function paint(page, tiles) {
    await page.evaluate((coords) => {
        window.editor.setTiles(coords);
    }, tiles);
}

/** Run the wand at (x,y) with the given diagonal setting; return the selection. */
async function wandSelect(page, x, y, diagonal) {
    return await page.evaluate(({ px, py, diag }) => {
        document.getElementById('wand-diagonal').checked = diag;
        const tool = window.editor.currentTool;
        tool.selectedTiles = [];
        tool.floodFillSelect(window.editor, px, py, false);
        return {
            count: tool.selectedTiles.length,
            tiles: tool.selectedTiles.map(t => `${t.x},${t.y}`).sort(),
            status: document.getElementById('status-message').textContent
        };
    }, { px: x, py: y, diag: diagonal });
}

test.describe('Wand tool diagonal selection', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
        await clickLayer(page, 'Floor');
        // Biome_Warehouse != the Floor default (#ff6b6b), so painted tiles form a
        // region the wand can isolate. Painting the default colour would make the wand
        // select the entire layer, which is what the old tests accidentally did.
        await selectColor(page, 'Biome_Warehouse');
        await page.click('[data-tool="wand"]');
    });

    test('the diagonal option appears only for the wand tool', async ({ page }) => {
        expect(await page.evaluate(() => !!document.getElementById('wand-options')?.offsetParent)).toBe(true);
        expect(await page.locator('#wand-diagonal').count()).toBe(1);

        for (const tool of ['pencil', 'selection', 'bucket']) {
            await page.click(`[data-tool="${tool}"]`);
            await page.waitForTimeout(50);
            expect(await page.evaluate(() => !!document.getElementById('wand-options')?.offsetParent),
                `wand options visible for ${tool}`).toBe(false);
        }

        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press('w');
        await page.waitForTimeout(80);
        expect(await page.evaluate(() => !!document.getElementById('wand-options')?.offsetParent)).toBe(true);
    });

    test('an L-shape is fully selected without diagonals (all cardinal links)', async ({ page }) => {
        //   (10,11)
        //   (10,10) (11,10)
        await paint(page, [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 11 }]);

        const result = await wandSelect(page, 10, 10, false);

        expect(result.count).toBe(3);
        expect(result.tiles).toEqual(['10,10', '10,11', '11,10']);
    });

    test('a pure diagonal chain selects one tile without diagonals', async ({ page }) => {
        await paint(page, [{ x: 20, y: 20 }, { x: 21, y: 21 }, { x: 22, y: 22 }]);

        const result = await wandSelect(page, 20, 20, false);

        expect(result.count).toBe(1);
        expect(result.tiles).toEqual(['20,20']);
    });

    test('the same diagonal chain selects all three with diagonals enabled', async ({ page }) => {
        await paint(page, [{ x: 20, y: 20 }, { x: 21, y: 21 }, { x: 22, y: 22 }]);

        const result = await wandSelect(page, 20, 20, true);

        expect(result.count).toBe(3);
        expect(result.tiles).toEqual(['20,20', '21,21', '22,22']);
    });

    test('a solid block selects identically either way', async ({ page }) => {
        const block = [];
        for (let x = 30; x <= 32; x++) for (let y = 30; y <= 32; y++) block.push({ x, y });
        await paint(page, block);

        const cardinal = await wandSelect(page, 31, 31, false);
        const diagonal = await wandSelect(page, 31, 31, true);

        expect(cardinal.count).toBe(9);
        expect(diagonal.count).toBe(9);
        expect(diagonal.tiles).toEqual(cardinal.tiles);
    });

    test('diagonals bridge two blocks that touch only at a corner', async ({ page }) => {
        // Two 2x2 blocks meeting corner-to-corner at (41,41)/(42,42).
        const tiles = [];
        for (let x = 40; x <= 41; x++) for (let y = 40; y <= 41; y++) tiles.push({ x, y });
        for (let x = 42; x <= 43; x++) for (let y = 42; y <= 43; y++) tiles.push({ x, y });
        await paint(page, tiles);

        expect((await wandSelect(page, 40, 40, false)).count).toBe(4);
        expect((await wandSelect(page, 40, 40, true)).count).toBe(8);
    });

    test('the wand never selects tiles of a different colour', async ({ page }) => {
        await paint(page, [{ x: 50, y: 50 }, { x: 51, y: 50 }]);
        await selectColor(page, 'Biome_Bathroom');
        await paint(page, [{ x: 52, y: 50 }]);

        const result = await wandSelect(page, 50, 50, true);

        expect(result.count).toBe(2);
        expect(result.tiles).toEqual(['50,50', '51,50']);
    });

    test('clicking the layer default colour selects that whole region', async ({ page }) => {
        // There is no such thing as an "empty" tile — every layer is fully painted with
        // its default colour, so the wand always has something to select. The old test
        // expected a "No tiles" message that can never appear.
        const result = await wandSelect(page, 200, 200, false);

        const gridTiles = await page.evaluate(() => {
            const l = window.editor.layerManager.getActiveLayer();
            return l.width * l.height;
        });

        expect(result.count).toBe(gridTiles);
        expect(result.status).toContain('tiles');
    });

    test('the diagonal checkbox state persists across tool switches', async ({ page }) => {
        await page.check('#wand-diagonal');
        expect(await page.isChecked('#wand-diagonal')).toBe(true);

        await page.click('[data-tool="pencil"]');
        await page.click('[data-tool="wand"]');

        expect(await page.isChecked('#wand-diagonal')).toBe(true);
    });

    test('the wand works on a data layer too', async ({ page }) => {
        await clickLayer(page, 'Hazard');
        await selectColor(page, 'Hazard_Radiation');
        await page.click('[data-tool="wand"]');

        await paint(page, [{ x: 60, y: 60 }, { x: 61, y: 60 }, { x: 62, y: 60 }]);

        const result = await wandSelect(page, 60, 60, true);

        expect(result.count).toBe(3);
        expect(result.tiles).toEqual(['60,60', '61,60', '62,60']);
    });

    test('copying a wand selection stores exactly those tiles', async ({ page }) => {
        await paint(page, [
            { x: 70, y: 70 }, { x: 71, y: 71 }, { x: 72, y: 72 }, { x: 73, y: 73 }
        ]);
        await wandSelect(page, 70, 70, true);

        const copied = await page.evaluate(() => {
            window.editor.currentTool.copySelection(window.editor);
            const entry = window.clipboardHistory.getActive();
            return {
                historyLength: window.clipboardHistory.entries.length,
                tileCount: entry.tileCount,
                colors: Array.from(new Set(entry.data.tiles.map(t => t.tileset.color))),
                details: document.querySelector('.copy-history-details')?.textContent ?? ''
            };
        });

        expect(copied.historyLength).toBe(1);
        expect(copied.tileCount).toBe(4);
        expect(copied.colors).toEqual(['#4ecdc4']);
        expect(copied.details).toContain('4 tiles');
    });

    test('a lifted selection moves its tiles to the drop position', async ({ page }) => {
        // The old "should move diagonal selection after lifting" performed a few canvas
        // clicks and asserted nothing at all.
        await paint(page, [{ x: 80, y: 80 }, { x: 81, y: 81 }, { x: 82, y: 82 }]);
        await wandSelect(page, 80, 80, true);

        const result = await page.evaluate(() => {
            const editor = window.editor;
            const tool = editor.currentTool;
            const layer = editor.layerManager.getActiveLayer();

            tool.liftSelection(editor); // detach the tiles from the layer

            // Drag by (+5,+5): this is what onMouseMove does in 'moving' mode.
            const bounds = tool.getSelectionBounds();
            tool.mode = 'moving';
            tool.moveOffsetX = 0;
            tool.moveOffsetY = 0;
            tool.onMouseMove(editor, bounds.minX + 5, bounds.minY + 5);

            tool.finalizeSelection(editor); // stamp them back down

            return {
                origin: ['80,80', '81,81', '82,82'].map(k => layer.tileData.get(k) ?? null),
                moved: ['85,85', '86,86', '87,87'].map(k => layer.tileData.get(k) ?? null),
                isFloating: tool.isFloating
            };
        });

        expect(result.moved).toEqual(['#4ecdc4', '#4ecdc4', '#4ecdc4']);
        // liftSelection() uses layer.clearTile(), which removes the entry outright, so
        // the vacated cells read back as undefined rather than the layer default. They
        // still export as the default (exportRLEData fills unset cells), but note the
        // asymmetry with the eraser, which repaints instead of deleting.
        expect(result.origin).toEqual([null, null, null]);
        expect(result.isFloating).toBe(false);
    });
});
