# TSIC Level Editor - Rendering Pipeline Analysis

## Executive Summary

The TSIC Level Editor uses a three-canvas architecture with viewport culling and layer caching.

**Main render loop:** js/editor.js:753-812  
**Rendering order:** Background → Layers → Grid → Guides → (INSERT MAZE HERE)  
**Insert point:** After line 806, before ctx.restore()

---

## 1. MAIN RENDER LOOP STRUCTURE

**File:** js/editor.js:753-812

Render execution order:
1. Clear background (line 759)
2. Save canvas state (line 762)
3. Translate for pan (line 763)
4. Scale for zoom (line 764)
5. Render all visible layers (lines 780-789)
6. Render grid boundary (lines 793-796)
7. Render grid lines with culling (lines 798-801)
8. Render guide lines (lines 804-806)
9. **MAZE OVERLAY INSERTION POINT** (after line 806)
10. Restore canvas state (line 808)
11. Update statistics (line 811)

---

## 2. LAYER CACHING SYSTEM

**File:** js/layers.js:368-451

Each WorldLayer has:
- `tileData`: Map of "x,y" → color
- `cacheCanvas`: Offscreen canvas
- `cacheDirty`: Boolean for full re-render
- `dirtyTiles`: Set for incremental updates

### Cache Rendering Modes

**Full Render (cacheDirty=true):**
- Clear cache, render all tiles
- Batch tiles by color using Path2D
- Lines 399-428

**Incremental (dirtyTiles.size>0):**
- Clear and re-render only dirty tiles
- Lines 431-449

### Cache Invalidation

Marked dirty on: import, resize, clear, undo  
Dirty tiles tracked on: setTile, clearTile

---

## 3. GRID & GUIDE RENDERING

### Grid Lines (renderGrid)
**Lines:** 839-865

Viewport culling:
```javascript
const startX = Math.floor(-offsetX / (tileSize * zoom));
const startY = Math.floor(-offsetY / (tileSize * zoom));
const endX = startX + ceil(canvas.width / (tileSize * zoom));
const endY = startY + ceil(canvas.height / (tileSize * zoom));
```

Only visible lines rendered. Batched with beginPath().

### Guide Lines (renderGuideLines)
**Lines:** 870-896

Orange dashed lines dividing grid into sections.

---

## 4. VIEWPORT & TRANSFORMS

### Transform Stack
```javascript
ctx.save()                              // Line 762
ctx.translate(offsetX, offsetY)        // Line 763 (pan)
ctx.scale(zoom, zoom)                  // Line 764 (zoom)
// All rendering here
ctx.restore()                           // Line 808
```

### Viewport Variables
- `tileSize`: 16 pixels
- `zoom`: 0.05-8.0
- `offsetX`, `offsetY`: Pan offset
- `gridCanvas.width/height`: Viewport size

### Coordinate Conversion
Screen to world: `(mouseX - offsetX) / (tileSize * zoom)`

---

## 5. MAZE OVERLAY INTEGRATION POINT

### Recommended Location
**File:** js/editor.js  
**In function:** render()  
**After line:** 806 (renderGuideLines)  
**Before line:** 808 (ctx.restore)

```javascript
if (this.showGuides) {
    this.renderGuideLines(ctx);
}

// INSERT MAZE HERE
if (this.showMazeOverlay && this.mazeOverlay) {
    this.renderMazeOverlay(ctx);
}

ctx.restore();
```

### Canvas Context at Integration
- Context: `this.gridCtx`
- Transform: Already applied (translate + scale)
- Size: viewport size (not grid size)

---

## 6. IMPLEMENTATION RECOMMENDATIONS

### Viewport Culling for Maze

Use same calculation as grid:
```javascript
const startX = Math.max(0, Math.floor(-this.offsetX / (this.tileSize * this.zoom)));
const startY = Math.max(0, Math.floor(-this.offsetY / (this.tileSize * this.zoom)));
const endX = Math.min(this.layerManager.width,
             startX + Math.ceil(this.gridCanvas.width / (this.tileSize * this.zoom)) + 1);
const endY = Math.min(this.layerManager.height,
             startY + Math.ceil(this.gridCanvas.height / (this.tileSize * this.zoom)) + 1);
```

### Render Only Visible Cells
```javascript
for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
        // Render maze at (x, y)
    }
}
```

### Adapt Line Width to Zoom
```javascript
ctx.lineWidth = 2 / this.zoom;  // Like grid and guides
```

---

## 7. LAYER DATA ACCESS

```javascript
// Get active layer
const activeLayer = this.layerManager.getActiveLayer();

// Get all layers
const layers = this.layerManager.layers;

// Layer properties
layer.name, layer.visible, layer.opacity, layer.layerType

// Tile data
const key = `${x},${y}`;
const color = layer.tileData.get(key);

// Iterate tiles
for (const [key, color] of layer.tileData.entries()) {
    const [x, y] = key.split(',').map(Number);
}
```

---

## 8. CANVAS ELEMENTS

Three canvases:
- `gridCanvas`: Main (layers + grid + maze overlay)
- `previewCanvas`: Tool preview (optional for maze)
- `minimapCanvas`: Overview (separate)

Canvas size: viewport size, NOT grid size

---

## 9. PERFORMANCE CONSIDERATIONS

- Use viewport culling (4× speedup on large grids)
- Batch line drawing with Path2D
- Call `this.requestRender()` to queue updates
- Layer caches handle incremental updates

---

## 10. FILE REFERENCES

| File | Function | Lines | Purpose |
|------|----------|-------|---------|
| js/editor.js | render() | 753-812 | Main render loop |
| js/editor.js | renderLayer() | 818-834 | Layer rendering |
| js/editor.js | renderGrid() | 839-865 | Grid with culling |
| js/editor.js | renderGuideLines() | 870-896 | Guide lines |
| js/layers.js | renderToCache() | 392-451 | Layer cache |
| js/layers.js | initCacheCanvas() | 368-386 | Cache init |

---

## 11. MINIMAL EXAMPLE

```javascript
// In LevelEditor constructor
this.mazeOverlay = null;
this.showMazeOverlay = false;

// Add method
renderMazeOverlay(ctx) {
    if (!this.mazeOverlay) return;

    // Viewport culling
    const startX = Math.max(0, Math.floor(-this.offsetX / (this.tileSize * this.zoom)));
    const startY = Math.max(0, Math.floor(-this.offsetY / (this.tileSize * this.zoom)));
    const endX = Math.min(this.layerManager.width,
                 startX + Math.ceil(this.gridCanvas.width / (this.tileSize * this.zoom)) + 1);
    const endY = Math.min(this.layerManager.height,
                 startY + Math.ceil(this.gridCanvas.height / (this.tileSize * this.zoom)) + 1);

    // Render maze
    ctx.strokeStyle = 'rgba(255, 0, 255, 0.6)';
    ctx.lineWidth = 1 / this.zoom;

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            if (this.mazeOverlay[y * this.layerManager.width + x]) {
                ctx.strokeRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
            }
        }
    }
}

// In render(), after line 806
if (this.showMazeOverlay && this.mazeOverlay) {
    this.renderMazeOverlay(ctx);
}
```

