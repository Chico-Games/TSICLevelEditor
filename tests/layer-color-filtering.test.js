/**
 * Layer-specific colour filtering and smart colour selection
 *
 * The palette was rebuilt as tabs (`.palette-tab` + `.palette-tab-content` holding
 * `.color-subcategory` blocks). The old `.color-category` / `.color-category-header`
 * markup this file queried through getVisibleColorCategories() no longer exists, so
 * that helper returned [] — which meant every `expect(categories).not.toContain('Height')`
 * assertion passed no matter what the palette was showing.
 *
 * It also imported `test` from @playwright/test rather than ./test-base, opting out of
 * the console-error monitoring the rest of the suite relies on.
 */

const {
    test, expect, initializeEditor, clickLayer, getSelectedColor,
    getVisibleColorSubcategories, getVisibleColorNames, selectColor
} = require('./test-base');

// Which palette tab and sub-categories each layer type should expose, and which
// tileset category its colours must come from.
const LAYER_PALETTE = {
    Height: { tab: 'other', subcategories: ['Height'], category: 'Height' },
    Difficulty: { tab: 'other', subcategories: ['Difficulty'], category: 'Difficulty' },
    Hazard: { tab: 'other', subcategories: ['Hazards'], category: 'Hazards' },
    Floor: { tab: 'biomes', subcategories: ['Shared', 'Sky', 'Ground', 'Underground'], category: 'Biomes' },
    Sky: { tab: 'biomes', subcategories: ['Shared', 'Sky', 'Ground', 'Underground'], category: 'Biomes' },
    Underground: { tab: 'biomes', subcategories: ['Shared', 'Sky', 'Ground', 'Underground'], category: 'Biomes' },
    SkyHeightOffset: { tab: 'other', subcategories: ['Height'], category: 'Height' },
    UndergroundHeightOffset: { tab: 'other', subcategories: ['Height'], category: 'Height' }
};

async function activeTab(page) {
    return await page.evaluate(() =>
        document.querySelector('.palette-tab.active')?.dataset.tab ?? null
    );
}

test.describe('Layer colour filtering', () => {
    test.beforeEach(async ({ page }) => {
        await initializeEditor(page);
    });

    for (const [layerName, expected] of Object.entries(LAYER_PALETTE)) {
        test(`${layerName} shows only its own colours`, async ({ page }) => {
            await clickLayer(page, layerName);

            expect(await activeTab(page), `${layerName} active tab`).toBe(expected.tab);

            const subcategories = await getVisibleColorSubcategories(page);
            expect(subcategories.sort()).toEqual([...expected.subcategories].sort());

            // Every selectable swatch must belong to the layer's category — this is the
            // assertion the old helper could never make, since it saw nothing at all.
            const names = await getVisibleColorNames(page);
            expect(names.length).toBeGreaterThan(0);

            const wrongCategory = await page.evaluate(({ shown, category }) => {
                const tilesets = window.configManager.getTilesets();
                return shown.filter(name => {
                    const t = tilesets[name];
                    if (!t) return true;
                    // POI is a sub-flavour of Biomes in the palette.
                    return category === 'Biomes'
                        ? !(t.category === 'Biomes' || t.category === 'POI')
                        : t.category !== category;
                });
            }, { shown: names, category: expected.category });

            expect(wrongCategory, `${layerName} shows foreign colours: ${wrongCategory}`).toEqual([]);
        });
    }

    test('the selected colour always belongs to the active layer', async ({ page }) => {
        // Includes the initial state: startup used to leave a Difficulty colour
        // selected while the Height layer was active.
        const initial = await getSelectedColor(page);
        expect(initial.category).toBe('Height');

        for (const [layerName, expected] of Object.entries(LAYER_PALETTE)) {
            await clickLayer(page, layerName);
            const selected = await getSelectedColor(page);
            expect(selected, `${layerName} has no selected colour`).not.toBeNull();

            const ok = expected.category === 'Biomes'
                ? ['Biomes', 'POI'].includes(selected.category)
                : selected.category === expected.category;

            expect(ok, `${layerName} selected ${selected.name} (${selected.category})`).toBe(true);
        }
    });

    test('switching from a biome layer to Height replaces an invalid colour', async ({ page }) => {
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Restaurant');
        expect((await getSelectedColor(page)).name).toBe('Biome_Restaurant');

        await clickLayer(page, 'Height');
        const selected = await getSelectedColor(page);
        expect(selected.category).toBe('Height');
        expect(selected.name).toMatch(/^Height_/);
    });

    test('switching from Height to a biome layer replaces an invalid colour', async ({ page }) => {
        await clickLayer(page, 'Height');
        await selectColor(page, 'Height_2');
        expect((await getSelectedColor(page)).name).toBe('Height_2');

        await clickLayer(page, 'Floor');
        const selected = await getSelectedColor(page);
        expect(['Biomes', 'POI']).toContain(selected.category);
        expect(selected.name).toMatch(/^Biome_/);
    });

    test('a still-valid colour is kept when switching between biome layers', async ({ page }) => {
        await clickLayer(page, 'Floor');
        await selectColor(page, 'Biome_Restaurant');

        await clickLayer(page, 'Sky');
        expect((await getSelectedColor(page)).name).toBe('Biome_Restaurant');

        await clickLayer(page, 'Underground');
        expect((await getSelectedColor(page)).name).toBe('Biome_Restaurant');
    });

    test('an invalid colour is replaced with the first valid one for that layer', async ({ page }) => {
        await clickLayer(page, 'Difficulty');
        await selectColor(page, 'Difficulty_Nightmare');

        await clickLayer(page, 'Height');

        const selected = await getSelectedColor(page);
        const firstHeight = await page.evaluate(() => {
            for (const [name, tileset] of Object.entries(window.configManager.getTilesets())) {
                if (tileset.category === 'Height') return name;
            }
            return null;
        });

        expect(selected.name).toBe(firstHeight);
    });

    test('repeated layer switches keep the palette in step', async ({ page }) => {
        const sequence = ['Height', 'Difficulty', 'Hazard', 'Floor', 'Sky', 'Height', 'Underground'];

        for (const layerName of sequence) {
            await clickLayer(page, layerName);
            const expected = LAYER_PALETTE[layerName];

            expect(await activeTab(page), `tab after ${layerName}`).toBe(expected.tab);
            expect((await getVisibleColorSubcategories(page)).sort(), `subcategories after ${layerName}`)
                .toEqual([...expected.subcategories].sort());
        }
    });

    test('painting after a layer switch writes a colour that layer can export', async ({ page }) => {
        // The end-to-end reason this filtering exists.
        for (const layerName of Object.keys(LAYER_PALETTE)) {
            await clickLayer(page, layerName);
            await page.evaluate(() => window.editor.setTiles([{ x: 7, y: 7 }]));
        }

        const validation = await page.evaluate(() => {
            const exported = window.editor.layerManager.exportRLEData('T', 'T', 1);
            return window.rleValidator.validate(exported);
        });

        expect(validation.errors, validation.errors.join('\n')).toEqual([]);
        expect(validation.valid).toBe(true);
    });
});
