# Stamps, Selection Transforms, Measurements & Annotations

## Overview

This design covers four feature areas for the Level Editor:

1. **Stamps** - Save selections as reusable stamps, layer-type bound
2. **Selection Transforms** - Rotate and flip selections with hotkeys
3. **Measurement Tool** - Ruler for horizontal/vertical distances
4. **Annotations** - Text boxes and hollow shapes for notes

## 1. Stamps System

### Data Structure

Stamps stored in localStorage with key pattern `levelEditor_stamps_{levelName}`.

```javascript
{
  id: string,           // unique ID (timestamp-based)
  name: string,         // user-editable name
  layerType: string,    // "Floor", "Height", "Difficulty", etc.
  width: number,
  height: number,
  tiles: [              // sparse array - only filled tiles
    { x, y, color }     // relative coords + hex color
  ],
  createdAt: timestamp
}
```

The sparse tile array means wand selections with irregular shapes only store the selected tiles. Empty/unselected positions don't exist in the array, so when placing stamps, those positions won't overwrite existing canvas content.

### Layer Type Binding

- Stamps are bound to the layer type they were created from
- A stamp created on a Floor layer can only be placed on Floor layers
- Switching to an incompatible layer type:
  - Deselects the current stamp
  - Stamp picker shows empty/filtered results
- This ensures color mappings remain valid

### Workflow

1. Make selection with Wand or Rectangle Select tool
2. "Save as Stamp" button appears in tool options bar
3. Hotkey: **Ctrl+Shift+S** saves selection as stamp
4. Stamp saved with auto-generated name (e.g., "Stamp 1", "Stamp 2"), user can rename later
5. Switch to Stamp tool (**T** hotkey)
6. If no stamp selected, clicking canvas opens stamp picker modal
7. Modal shows grid of stamps filtered to current layer type
8. Click stamp thumbnail to select, modal closes
9. Click on canvas to place stamp
10. Non-selected tiles in stamp shape do not overwrite canvas

### Stamp Picker Modal

- Grid layout of stamp thumbnails with visual preview
- Filtered by current layer type
- Shows stamp name below each thumbnail
- Click to select
- Right-click or hover menu for options:
  - Rename stamp
  - Delete stamp
- X button to close modal

### UI Elements

- **Stamp tool button** in toolbar with **T** hotkey
- **"Stamps" button** in left sidebar below Copy History
- **"Save as Stamp" button** in tool options bar (visible when selection exists)

## 2. Selection Transforms

### Operations

Three transform operations when selection exists:

| Operation | Hotkey | Description |
|-----------|--------|-------------|
| Rotate 90° CW | R | Rotate clockwise by 90 degrees |
| Horizontal Flip | H | Mirror left-to-right |
| Vertical Flip | V | Mirror top-to-bottom |

### UI

Transform buttons appear in tool options bar when Selection or Wand tool is active and a selection exists:

```
[ ↻ Rotate ] [ ↔ H-Flip ] [ ↕ V-Flip ]
```

### Behavior

- Transforms apply to `selectionData.tiles` array
- For floating selections: preview updates immediately
- For non-floating selections: auto-lift, transform, show as floating
- Multiple transforms can be chained
- Each transform is an undoable action

### Implementation

**Rotate 90° clockwise:**
```javascript
newX = (height - 1) - oldY
newY = oldX
// swap width and height
```

**Horizontal flip:**
```javascript
newX = (width - 1) - oldX
```

**Vertical flip:**
```javascript
newY = (height - 1) - oldY
```

### Hotkey Change

Rectangle/Shape tool moves from **R** to **U** to free up R for rotate.

## 3. Measurement Tool

### Tool Behavior

New **Ruler tool** with hotkey **K**.

- Click and drag to measure
- Snaps to horizontal or vertical based on dominant drag direction
- Shows tile count live while dragging
- On release, measurement persists on canvas
- One measurement at a time (new replaces old)
- Press **Escape** to clear measurement

### Display

- Thin line with endpoint markers (small squares)
- Distance label centered on line (e.g., "12 tiles")
- Rendered on overlay canvas (does not affect tile data)
- Distinct visual style (suggest dashed line)

### Persistence

- Measurements persist during session only
- Cleared on page refresh
- Not saved with project (working reference only)

