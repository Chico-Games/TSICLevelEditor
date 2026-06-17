#!/usr/bin/env node
/**
 * sync-biomes.mjs — Regenerate the biome tilesets in config/biomes.json from the
 * TSIC default-project mod export (vendor/default-project) plus optional add-on mods.
 *
 * The mod export is the source of truth for each biome's COLOR, DISPLAY NAME, TAG and ROLE.
 * Editor-only presentation (icon, category, description) and the canonical palette VALUE are
 * preserved from the existing config for stability; brand-new modded biomes get appended
 * indices and sensible role-based defaults.
 *
 * Usage:
 *   node tools/sync-biomes.mjs [--project <dir>] [--mods <dir> ...] [--out <file>] [--check]
 *
 *   --project <dir>  Default mod export dir (default: vendor/default-project)
 *   --mods <dirs>    Additional add-on mod dirs to overlay (last-writer-wins by tag)
 *   --out <file>     Config to (re)write (default: config/biomes.json)
 *   --check          Don't write; exit 1 if the generated config differs (CI/hook drift guard)
 *
 * Biome identity is the gameplay tag (Tile.Biome.*). `value` is a per-file palette index,
 * stable for default biomes so previously-exported maps keep working.
 */

import fs from 'node:fs';
import path from 'node:path';

// ---- arg parsing -----------------------------------------------------------
function parseArgs(argv) {
  const out = { project: 'vendor/default-project', mods: [], out: 'config/biomes.json', check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') out.project = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--check') out.check = true;
    else if (a === '--mods') { while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out.mods.push(argv[++i]); }
    else { console.error(`Unknown arg: ${a}`); process.exit(2); }
  }
  return out;
}

// ---- helpers ---------------------------------------------------------------
const ROLE_CATEGORY = { POI: 'POI' }; // everything else -> 'Biomes'
const ROLE_ICON = { ENVIRONMENTAL: '🟦', STRUCTURAL: '⬛', POI: '📍', SKY: '☁️', SPAWN: '🎯' };

const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
const toHex2 = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0').toUpperCase();
const colorToHex = (c = {}) => `#${toHex2(c.r)}${toHex2(c.g)}${toHex2(c.b)}`;
const shortNameFromTag = (tag, id) =>
  (tag && tag.replace(/^Tile\.Biome\./, '')) || (id && id.replace(/^BD_/, '')) || id;

function readModId(modDir) {
  const mj = path.join(modDir, 'mod.json');
  if (fs.existsSync(mj)) {
    try { return JSON.parse(fs.readFileSync(mj, 'utf8')).id || path.basename(modDir); } catch { /* fall through */ }
  }
  return path.basename(modDir);
}

/** Read all BD_*.json biome definitions from a mod dir. Returns [] if none. */
function readBiomeDefs(modDir) {
  const dir = path.join(modDir, 'biome_definitions');
  if (!fs.existsSync(dir)) return [];
  const modId = readModId(modDir);
  const defs = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.json') || f.startsWith('.')) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { console.error(`  ! skipping ${f}: ${e.message}`); continue; }
    const p = j.properties || {};
    const tag = p.biome_tag_name || p.biome_tag;
    if (!tag) { console.error(`  ! ${f} has no biome_tag_name; skipping`); continue; }
    defs.push({
      id: j.id,
      tag,
      shortName: shortNameFromTag(tag, j.id),
      displayName: p.display_name || shortNameFromTag(tag, j.id),
      hex: colorToHex(p.map_color),
      role: (p.role && p.role.name) || 'ENVIRONMENTAL',
      modId,
    });
  }
  return defs;
}

// ---- main ------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));

if (!fs.existsSync(args.out)) {
  console.error(`Output config not found: ${args.out} (run from the repo root)`);
  process.exit(2);
}
const config = JSON.parse(fs.readFileSync(args.out, 'utf8'));
const oldTilesets = config.tilesets || {};

// Gather biomes: default project first, then add-on mods (last-writer-wins by tag).
const modDirs = [args.project, ...args.mods];
const byTag = new Map();
for (const dir of modDirs) {
  const defs = readBiomeDefs(dir);
  if (!defs.length) { console.error(`  (no biome_definitions in ${dir})`); continue; }
  for (const d of defs) byTag.set(d.tag, d); // later mods override
  console.error(`  loaded ${defs.length} biome(s) from ${readModId(dir)} (${dir})`);
}
const biomes = [...byTag.values()];
if (!biomes.length) { console.error('No biomes found in any mod dir. Aborting.'); process.exit(2); }

// Stable value assignment: reuse existing enum values; append new biomes deterministically.
const existingEnum = (config.enumMappings && config.enumMappings.ETileBiome) || {};
const usedValues = new Set(Object.values(existingEnum));
let nextValue = (usedValues.size ? Math.max(...usedValues) : -1) + 1;
const valueOf = new Map();
// 1) reuse for known biomes
for (const b of biomes) if (b.shortName in existingEnum) valueOf.set(b.tag, existingEnum[b.shortName]);
// 2) append for new biomes, sorted by shortName for determinism
for (const b of biomes.filter((x) => !valueOf.has(x.tag)).sort((a, z) => a.shortName.localeCompare(z.shortName))) {
  while (usedValues.has(nextValue)) nextValue++;
  valueOf.set(b.tag, nextValue);
  usedValues.add(nextValue);
}

// Rebuild tilesets: drop all Biome_* entries, keep the rest (Difficulty_/Hazard_/Height_), re-add biomes.
const newTilesets = {};
for (const [k, v] of Object.entries(oldTilesets)) if (!k.startsWith('Biome_')) newTilesets[k] = v;

const diff = { added: [], removed: [], changed: [] };
const oldBiomeKeys = new Set(Object.keys(oldTilesets).filter((k) => k.startsWith('Biome_')));

for (const b of biomes.sort((a, z) => valueOf.get(a.tag) - valueOf.get(z.tag))) {
  const key = `Biome_${b.shortName}`;
  const prev = oldTilesets[key];
  const entry = {
    color: b.hex,
    value: valueOf.get(b.tag),
    icon: (prev && prev.icon) || ROLE_ICON[b.role] || '🟦',
    tag: b.tag,
    category: (prev && prev.category) || ROLE_CATEGORY[b.role] || 'Biomes',
    displayName: b.displayName,
    description: (prev && prev.description) || b.displayName,
    mod: b.modId,
  };
  newTilesets[key] = entry;
  oldBiomeKeys.delete(key);
  if (!prev) diff.added.push(`${key} (#${entry.value}, ${b.modId})`);
  else {
    const ch = [];
    if (prev.color !== entry.color) ch.push(`color ${prev.color}->${entry.color}`);
    if (prev.value !== entry.value) ch.push(`value ${prev.value}->${entry.value}`);
    if (prev.displayName !== entry.displayName) ch.push(`name "${prev.displayName}"->"${entry.displayName}"`);
    if (prev.tag !== entry.tag) ch.push(`tag ${prev.tag}->${entry.tag}`);
    if (ch.length) diff.changed.push(`${key}: ${ch.join(', ')}`);
  }
}
for (const k of oldBiomeKeys) diff.removed.push(k);

config.tilesets = newTilesets;

// Regenerate enumMappings.ETileBiome and the biome value range from the value map.
const enumMap = {};
for (const b of biomes.sort((a, z) => valueOf.get(a.tag) - valueOf.get(z.tag))) enumMap[b.shortName] = valueOf.get(b.tag);
config.enumMappings = config.enumMappings || {};
config.enumMappings.ETileBiome = enumMap;
const maxValue = Math.max(...valueOf.values());
if (Array.isArray(config.dataTypes)) {
  const bt = config.dataTypes.find((d) => d.type === 'biome');
  if (bt) bt.valueRange = [0, maxValue];
}

// Provenance: record which mods this config was synced from.
config.biomeSource = {
  syncedFrom: modDirs.map((d) => readModId(d)),
  biomeCount: biomes.length,
  maxBiomeValue: maxValue,
};

const serialized = JSON.stringify(config, null, 2) + '\n';

// ---- report ----------------------------------------------------------------
console.error('\n=== biome sync summary ===');
console.error(`mods: ${config.biomeSource.syncedFrom.join(' + ')}`);
console.error(`biomes: ${biomes.length} (values 0..${maxValue})`);
if (diff.added.length) console.error(`added (${diff.added.length}): ${diff.added.join(', ')}`);
if (diff.removed.length) console.error(`removed (${diff.removed.length}): ${diff.removed.join(', ')}`);
if (diff.changed.length) console.error(`changed (${diff.changed.length}):\n  - ${diff.changed.join('\n  - ')}`);
if (!diff.added.length && !diff.removed.length && !diff.changed.length) console.error('no biome changes.');

// ---- write / check ---------------------------------------------------------
const current = fs.readFileSync(args.out, 'utf8');
if (args.check) {
  if (current !== serialized) {
    console.error(`\nDRIFT: ${args.out} is out of date with the mod definitions. Run: node tools/sync-biomes.mjs`);
    process.exit(1);
  }
  console.error('\nOK: config is in sync.');
  process.exit(0);
}
if (current === serialized) { console.error(`\n${args.out} already up to date.`); process.exit(0); }
fs.writeFileSync(args.out, serialized);
console.error(`\nwrote ${args.out}`);
