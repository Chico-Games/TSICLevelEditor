/**
 * Import / Export toolbar
 *
 * This file used to assert the opposite of the current design: that `#btn-save` and
 * `#btn-load` exist with the label "Open", and that `#btn-export` does NOT exist. The
 * save/load system was replaced by a multi-project cache with Import/Export in efeb547,
 * so every one of those assertions was pinned to a UI that had been deleted — and the
 * suite could not tell anyone, because the tests only timed out.
 *
 * Ctrl+S exports, Ctrl+O imports, Ctrl+N opens the New Project prompt (it does NOT
 * clear the canvas, which several other test files also assumed).
 */

const { test, expect, initializeEditor } = require('./test-base');

test.describe('Import / Export toolbar', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    test('the toolbar exposes the current project actions', async ({ page }) => {
        const buttons = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.toolbar-section button'))
                .filter(b => b.offsetParent !== null)
                .map(b => ({ id: b.id, text: b.textContent.trim() }))
        );

        const byId = Object.fromEntries(buttons.map(b => [b.id, b.text]));

        expect(byId['btn-new']).toBe('New');
        expect(byId['btn-import']).toBe('Import');
        expect(byId['btn-export']).toBe('Export');
        expect(byId['btn-save-as']).toBe('Save As');

        // The old Save/Open buttons really are gone.
        expect(byId).not.toHaveProperty('btn-save');
        expect(byId).not.toHaveProperty('btn-load');
    });

    test('Export downloads a level file with the expected shape', async ({ page }) => {
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
        await page.click('#btn-export');
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toMatch(/\.json$/);

        const path = await download.path();
        expect(path).toBeTruthy();

        const fs = require('fs');
        const parsed = JSON.parse(fs.readFileSync(path, 'utf8'));

        // Not just "a file arrived" — the file must be a usable level.
        expect(parsed).toHaveProperty('metadata');
        expect(parsed.metadata.world_size).toBe(256);
        expect(Array.isArray(parsed.layers)).toBe(true);
        expect(parsed.layers).toHaveLength(8);
        expect(parsed).toHaveProperty('color_mappings');
    });

    test('Ctrl+S triggers the same export', async ({ page }) => {
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press('Control+S');
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toMatch(/\.json$/);
    });

    test('an exported level re-imports to the same tiles', async ({ page }) => {
        // The round-trip is what "Export" is for; the old file never checked it.
        await page.evaluate(() => {
            window.editor.layerManager.setActiveLayer(4); // Floor
            window.editor.selectTileset('Biome_Warehouse');
            window.editor.setTiles([{ x: 11, y: 12 }, { x: 12, y: 12 }]);
        });

        const result = await page.evaluate(() => {
            const manager = window.editor.layerManager;
            const before = manager.layers.map(l => new Map(l.tileData));

            const exported = manager.exportRLEData('RoundTrip', 'test', 7);
            const text = JSON.stringify(exported);

            manager.importRLEData(JSON.parse(text), window.configManager);

            const diffs = [];
            manager.layers.forEach((layer, i) => {
                for (const [key, color] of before[i]) {
                    if (layer.tileData.get(key) !== color && diffs.length < 5) {
                        diffs.push({ layer: layer.layerType, key, was: color, now: layer.tileData.get(key) });
                    }
                }
            });
            return { diffs, painted: manager.layers[4].tileData.get('11,12') };
        });

        expect(result.diffs, JSON.stringify(result.diffs)).toEqual([]);
        expect(result.painted).toBe('#4ecdc4');
    });

    test('Import opens the hidden file input', async ({ page }) => {
        const fileInput = page.locator('#file-input');
        await expect(fileInput).toHaveCount(1);
        expect(await fileInput.isVisible()).toBe(false);

        // Assert the click actually reaches the input, rather than just checking that
        // the status text has no "error" in it (which it never would).
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
        await page.click('#btn-import');
        const chooser = await chooserPromise;

        expect(chooser).toBeTruthy();
        expect(await chooser.element().getAttribute('id')).toBe('file-input');
    });

    test('Ctrl+O opens the same file picker', async ({ page }) => {
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press('Control+O');
        const chooser = await chooserPromise;

        expect(await chooser.element().getAttribute('id')).toBe('file-input');
    });

    test('Ctrl+N opens the New Project prompt and leaves the canvas alone', async ({ page }) => {
        // Documented explicitly because several other test files assumed Ctrl+N was a
        // "clear the level" shortcut and used it to reset between measurements.
        await page.evaluate(() => {
            window.editor.layerManager.setActiveLayer(4);
            window.editor.selectTileset('Biome_Warehouse');
            window.editor.setTiles([{ x: 20, y: 20 }]);
        });

        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press('Control+N');
        await page.waitForTimeout(300);

        const state = await page.evaluate(() => ({
            nameInputVisible: !!document.getElementById('project-name-input')?.offsetParent,
            createVisible: !!document.getElementById('btn-create-project')?.offsetParent,
            stillPainted: window.editor.layerManager.layers[4].tileData.get('20,20'),
            tileCount: window.editor.layerManager.layers[4].tileData.size
        }));

        expect(state.nameInputVisible).toBe(true);
        expect(state.createVisible).toBe(true);
        expect(state.stillPainted).toBe('#4ecdc4');
        expect(state.tileCount).toBe(256 * 256);
    });

    test('no handler references the removed export dialog elements', async ({ page }) => {
        const consoleErrors = [];
        page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press('Control+E'); // the old export shortcut
        await page.waitForTimeout(300);

        await page.click('#btn-new');
        await page.waitForTimeout(200);
        await page.click('#btn-cancel-new-project');
        await page.waitForTimeout(200);

        const relevant = [...consoleErrors, ...pageErrors].filter(err =>
            /export-dialog|export-confirm|export-cancel|btn-save\b|btn-load\b/.test(err)
        );

        expect(relevant).toEqual([]);
        // #export-dialog was removed along with the old flow.
        expect(await page.locator('#export-dialog').count()).toBe(0);
    });
});
