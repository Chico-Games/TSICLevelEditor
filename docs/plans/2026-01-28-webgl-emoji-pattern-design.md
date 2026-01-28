# WebGL Emoji Pattern Renderer Design

## Overview

Replace the current 2D canvas tile renderer with a unified WebGL renderer that supports two modes:
- **Solid color mode**: Replicates current appearance exactly
- **Emoji pattern mode**: Renders a screen-space grid of emojis over the tile background color

The emoji pattern stays the same size on screen regardless of zoom level—zooming in reveals more emojis, not bigger ones.

## Architecture

### Canvas Stack (bottom to top)

1. **`tile-canvas`** - WebGL renderer for all tile rendering (both modes)
2. **`overlay-canvas`** - 2D canvas for grid lines, guides, selection preview, brush preview, maze overlay

### Shader Modes

Controlled by a uniform toggle:
- `mode = 0`: Solid color fill
- `mode = 1`: Emoji pattern with color background

### What Moves to Overlay Canvas

- Grid lines
- Guide lines
- Selection rectangles / brush preview
- Maze visualizer overlay
- Tool-specific previews

The existing `preview-canvas` is removed—its functionality merges into `overlay-canvas`.

## Shader Design

### Textures

**Emoji Atlas:**
- Pre-render all emojis to a single texture atlas at startup
- Each emoji in a 64x64 cell
- ~24 biomes in a single row or 2D grid

**Tile Data Texture:**
- Upload tile colors as a texture (grid width × height)
- Each pixel = one tile's color (RGBA)
- Updated only when tiles change, not on pan/zoom

### Vertex Shader

```glsl
attribute vec2 position;
varying vec2 vUV;

void main() {
    vUV = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
```

### Fragment Shader

```glsl
uniform sampler2D tileData;
uniform sampler2D emojiAtlas;
uniform vec2 gridSize;
uniform vec2 viewport;
uniform vec2 offset;
uniform float zoom;
uniform float tileSize;
uniform int mode;
uniform float emojiSize;  // Screen-space size (e.g., 32px)

varying vec2 vUV;

void main() {
    // Convert screen position to grid tile coordinate
    vec2 screenPos = vUV * viewport;
    vec2 worldPos = (screenPos - offset) / zoom;
    vec2 tileCoord = worldPos / tileSize;

    // Sample tile color
    vec4 tileColor = texture2D(tileData, tileCoord / gridSize);

    if (mode == 0) {
        gl_FragColor = tileColor;
    } else {
        // Emoji pattern mode - screen-space UVs
        vec2 emojiUV = mod(screenPos, emojiSize) / emojiSize;
        int emojiIndex = colorToEmojiIndex(tileColor);
        vec4 emoji = sampleAtlas(emojiAtlas, emojiIndex, emojiUV);

        // Blend emoji over background color
        gl_FragColor = mix(tileColor, emoji, emoji.a);
    }
}
```

The `mod(screenPos, emojiSize)` creates the screen-space repeating pattern that stays constant during zoom.

## Emoji Atlas Generation

At startup:

1. Create offscreen canvas for atlas
2. Iterate through all tilesets in `biomes.json`
3. For each tileset with an `icon` property, render emoji to 64x64 cell using `fillText()` at ~48px
4. Build color → atlas index lookup map
5. Upload atlas to GPU as texture

**Color mapping structure:**
```javascript
this.colorToEmoji = {
    '#ff6b6b': { index: 0, hasEmoji: true },   // ShowFloor
    '#f7dc6f': { index: 1, hasEmoji: true },   // Restaurant
    '#000000': { index: -1, hasEmoji: false }, // None
    // ...
};
```

Colors without emojis fall back to solid color even in emoji mode.

## Integration

### Tile Data to GPU

When tiles change:
```javascript
updateTileTexture() {
    const imageData = new ImageData(gridWidth, gridHeight);
    for (const [key, color] of layer.tileData) {
        const [x, y] = key.split(',').map(Number);
        const idx = (y * gridWidth + x) * 4;
        const rgb = hexToRgb(color);
        imageData.data[idx] = rgb.r;
        imageData.data[idx + 1] = rgb.g;
        imageData.data[idx + 2] = rgb.b;
        imageData.data[idx + 3] = 255;
    }
    gl.texImage2D(..., imageData);
}
```

### Pan/Zoom Updates

No texture upload needed—just update uniforms:
```javascript
gl.uniform2f(offsetUniform, this.offsetX, this.offsetY);
gl.uniform1f(zoomUniform, this.zoom);
gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
```

### Layer Visibility

Composite visible layers to a single texture on CPU before GPU upload. Opacity handled via pre-multiplication during composite.

## Overlay Canvas

Sits on top of WebGL canvas with `pointer-events: none`.

**CSS stacking:**
```css
#tile-canvas, #overlay-canvas {
    position: absolute;
    top: 0;
    left: 0;
}
#overlay-canvas {
    pointer-events: none;
}
#canvas-container {
    pointer-events: auto;
}
```

**Render triggers:**
- Pan/zoom: full redraw
- Mouse move: update brush preview
- Tool state change: update selection/preview

## UI Toggle

Checkbox in toolbar near "Show Grid":
```html
<label>
    <input type="checkbox" id="emoji-mode">
    Emoji Pattern
</label>
```

Mode switch just updates a shader uniform:
```javascript
toggleEmojiMode(enabled) {
    this.emojiPatternMode = enabled;
    gl.uniform1i(modeUniform, enabled ? 1 : 0);
    this.renderTiles();
}
```

Preference saved to localStorage.

## Implementation Steps

1. **Create WebGL renderer class** (~200 lines)
   - Initialize WebGL context, compile shaders
   - Manage tile texture and emoji atlas texture
   - Handle uniforms for zoom/offset/mode

2. **Generate emoji atlas at startup** (~50 lines)
   - Render all emoji icons to offscreen canvas
   - Upload as texture

3. **Modify editor initialization** (~30 lines)
   - Create WebGL canvas + overlay canvas
   - Replace current grid-canvas with new stack
   - Wire up tile data updates to texture uploads

4. **Move overlays to overlay-canvas** (~100 lines)
   - Migrate grid lines, guides, previews from current render()
   - Remove preview-canvas references

5. **Add UI toggle** (~20 lines)
   - Checkbox in toolbar
   - Event handler to flip mode

**Estimated total:** ~400 lines new code, ~150 lines removed.

## Performance Characteristics

- WebGL renders once when tile data changes
- Pan/zoom only updates uniforms—no re-render needed
- Overlay canvas handles fast 2D drawing for tools
- 60fps target achievable on large maps (2048x2048)
