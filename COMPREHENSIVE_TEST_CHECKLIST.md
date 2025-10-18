# Comprehensive Test Checklist

## Automated Tests
- [ ] Run full test suite: `npm test`
- [ ] All tests pass
- [ ] No console errors during tests

## Performance Tests (After Canvas Sizing Fix)
- [ ] test-direct-performance.html runs and shows good results
- [ ] Canvas size is viewport size (~1920x1080), NOT 8192x8192
- [ ] Visible tiles count is ~10k-20k, NOT 262k
- [ ] Render time is <50ms, NOT 300ms
- [ ] No saveState hitch when starting to draw
- [ ] Smooth drawing on 100% filled level

## Tools Testing

### Pencil Tool
- [ ] Click to draw single tile
- [ ] Drag to draw continuous line
- [ ] Brush size 1: draws single pixel
- [ ] Brush size 5: draws 5x5 square
- [ ] Brush size 10: draws 10x10 square
- [ ] Brush size 20: draws 20x20 square (largest)
- [ ] Circle shape works correctly
- [ ] Square shape works correctly
- [ ] Preview shows before drawing
- [ ] Works on all layers
- [ ] Respects layer lock
- [ ] Performance is smooth with large brush

### Eraser Tool
- [ ] Erases tiles correctly
- [ ] All brush sizes work (1, 5, 10, 20)
- [ ] Circle and square shapes work
- [ ] Preview shows red outline
- [ ] Works on all layers
- [ ] Respects layer lock

### Line Tool
- [ ] Click and drag creates line
- [ ] Preview shows while dragging
- [ ] Line appears on release
- [ ] All brush sizes work
- [ ] Diagonal lines work
- [ ] Horizontal lines work
- [ ] Vertical lines work
- [ ] Works on all layers

### Rectangle Tool
- [ ] Click and drag creates rectangle
- [ ] Preview shows while dragging
- [ ] Filled rectangle mode works
- [ ] Outline rectangle mode works
- [ ] All brush sizes work
- [ ] Works on all layers

### Bucket Fill Tool
- [ ] Fills connected area
- [ ] Respects boundaries
- [ ] Works on empty tiles
- [ ] Works on filled tiles
- [ ] Works on all layers
- [ ] Performance is acceptable (not instant but no crash)

### Eyedropper Tool
- [ ] Picks color from tile
- [ ] Updates selected tileset
- [ ] Shows tileset name
- [ ] Works on all layers
- [ ] Handles empty tiles

### Selection Tool
- [ ] Drag to create selection box
- [ ] Selection shows outline
- [ ] Can move selection
- [ ] Can copy selection
- [ ] Can paste selection
- [ ] Can delete selection contents
- [ ] Floating selection works
- [ ] Works across layers

### Wand Tool
- [ ] Selects connected tiles of same color
- [ ] Respects boundaries
- [ ] Shows selection outline
- [ ] Can move/copy/paste selection
- [ ] Works on all layers
- [ ] Performance is acceptable

### Pan Tool
- [ ] Click and drag to pan view
- [ ] Shift+Left mouse works
- [ ] Middle mouse works
- [ ] Smooth panning
- [ ] No lag during pan
- [ ] Works at all zoom levels

## Brush Options
- [ ] Brush size slider works (1-20)
- [ ] Number input works
- [ ] Brush shape toggle (square/circle) works
- [ ] Preview updates when changing size
- [ ] Preview updates when changing shape

## Layers Testing

### Layer Panel
- [ ] All 6 layers shown (Underground, Showfloor, Sky, Hazard, Difficulty, Height)
- [ ] Layer click selects layer
- [ ] Selected layer highlights
- [ ] Layer visibility toggle works
- [ ] Layer lock toggle works
- [ ] Layer opacity slider works (0-100%)
- [ ] Hover shows layer info
- [ ] Layer stats update

### Layer Interactions
- [ ] Drawing only affects active layer
- [ ] Locked layer cannot be edited
- [ ] Hidden layer not shown
- [ ] Opacity affects visibility
- [ ] Multiple layers render correctly
- [ ] Layer order correct (first layer on top)

### Layer Types
- [ ] Underground layer accepts correct tilesets
- [ ] Showfloor layer accepts correct tilesets
- [ ] Sky layer accepts correct tilesets
- [ ] Hazard layer accepts correct tilesets
- [ ] Difficulty layer accepts correct tilesets
- [ ] Height layer accepts correct tilesets
- [ ] Invalid tilesets show warning

## Color Palette

### Palette Organization
- [ ] Biomes folder works
- [ ] Height folder works
- [ ] Difficulty folder works
- [ ] Hazards folder works
- [ ] Folders expand/collapse
- [ ] All 35 colors load

### Color Selection
- [ ] Click color selects tileset
- [ ] Selected color highlights
- [ ] Color name shows
- [ ] Color hex value shows
- [ ] Color search works
- [ ] Filter by category works

## Zoom and View

### Zoom Controls
- [ ] Zoom in button works
- [ ] Zoom out button works
- [ ] Mouse wheel zoom works
- [ ] Zoom to fit button works
- [ ] Zoom percentage shows correctly
- [ ] Adaptive zoom increments work (5% at low zoom, 10% at high)
- [ ] Zoom range 5% - 800% enforced
- [ ] Zoom centers on mouse position