## 4. Annotation System

### Global Toggle

- "Annotations" toggle button in toolbar
- **Off by default**
- When off: annotations hidden
- When on: annotations visible, annotation tools available
- Selecting an annotation tool auto-enables annotations if currently off

### Annotation Tools

New "Annotations" section in left sidebar below main tools:

1. **Text tool** - Click to place, type inline, click away to confirm
2. **Hollow Rectangle** - Click and drag to draw rectangle outline
3. **Hollow Circle/Ellipse** - Click and drag to draw ellipse outline

### Annotation Styling

When an annotation tool is selected, the tool options bar shows:

**Color:**
- Color picker independent from tile palette
- Default: bright cyan for visibility
- Applies to newly created annotations

**Font Size (Text tool):**
- Slider or dropdown for font size
- Range: 12px - 48px (or similar)
- Default: 16px

**Line Thickness (Hollow shapes):**
- Slider for stroke width
- Range: 1px - 8px
- Default: 2px

### Annotation Editing

- Click annotation to select (shows selection handles)
- Drag to move
- Double-click text to edit inline
- Press **Delete** to remove selected annotation
- Shapes can be resized by dragging corner handles

### Storage

- Stored in localStorage with level name key
- Not exported to JSON
- Single global annotation layer (not per-layer)

### Data Structure

```javascript
// localStorage key: levelEditor_annotations_{levelName}
{
  annotations: [
    {
      id: string,
      type: "text" | "rectangle" | "ellipse",
      x: number,
      y: number,
      width: number,       // for shapes
      height: number,      // for shapes
      text: string,        // for text type
      fontSize: number,    // for text type (px)
      lineThickness: number, // for shapes (px)
      color: string,       // hex color
      createdAt: timestamp
    }
  ]
}
```

## 5. Hotkey Summary

### Tools

| Key | Tool |
|-----|------|
| B | Pencil |
| G | Bucket |
| L | Line |
| U | Rectangle/Shape (changed from R) |
| I | Eyedropper |
| E | Eraser |
| P | Pan (changed from H) |
| M | Selection |
| W | Wand |
| T | Stamp (new) |
| K | Ruler (new) |

### Selection Transforms

| Key | Action |
|-----|--------|
| R | Rotate 90° clockwise |
| H | Horizontal flip |
| V | Vertical flip |

### Other

| Key | Action |
|-----|--------|
| Ctrl+Shift+S | Save selection as stamp |
| Escape | Clear measurement / deselect |
| Delete | Delete selected annotation |

## 6. UI Layout Changes

### Left Sidebar Additions

```
Tools Section
├── Pencil (B)
├── Bucket (G)
├── Line (L)
├── Shape (U)
├── Eyedropper (I)
├── Eraser (E)
├── Pan (P)
├── Selection (M)
├── Wand (W)
├── Stamp (T) ← new
└── Ruler (K) ← new

Annotations Section (new)
├── Text
├── Hollow Rect
└── Hollow Ellipse

[Color Palette Section]

[Statistics Section]

Copy History Section
└── [existing]

Stamps Section (new)
└── "Open Stamps" button → opens stamp picker modal
```

### Tool Options Bar Additions

When selection exists:
- "Save as Stamp" button
- Rotate, H-Flip, V-Flip buttons

When annotation tool selected:
- Annotation color picker
- Font size slider (Text tool only)
- Line thickness slider (Hollow Rect/Ellipse only)

### Top Toolbar

- Annotations toggle button (on/off)

## 7. Implementation Notes

### File Changes Required

- `js/tools.js` - Add StampTool, RulerTool, annotation tools, transform methods
- `js/editor.js` - Stamp/annotation storage, rendering overlays
- `js/app.js` - New hotkey bindings, UI event handlers
- `index.html` - New UI elements (buttons, modal, annotation section)
- `css/styles.css` - Styling for new UI components

### Rendering Layers

```
1. Grid canvas (tile data)
2. Selection overlay
3. Measurement overlay
4. Annotation overlay (when enabled)
5. Preview canvas (hover preview)
```

### localStorage Keys

- `levelEditor_stamps_{levelName}` - Stamps for level
- `levelEditor_annotations_{levelName}` - Annotations for level
