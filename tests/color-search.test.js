/**
 * Colour palette search
 *
 * filterColors() (js/app.js) matches a query against three things: the tileset key
 * (`data-name`), the displayed label, and the enclosing SUB-category header
 * (Shared / Sky / Ground / Underground / Height / Difficulty / Hazards). While a
 * search is active it un-hides every tab so results can come from all of them.
 *
 * Corrections to the previous version of this file:
 *  - it searched for "Biomes" expecting a category match; there is no "Biomes"
 *    sub-category, so that test asserted behaviour the app never had;
 *  - "should maintain search state when switching layers" asserted the opposite of
 *    what updatePaletteForLayer does — it deliberately clears the search;
 *  - "should hide categories with no matches" and "auto-expand" queried
 *    `.color-category` / `.color-category-header`, markup that no longer exists;
 *  - "should handle special characters" asserted `page.title()`, which no search bug
 *    could ever change;
 *  - "search performance with rapid typing" measured the 50ms-per-character delay the
 *    test itself injected, then asserted the total was under 2s.
 */

const { test, expect, initializeEditor, clickLayer } = require('./test-base');

/** Names of every colour swatch currently visible anywhere in the palette. */
async function visibleColorNames(page) {
    return await page.evaluate(() =>
        Array.from(document.querySelectorAll('.palette-tab-content.active .color-subcategory:not(.hidden) .color-item:not(.hidden)'))
            .map(item => item.dataset.name)
    );
}

async function search(page, query) {
    await page.fill('#color-search', query);
    await page.waitForTimeout(150);
}

