# How to Use the Level Editor

## 🚀 Getting Started (30 Seconds)

### Open the Editor
**Just double-click this file:**
```
index.html
```

Or navigate to the folder and open it:
```
C:\Users\Administrator\Documents\Unreal Projects\LevelEditor\index.html
```

That's it! The editor runs entirely in your browser - no installation needed!

---

## 🎨 Quick Tutorial (2 Minutes)

### 1. Select a Color
- Look at the **left panel** with colored squares
- Click any biome (e.g., **Grassland** - green)
- The color highlights with a blue border

### 2. Draw Something!
- Click and drag on the big canvas in the middle
- Green tiles appear where you drag!
- That's it - you're drawing!

### 3. Try Other Tools
**Click these tool buttons on the left:**
- **Pencil** ✏️ - Freehand drawing (default)
- **Bucket** 🪣 - Click to fill large areas
- **Line** 📏 - Click twice to draw straight lines
- **Rectangle** ▭ - Click and drag to draw rectangles
- **Eraser** 🧹 - Remove tiles

### 4. Use Layers
**Right panel shows layers:**
- Click "Structures" to draw on that layer
- Toggle the eye icon to hide/show layers
- Draw on different layers for complex levels

---

## ⌨️ Keyboard Shortcuts

### Tools
- `B` - Pencil
- `G` - Bucket Fill
- `L` - Line
- `R` - Rectangle
- `I` - Eyedropper (pick color)
- `E` - Eraser

### Actions
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo
- `Ctrl+S` - Save level
- `+` - Zoom in
- `-` - Zoom out

### Navigation
- `Shift + Drag` - Pan around canvas
- `Mouse Wheel` - Zoom in/out

---

## 🎯 Step-by-Step Guide

### Creating Your First Level

#### Step 1: Choose Your Base
1. Click **Grassland** (green) in color palette
2. Click the **Bucket** tool (🪣)
3. Click once on the canvas
4. Entire area fills with grass! 🌱

#### Step 2: Add Water
1. Click **Ocean** (blue)
2. Click **Pencil** tool (✏️)
3. Draw a river across your level 🌊

#### Step 3: Add Terrain Features
1. Click **Mountain** (brown)
2. Change **Brush Size** to 5×5
3. Click to place mountain ranges 🏔️

#### Step 4: Add Structures
1. Click **"Structures"** layer on the right
2. Click **Town** (tan color)
3. Place some towns on your map 🏘️

#### Step 5: Save Your Work
1. Click **Save** button at top
2. Your level downloads as JSON
3. Load it anytime with **Load** button 💾

---

## 🎨 Interface Guide

```
┌─────────────────────────────────────────────────────────┐
│ [New] [Load] [Save] [Export]  Grid: 256×256  [Zoom]   │ ← Top Toolbar
├───────────┬──────────────────────────────┬──────────────┤
│   TOOLS   │         CANVAS               │   LAYERS     │
│           │                              │              │
│ ✏️ Pencil │    Your level appears here  │ ☑ Terrain   │
│ 🪣 Bucket │                              │ ☑ Structures│
│ 📏 Line   │    [Draw and paint!]        │ ☑ Objects   │
│ ▭ Rectangle│                             │ ☑ Decor     │
│ 💧 Picker │                              │              │
│ 🧹 Eraser │    Minimap in bottom-right  │ [+ Add]     │
│           │                              │              │
│  COLORS   │                              │  SETTINGS   │
│ [🟢][🔵]  │                              │ Opacity: ▬▬ │
│ [🟤][⚪]  │                              │ Lock: ☐     │
│           │                              │              │
│ STATS     │                              │              │
│ Tiles: 0  │                              │              │
└───────────┴──────────────────────────────┴──────────────┘
│ Status: X: 0, Y: 0 | Ready               │ Auto-saved  │
└─────────────────────────────────────────────────────────┘
```

---

## 🎮 Controls Reference

### Mouse Controls
| Action | What It Does |
|--------|--------------|
| **Left Click** | Paint tile / Select item |
| **Left Drag** | Paint continuously |
| **Shift + Drag** | Pan around canvas |
| **Mouse Wheel** | Zoom in/out |

### Tool Options
| Setting | Options |
|---------|---------|
| **Brush Size** | 1×1, 2×2, 3×3, 5×5, 7×7 |
| **Fill Mode** | Filled, Outline (rectangles only) |
| **Grid** | On/Off toggle |

### Zoom Levels
- **25%** - See entire huge levels
- **50%** - Good overview
- **100%** - Default (1 tile = 16 pixels)
- **200%** - Detailed editing
- **400%** - Pixel-perfect precision

---

## 💡 Tips & Tricks