### Grid Display
- [ ] Grid toggle works
- [ ] Grid shows at zoom >= 50%
- [ ] Grid hides at zoom < 50%
- [ ] Grid visible at all appropriate zoom levels
- [ ] Grid boundary (blue border) shows

## Minimap
- [ ] Minimap shows full level
- [ ] Minimap updates when drawing
- [ ] Minimap shows viewport rectangle
- [ ] Click minimap moves viewport
- [ ] Drag viewport rectangle pans
- [ ] Minimap updates after drawing (not during)

## File Operations

### Save/Open
- [ ] Save button works
- [ ] Saves as JSON
- [ ] Filename includes timestamp
- [ ] Open button works
- [ ] Loads saved file correctly
- [ ] All layers load
- [ ] Grid size loads
- [ ] Zoom/pan preserved

### Export
- [ ] Export PNG works
- [ ] PNG shows all visible layers
- [ ] PNG respects layer opacity
- [ ] Hidden layers not exported
- [ ] Export RLE works
- [ ] RLE format valid
- [ ] RLE compression works

## Undo/Redo
- [ ] Undo button works
- [ ] Redo button works
- [ ] Undo/redo history correct
- [ ] Max history size enforced (50 states)
- [ ] Undo/redo updates canvas
- [ ] Keyboard shortcuts work (Ctrl+Z, Ctrl+Y)
- [ ] After performance fix: no freeze when undoing

## Clipboard
- [ ] Copy selection works (Ctrl+C)
- [ ] Cut selection works (Ctrl+X)
- [ ] Paste selection works (Ctrl+V)
- [ ] Clipboard history tracked
- [ ] Multiple paste works

## Keyboard Shortcuts
- [ ] P - Pencil tool
- [ ] E - Eraser tool
- [ ] L - Line tool
- [ ] B - Bucket fill tool
- [ ] I - Eyedropper tool
- [ ] S - Selection tool
- [ ] W - Wand tool
- [ ] V - Pan tool
- [ ] G - Toggle grid
- [ ] Ctrl+Z - Undo
- [ ] Ctrl+Y - Redo
- [ ] Ctrl+C - Copy
- [ ] Ctrl+X - Cut
- [ ] Ctrl+V - Paste
- [ ] [ - Decrease brush size
- [ ] ] - Increase brush size

## Grid Size Options
- [ ] 256x256 works
- [ ] 512x512 works
- [ ] 1024x1024 works (if supported)
- [ ] 2048x2048 works (if supported)
- [ ] Resize grid preserves data
- [ ] Performance good at all sizes

## Edge Cases

### Empty Level
- [ ] Works with no tiles
- [ ] All tools work
- [ ] No errors

### 100% Filled Level
- [ ] Drawing performance good
- [ ] No lag or freeze
- [ ] All tools work
- [ ] Panning smooth
- [ ] Zooming smooth
- [ ] Rendering <50ms per frame

### Large Brush
- [ ] Size 20 brush works
- [ ] No lag when drawing
- [ ] Preview shows correctly
- [ ] All tools work with large brush

### Extreme Zoom
- [ ] 5% zoom works
- [ ] 800% zoom works
- [ ] Drawing works at all zooms
- [ ] Performance acceptable

## Browser Compatibility
- [ ] Chrome - all features work
- [ ] Edge - all features work
- [ ] Firefox - all features work (may be slightly slower)
- [ ] Safari - all features work (if available)

## Console Errors
- [ ] No errors during normal use
- [ ] No errors when switching tools
- [ ] No errors when drawing
- [ ] No errors when saving/loading
- [ ] No localStorage quota errors (fixed)

## Performance Benchmarks (After Fixes)

### Empty Level
- [ ] Render time: <10ms
- [ ] FPS: 60
- [ ] Click response: instant

### 50% Filled Level
- [ ] Render time: <30ms
- [ ] FPS: 30-60
- [ ] Click response: instant

### 100% Filled Level (Worst Case)
- [ ] Render time: <50ms (NOT 300ms!)
- [ ] FPS: 20-50 (NOT 3!)
- [ ] Click response: instant (NOT 1-2 seconds!)
- [ ] No saveState hitch
- [ ] Smooth continuous drawing
- [ ] Canvas size: viewport (~1920x1080), NOT 8192x8192
- [ ] Visible tiles: ~10k-20k, NOT 262k
- [ ] Chrome INP: <200ms (NOT 2000ms!)

## Stress Tests
- [ ] Draw continuously for 30 seconds - no crashes
- [ ] Rapid tool switching - no crashes
- [ ] Rapid zoom in/out - no crashes
- [ ] Pan to all corners - no crashes
- [ ] Fill/erase large areas - no crashes
- [ ] 100 undo/redo operations - no crashes

## Visual Quality
- [ ] Colors render correctly
- [ ] No gaps between tiles
- [ ] Grid lines crisp
- [ ] Zoom maintains quality
- [ ] Layer blending correct
- [ ] Opacity works smoothly

## User Experience
- [ ] UI responsive
- [ ] No unexpected delays
- [ ] Tooltips helpful
- [ ] Status bar updates
- [ ] Error messages clear
- [ ] Loading states shown

---

## Test Results Summary

Date: _____________
Tester: _____________

Automated Tests: _____ / _____ passed

Manual Tests: _____ / _____ passed

Critical Issues: ______________

Performance: ⬜ Excellent ⬜ Good ⬜ Acceptable ⬜ Poor

Overall Status: ⬜ PASS ⬜ FAIL

Notes:
