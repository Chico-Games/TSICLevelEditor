/**
 * Mod Catalog
 *
 * Gathers the biome set contributed by the active mod set (default mod + any add-on mods)
 * out of a loaded biomes config, and validates that a JSON-RLE map only references biomes
 * that exist in that set — i.e. "the loaded map doesn't contain biomes that aren't in the
 * active mod manifest."
 *
 * The active mod set is baked into config/biomes.json at sync time by tools/sync-biomes.mjs
 * (each biome carries a `mod` provenance field and config.biomeSource lists the mods).
 * This module reflects that at runtime for validation + UI.
 *
 * Pure functions; usable as a browser global (window.ModCatalog) or a Node module.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ModCatalog = api;
})(typeof self !== 'undefined' ? self : this, function () {

    /** Build a biome catalog from a parsed biomes config object. */
    function buildBiomeCatalog(config) {
        const biomes = [];
        const byValue = new Map();
        const byTag = new Map();
        const tilesets = (config && config.tilesets) || {};

        for (const [key, t] of Object.entries(tilesets)) {
            if (!key.startsWith('Biome_')) continue;
            const biome = {
                key,
                tag: t.tag || null,
                value: t.value,
                displayName: t.displayName || key,
                color: t.color || null,
                category: t.category || 'Biomes',
                mod: t.mod || null,
            };
            biomes.push(biome);
            byValue.set(biome.value, biome);
            if (biome.tag) byTag.set(biome.tag, biome);
        }

        const mods = (config && config.biomeSource && config.biomeSource.syncedFrom)
            ? config.biomeSource.syncedFrom.slice()
            : [...new Set(biomes.map(b => b.mod).filter(Boolean))];

        return {
            biomes,
            byValue,
            byTag,
            values: new Set(byValue.keys()),
            tags: new Set(byTag.keys()),
            mods,
        };
    }

    /**
     * Validate a JSON-RLE map's biome usage against a catalog.
     * Returns { errors, warnings } (arrays of strings).
     *
     * Checks:
     *  - every biome value used in any layer's biome_data is a biome defined by the active mod set
     *  - if the map carries color_mappings.biomes (the Unreal export bridge):
     *      - every entry `name` (Tile.Biome.*) is a known tag in the active mod set
     *      - the entry's `value` matches the catalog's value for that tag (palette drift)
     */
    function validateMapBiomes(data, catalog) {
        const errors = [];
        const warnings = [];
        const modList = catalog.mods.length ? catalog.mods.join(' + ') : '(none)';

        // 1) biome values painted into the layers
        if (Array.isArray(data && data.layers)) {
            const seen = new Set();
            for (const layer of data.layers) {
                const arr = layer && layer.biome_data;
                if (!Array.isArray(arr)) continue;
                for (const entry of arr) {
                    if (!entry || typeof entry.value !== 'number') continue;
                    if (catalog.values.has(entry.value) || seen.has(entry.value)) continue;
                    seen.add(entry.value);
                    errors.push(
                        `Biome value ${entry.value} is not defined by the active mod set (${modList}). ` +
                        `Enable the mod that adds it, re-sync config/biomes.json, or remove it from the map.`
                    );
                }
            }
        }

        // 2) color_mappings bridge (tag <-> palette index), when present
        const cm = data && data.color_mappings && data.color_mappings.biomes;
        if (cm && typeof cm === 'object') {
            for (const [hex, m] of Object.entries(cm)) {
                if (!m || !m.name) continue;
                const biome = catalog.byTag.get(m.name);
                if (!biome) {
                    errors.push(
                        `Map references biome "${m.name}" (${hex}) which is not in the active mod set (${modList}).`
                    );
                    continue;
                }
                if (typeof m.value === 'number' && m.value !== biome.value) {
                    warnings.push(
                        `Palette index drift for "${m.name}": map uses ${m.value}, active set defines ${biome.value}.`
                    );
                }
            }
        }

        return { errors, warnings };
    }

    return { buildBiomeCatalog, validateMapBiomes };
});
