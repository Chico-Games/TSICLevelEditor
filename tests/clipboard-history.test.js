/**
 * Clipboard history
 *
 * The old version drove everything through canvas clicks at guessed pixel offsets and
 * then asserted only on counts and status text. Most importantly, "should paste
 * different entries when switching active" — the test for the whole point of having a
 * history — only checked that the status message contained "Pasted", which is true of
 * every paste regardless of which entry it used.
 *
 * These drive the tools directly and assert on the tiles that actually move.
 */

const { test, expect, initializeEditor, clickLayer, selectColor } = require('./test-base');

/** Paint a rectangle of tiles with the currently selected colour. */
async function paintRect(page, x0, y0, x1, y1) {
    await page.evaluate(({ ax, ay, bx, by }) => {
        const tiles = [];
        for (let x = ax; x <= bx; x++) for (let y = ay; y <= by; y++) tiles.push({ x, y });
        window.editor.setTiles(tiles);
    }, { ax: x0, ay: y0, bx: x1, by: y1 });
}

/** Select a rectangle with the selection tool and copy it. */
async function selectAndCopy(page, x0, y0, x1, y1) {
    await page.evaluate(({ ax, ay, bx, by }) => {
        const editor = window.editor;
        const tool = editor.currentTool;
        tool.startX = ax; tool.startY = ay;
        tool.endX = bx; tool.endY = by;
        tool.isFloating = false;
        tool.copySelection(editor);
    }, { ax: x0, ay: y0, bx: x1, by: y1 });
}

async function historyState(page) {
    return await page.evaluate(() => ({
        modelCount: window.clipboardHistory.entries.length,
        activeIndex: window.clipboardHistory.activeIndex,
        labels: Array.from(document.querySelectorAll('.copy-history-label')).map(l => l.textContent),
        uiCount: document.querySelectorAll('.copy-history-item').length,
        colors: window.clipboardHistory.entries.map(
            e => Array.from(new Set(e.data.tiles.map(t => t.tileset.color)))
        )
    }));
}