test.describe('Colour search', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
        // Biome layer: the palette has the most to filter here.
        await clickLayer(page, 'Floor');
    });

    test('the search box and its clear button start in the right state', async ({ page }) => {
        const input = page.locator('#color-search');
        await expect(input).toBeVisible();
        expect(await input.getAttribute('placeholder')).toBe('Search colors...');
        expect(await input.inputValue()).toBe('');

        const clearVisible = await page.evaluate(() =>
            document.getElementById('color-search-clear').classList.contains('visible')
        );
        expect(clearVisible).toBe(false);
    });

    test('typing reveals the clear button', async ({ page }) => {
        await search(page, 'ware');
        const clearVisible = await page.evaluate(() =>
            document.getElementById('color-search-clear').classList.contains('visible')
        );
        expect(clearVisible).toBe(true);
    });

    test('filtering by partial name keeps only matching swatches', async ({ page }) => {
        const before = await visibleColorNames(page);
        await search(page, 'carpark');
        const after = await visibleColorNames(page);

        expect(after.length).toBeGreaterThan(0);
        expect(after.length).toBeLessThan(before.length);
        // Every survivor genuinely matches, and nothing that matches was dropped.
        for (const name of after) {
            expect(name.toLowerCase(), `${name} does not match "carpark"`).toContain('carpark');
        }
        const expectedMatches = before.filter(n => n.toLowerCase().includes('carpark'));
        expect(after.sort()).toEqual(expectedMatches.sort());
    });

    test('search is case-insensitive', async ({ page }) => {
        await search(page, 'WAREHOUSE');
        const upper = await visibleColorNames(page);

        await search(page, '');
        await search(page, 'warehouse');
        const lower = await visibleColorNames(page);

        expect(upper.length).toBeGreaterThan(0);
        expect(upper.sort()).toEqual(lower.sort());
    });

    test('a sub-category name matches every colour inside it', async ({ page }) => {
        // "Biomes" is a TAB, not a sub-category — the sub-categories are Shared, Sky,
        // Ground and Underground, and those are what the search matches.
        await search(page, 'underground');

        const result = await page.evaluate(() => {
            const sub = Array.from(document.querySelectorAll('.palette-tab-content.active .color-subcategory'))
                .find(s => s.querySelector('.color-subcategory-header')?.textContent.trim() === 'Underground');
            if (!sub) return { found: false };
            return {
                found: true,
                hidden: sub.classList.contains('hidden'),
                total: sub.querySelectorAll('.color-item').length,
                visible: sub.querySelectorAll('.color-item:not(.hidden)').length
            };
        });

        expect(result.found).toBe(true);
        expect(result.hidden).toBe(false);
        expect(result.total).toBeGreaterThan(0);
        expect(result.visible).toBe(result.total);
    });

    test('the clear button restores the full palette', async ({ page }) => {
        const all = await visibleColorNames(page);

        await search(page, 'ware');
        const filtered = await visibleColorNames(page);
        expect(filtered.length).toBeLessThan(all.length);

        await page.click('#color-search-clear');
        await page.waitForTimeout(150);

        expect(await page.inputValue('#color-search')).toBe('');
        expect((await visibleColorNames(page)).sort()).toEqual(all.sort());
        expect(await page.evaluate(() =>
            document.getElementById('color-search-clear').classList.contains('visible')
        )).toBe(false);
    });

    test('Escape clears the search', async ({ page }) => {
        const all = await visibleColorNames(page);

        await search(page, 'ware');
        await page.press('#color-search', 'Escape');
        await page.waitForTimeout(150);

        expect(await page.inputValue('#color-search')).toBe('');
        expect((await visibleColorNames(page)).sort()).toEqual(all.sort());
    });

    test('a query with no matches shows the no-results message', async ({ page }) => {
        await search(page, 'xyznonexistent');

        const state = await page.evaluate(() => {
            const msg = document.querySelector('.search-no-results');
            return {
                exists: !!msg,
                visible: msg ? msg.style.display !== 'none' : false,
                text: msg ? msg.textContent : null,
                visibleColors: document.querySelectorAll('.color-item:not(.hidden)').length
            };
        });

        expect(state.exists).toBe(true);
        expect(state.visible).toBe(true);
        expect(state.text).toContain('No colors found');
        expect(state.text).toContain('xyznonexistent');
        expect(state.visibleColors).toBe(0);
    });

    test('sub-categories with no matches are hidden', async ({ page }) => {
        await search(page, 'warehouse');

        const subcategories = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.palette-tab-content.active .color-subcategory')).map(sub => ({
                name: sub.querySelector('.color-subcategory-header')?.textContent.trim(),
                hidden: sub.classList.contains('hidden'),
                visibleItems: sub.querySelectorAll('.color-item:not(.hidden)').length
            }))
        );

        expect(subcategories.length).toBeGreaterThan(1);
        for (const sub of subcategories) {
            // Hidden exactly when it has nothing to show — both directions.
            expect(sub.hidden, `${sub.name} hidden=${sub.hidden} with ${sub.visibleItems} matches`)
                .toBe(sub.visibleItems === 0);
        }
        expect(subcategories.some(s => !s.hidden)).toBe(true);
        expect(subcategories.some(s => s.hidden)).toBe(true);
    });

    test('a search reaches colours on tabs that are not currently open', async ({ page }) => {
        // filterColors() activates every tab while a query is present.
        await clickLayer(page, 'Floor'); // biomes tab
        await search(page, 'lost');

        const found = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.color-item:not(.hidden)')).map(i => i.dataset.name)
        );

        expect(found).toContain('Biome_LostAndFound'); // lives on the POI tab
    });

    test('special characters filter rather than crash', async ({ page }) => {
        for (const query of ['()', '[]', '{}', '._-', '123', '\\', '*']) {
            await search(page, query);

            const state = await page.evaluate(() => ({
                visible: Array.from(document.querySelectorAll('.color-item:not(.hidden)')).map(i => i.dataset.name),
                noResultsShown: (() => {
                    const msg = document.querySelector('.search-no-results');
                    return !!msg && msg.style.display !== 'none';
                })()
            }));

            // Treated as a literal substring: no matches for any of these, and the
            // no-results message must appear rather than the palette silently emptying.
            expect(state.visible, `query "${query}" matched ${state.visible}`).toEqual([]);
            expect(state.noResultsShown, `query "${query}" showed no message`).toBe(true);
        }
    });

    test('clicking a filtered colour selects it', async ({ page }) => {
        await search(page, 'bathroom');

        await page.locator('.color-item:not(.hidden)').first().click();
        await page.waitForTimeout(100);

        const selected = await page.evaluate(() => ({
            name: window.editor.selectedTileset.name,
            label: document.getElementById('current-color-label').textContent
        }));

        expect(selected.name).toBe('Biome_Bathroom');
        expect(selected.label.toLowerCase()).toContain('bathroom');
    });

    test('switching layers clears the search', async ({ page }) => {
        // updatePaletteForLayer() deliberately resets the query, because the new layer
        // shows a different set of colours. The old test asserted the opposite.
        await search(page, 'warehouse');
        expect(await page.inputValue('#color-search')).toBe('warehouse');

        await clickLayer(page, 'Difficulty');
        await page.waitForTimeout(150);

        expect(await page.inputValue('#color-search')).toBe('');
        const names = await visibleColorNames(page);
        expect(names.length).toBe(5); // all five difficulties selectable again
    });

    test('clearing the search on a layer switch does not re-expose other layers colours', async ({ page }) => {
        // Regression: updatePaletteForLayer() hid the irrelevant sub-categories and
        // THEN cleared the search; filterColors('') un-hides every sub-category, so the
        // clear undid the filtering and the Difficulty layer offered Height and Hazard
        // swatches — which paint colours that layer cannot export.
        await search(page, 'ware');
        await clickLayer(page, 'Difficulty');
        await page.waitForTimeout(150);

        const names = await visibleColorNames(page);
        expect(names.length).toBeGreaterThan(0);

        const foreign = await page.evaluate((shown) => {
            const tilesets = window.configManager.getTilesets();
            return shown.filter(n => tilesets[n]?.category !== 'Difficulty');
        }, names);

        expect(foreign, `non-Difficulty colours on show: ${foreign}`).toEqual([]);
    });

    test('search still works after generating a map', async ({ page }) => {
        await page.evaluate(() => window.generateTestMap());
        await page.waitForTimeout(500);
        await clickLayer(page, 'Floor');

        await search(page, 'warehouse');
        const names = await visibleColorNames(page);

        expect(names).toEqual(['Biome_Warehouse']);
    });

    test('filtering is applied synchronously on each keystroke', async ({ page }) => {
        // Replaces a "performance" test that only measured its own typing delay.
        // What matters is that the palette is correct after every character, with no
        // debounce leaving stale results behind.
        const input = page.locator('#color-search');
        const query = 'warehouse';
        let previousCount = Infinity;

        for (let i = 1; i <= query.length; i++) {
            await input.fill(query.slice(0, i));
            const visible = await page.evaluate(() =>
                document.querySelectorAll('.color-item:not(.hidden)').length
            );
            // Narrowing the query can never widen the result set.
            expect(visible, `after typing "${query.slice(0, i)}"`).toBeLessThanOrEqual(previousCount);
            previousCount = visible;
        }

        expect(previousCount).toBe(1);
    });
});