### Pro Tips:
1. **Use Bucket Fill for large areas** - Way faster than pencil!
2. **Use layers** - Draw terrain first, structures second
3. **Undo is your friend** - Press Ctrl+Z liberally
4. **Lock layers** - Prevent accidental edits
5. **Use minimap** - Navigate large levels quickly
6. **Save often** - Auto-save runs every 30 seconds
7. **Keyboard shortcuts** - Much faster than clicking!

### Workflow Example:
```
1. Bucket fill entire canvas with Grassland (base)
2. Switch to Ocean, draw water features
3. Add Mountains, Forests, Deserts
4. Switch to Structures layer
5. Place Towns, Roads, Bridges
6. Switch to Objects layer
7. Add decorative elements
8. Save and export!
```

---

## 📁 File Operations

### Save Your Level
1. Click **Save** button
2. File downloads as `level_[timestamp].json`
3. Store it safely!

### Load a Level
1. Click **Load** button
2. Select your JSON file
3. Level loads instantly!

### Export for Unreal Engine
1. Click **Export** button
2. File downloads as `level_export_[timestamp].json`
3. Import into your Unreal project!

### Auto-Save
- Runs every 30 seconds automatically
- Saved to browser localStorage
- Offers to restore on page reload

---

## 🎨 Working with Colors

### Selecting Colors:
1. Click any color in the palette
2. Color name appears at top
3. Color square highlights

### Available Biomes (24 total):
- **Natural:** Grassland, Forest, Desert, Snow, Mountain, Tundra, Swamp, Beach
- **Water:** Ocean, Lake, River
- **Special:** Lava, Ice, Volcanic, Cave, Dungeon
- **Structures:** Town, Village, Castle, Temple, Road, Bridge, Farm, Mine

### Add Your Own Colors:
Edit `config/biomes.json` - see [README.md](README.md) for details

---

## 📚 Working with Layers

### What Are Layers?
Think of them as transparent sheets stacked on top of each other:
```
[Decorations] ← Top (trees, details)
[Objects]     ← Middle (rocks, items)
[Structures]  ← Middle (buildings, roads)
[Terrain]     ← Bottom (ground)
```

### Layer Controls:
- **Click layer** - Makes it active (draw on this layer)
- **Eye icon** - Show/hide layer
- **Opacity slider** - Make layer transparent
- **Lock checkbox** - Prevent edits
- **+ Button** - Add new layer

### Best Practice:
1. Draw terrain first (ground)
2. Add structures (buildings)
3. Add objects (decorations)
4. This makes editing easier later!

---

## 🔧 Advanced Features

### Grid Size
- Default: 256×256 (65,536 tiles)
- Change at top: Type new size and click **Resize**
- Range: 16×16 to 512×512

### Minimap
- Shows entire level
- Blue rectangle = current view
- Click to jump to area (coming in future update!)

### Statistics
- **Tiles** - How many tiles you've painted
- **Empty** - How many tiles are still empty
- Total always equals grid size

### Zoom Fit
- Click **Fit** button
- Automatically zooms to see entire grid
- Great for starting new levels

---

## 🐛 Troubleshooting

### Colors Don't Appear
- Check `config/biomes.json` exists
- Open browser console (F12) for errors

### Can't Draw
- Make sure a color is selected (highlighted)
- Check layer isn't locked
- Verify you're using a drawing tool (not eyedropper)

### Slow Performance
- Reduce grid size
- Turn off grid lines
- Close other browser tabs

### Auto-Save Not Working
- Check browser allows localStorage
- Try incognito mode if in private browsing

---

## 🎯 Example Workflows

### Create an Island:
1. Bucket fill with Ocean (blue)
2. Switch to Grassland, draw land mass
3. Add Beach around edges
4. Add Mountains in center
5. Add Forest, Desert areas
6. Switch to Structures layer, add town
7. Export!

### Create a Dungeon:
1. Bucket fill with Cave (dark)
2. Draw corridors with Dungeon tiles
3. Add Lava rivers
4. Place structures (temples, etc.)
5. Layer approach for depth

### Create a World Map:
1. Start with Ocean
2. Draw continents with Grassland
3. Add biomes: Deserts, Forests, Snow
4. Add Mountain ranges
5. Add Roads, Towns on Structures layer
6. Decorations for details

---

## 📖 Full Documentation

For complete details:
- **[README.md](README.md)** - Full feature documentation
- **[QUICKSTART.md](QUICKSTART.md)** - 5-minute quick start
- **[TESTING.md](TESTING.md)** - Testing guide
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - How to host online

---

## 🎊 You're Ready!

You now know:
- ✅ How to open the editor
- ✅ How to draw and paint
- ✅ How to use all tools
- ✅ How to work with layers
- ✅ How to save and export
- ✅ All keyboard shortcuts

**Start creating your levels!** 🎮✨

---

**Quick reminder:** Just double-click **index.html** to open the editor anytime!