test.describe('Clipboard history', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
        await clickLayer(page, 'Floor');
        await page.click('[data-tool="selection"]');
    });

    test('starts empty', async ({ page }) => {
        expect(await page.locator('.copy-history-empty').textContent()).toBe('No copies yet');
        const state = await historyState(page);
        expect(state.modelCount).toBe(0);
        expect(state.activeIndex).toBe(-1);
    });

    test('copying adds an entry describing what was copied', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');
        await paintRect(page, 10, 10, 12, 12);
        await selectAndCopy(page, 10, 10, 12, 12);

        const state = await historyState(page);
        expect(state.modelCount).toBe(1);
        expect(state.uiCount).toBe(1);
        expect(state.labels[0]).toBe('Copy 1');
        expect(state.activeIndex).toBe(0);

        const details = await page.locator('.copy-history-details').first().textContent();
        expect(details).toContain('9 tiles');
        expect(details).toContain('×');
        expect(details).toContain('3');
    });

    test('the newest copy becomes the active entry and sits first', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');
        await paintRect(page, 20, 20, 21, 21);
        await selectAndCopy(page, 20, 20, 21, 21);

        await selectColor(page, 'Biome_Bathroom');
        await paintRect(page, 30, 30, 31, 31);
        await selectAndCopy(page, 30, 30, 31, 31);

        const state = await historyState(page);
        expect(state.modelCount).toBe(2);
        expect(state.activeIndex).toBe(0);
        expect(state.colors[0]).toEqual(['#2563eb']); // Biome_Bathroom, most recent
        expect(state.colors[1]).toEqual(['#4ecdc4']); // Biome_Warehouse
    });

    test('the history is capped at ten entries, dropping the oldest', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');

        for (let i = 0; i < 12; i++) {
            await paintRect(page, 40 + i * 2, 40, 40 + i * 2, 40);
            await selectAndCopy(page, 40 + i * 2, 40, 40 + i * 2, 40);
        }

        const state = await historyState(page);
        expect(state.modelCount).toBe(10);
        expect(state.uiCount).toBe(10);
        // Labels count down from the newest: `Copy ${entries.length - index}`.
        expect(state.labels[0]).toBe('Copy 10');
        expect(state.labels[9]).toBe('Copy 1');
    });

    test('clicking an entry makes it active', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');
        for (let i = 0; i < 3; i++) {
            await paintRect(page, 50 + i * 2, 50, 50 + i * 2, 50);
            await selectAndCopy(page, 50 + i * 2, 50, 50 + i * 2, 50);
        }

        await page.locator('.copy-history-item').nth(1).click();
        await page.waitForTimeout(100);

        expect(await page.locator('.copy-history-item').nth(1).getAttribute('class')).toContain('active');
        expect((await historyState(page)).activeIndex).toBe(1);
    });

    test('pasting uses the ACTIVE entry, not simply the most recent', async ({ page }) => {
        // The behaviour the history exists for. The old test asserted only that the
        // status line said "Pasted", which any paste produces.
        await selectColor(page, 'Biome_Warehouse');
        await paintRect(page, 60, 60, 60, 60);
        await selectAndCopy(page, 60, 60, 60, 60);   // entry for #4ecdc4

        await selectColor(page, 'Biome_Bathroom');
        await paintRect(page, 62, 60, 62, 60);
        await selectAndCopy(page, 62, 60, 62, 60);   // entry for #2563eb (now active)

        const pasted = await page.evaluate(() => {
            const editor = window.editor;
            const tool = editor.currentTool;

            // Select the OLDER entry, then paste.
            window.clipboardHistory.setActive(1);
            tool.clearSelection(editor);
            tool.pasteSelection(editor);

            return {
                activeIndex: window.clipboardHistory.activeIndex,
                colors: Array.from(new Set(tool.selectionData.tiles.map(t => t.tileset.color))),
                status: document.getElementById('status-message').textContent
            };
        });

        expect(pasted.activeIndex).toBe(1);
        expect(pasted.colors).toEqual(['#4ecdc4']); // the older copy, not the newest
        expect(pasted.status).toContain('Pasted');
    });

    test('deleting an entry keeps the same entry active', async ({ page }) => {
        // ClipboardHistory.deleteEntry only re-clamped activeIndex when it ran past the
        // end. Removing an entry BEFORE the active one silently shifted the selection
        // onto a different copy, so the next paste stamped the wrong tiles.
        await selectColor(page, 'Biome_Warehouse');
        await paintRect(page, 70, 70, 70, 70);
        await selectAndCopy(page, 70, 70, 70, 70);          // becomes index 2

        await selectColor(page, 'Biome_Bathroom');
        await paintRect(page, 72, 70, 72, 70);
        await selectAndCopy(page, 72, 70, 72, 70);          // becomes index 1

        await selectColor(page, 'Biome_Kids');
        await paintRect(page, 74, 70, 74, 70);
        await selectAndCopy(page, 74, 70, 74, 70);          // index 0

        const result = await page.evaluate(() => {
            const history = window.clipboardHistory;
            history.setActive(2); // the oldest entry (#4ecdc4)
            const before = history.getActive().data.tiles[0].tileset.color;

            history.deleteEntry(0); // remove an entry BEFORE the active one

            return {
                before,
                count: history.entries.length,
                activeIndex: history.activeIndex,
                after: history.getActive()?.data.tiles[0].tileset.color ?? null
            };
        });

        expect(result.count).toBe(2);
        expect(result.after, 'active entry changed when an earlier entry was deleted')
            .toBe(result.before);
        expect(result.activeIndex).toBe(1);
    });

    test('deleting the active entry falls back to a valid one', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');
        for (let i = 0; i < 3; i++) {
            await paintRect(page, 80 + i * 2, 80, 80 + i * 2, 80);
            await selectAndCopy(page, 80 + i * 2, 80, 80 + i * 2, 80);
        }

        const result = await page.evaluate(() => {
            const history = window.clipboardHistory;
            history.setActive(2);
            history.deleteEntry(2);
            return {
                count: history.entries.length,
                activeIndex: history.activeIndex,
                hasActive: history.getActive() !== null
            };
        });

        expect(result.count).toBe(2);
        expect(result.activeIndex).toBe(1);
        expect(result.hasActive).toBe(true);
    });

    test('the delete button removes the entry from the panel', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');
        for (let i = 0; i < 3; i++) {
            await paintRect(page, 90 + i * 2, 90, 90 + i * 2, 90);
            await selectAndCopy(page, 90 + i * 2, 90, 90 + i * 2, 90);
        }

        await page.locator('.copy-history-delete').nth(1).click();
        await page.waitForTimeout(100);

        const state = await historyState(page);
        expect(state.uiCount).toBe(2);
        expect(state.modelCount).toBe(2);
    });

    test('a wand selection can be copied too', async ({ page }) => {
        await selectColor(page, 'Biome_Warehouse');
        await paintRect(page, 100, 100, 104, 100);

        await page.click('[data-tool="wand"]');
        const result = await page.evaluate(() => {
            const editor = window.editor;
            const tool = editor.currentTool;
            document.getElementById('wand-diagonal').checked = false;
            tool.floodFillSelect(editor, 100, 100, false);
            tool.copySelection(editor);
            return {
                selected: tool.selectedTiles.length,
                entries: window.clipboardHistory.entries.length,
                tileCount: window.clipboardHistory.getActive().tileCount,
                status: document.getElementById('status-message').textContent
            };
        });

        expect(result.selected).toBe(5);
        expect(result.entries).toBe(1);
        expect(result.tileCount).toBe(5);
        expect(result.status).toContain('history');
    });

    test('pasting with an empty history does nothing and does not crash', async ({ page }) => {
        const result = await page.evaluate(() => {
            const editor = window.editor;
            const tool = editor.currentTool;
            tool.pasteSelection(editor);
            return {
                floating: tool.isFloating,
                selectionData: tool.selectionData,
                emptyLabel: document.querySelector('.copy-history-empty')?.textContent ?? null
            };
        });

        expect(result.floating).toBe(false);
        expect(result.selectionData).toBeNull();
        expect(result.emptyLabel).toBe('No copies yet');
    });
});
