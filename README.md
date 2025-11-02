# TSIC Level Editor

A lightweight, browser-based tile editor for creating biome-based levels for Unreal Engine. Built with pure HTML5, CSS3, and vanilla JavaScript - no build process required!

## Features

- **Color-Coded Tiles**: Each tile represents a biome with a unique color linked to Unreal Engine gameplay tags
- **Multiple Layers**: Create complex levels with multiple stacked layers
- **Powerful Tools**: Pencil, bucket fill, line, rectangle, eyedropper, and eraser
- **Undo/Redo**: 50-step history for easy experimentation
- **Auto-Save**: Automatic saving every 30 seconds to localStorage
- **Minimap**: Visual overview of your entire level
- **Export to JSON**: Ready-to-import format for Unreal Engine
- **Fully Static**: No server required - host anywhere!

## Getting Started

### Quick Start

1. Open `index.html` in a modern web browser (Chrome, Firefox, Safari, or Edge)
2. Start painting your level!

### Hosting

Since this is a completely static website, you can host it anywhere:

- **Local**: Just open `index.html` in your browser
- **GitHub Pages**: Push to a repo and enable GitHub Pages
- **Netlify/Vercel**: Drag and drop the folder for instant deployment
- **Any Web Server**: Upload to Apache, Nginx, or any static hosting service

## Interface Overview

### Top Toolbar
- **New**: Create a new blank level
- **Load**: Load a saved level from JSON
- **Save**: Download current level as JSON
- **Export**: Export level data for Unreal Engine
- **Grid Size**: Change the grid dimensions (16-512)
- **Zoom**: Adjust view zoom (25%-400%)
- **Show Grid**: Toggle grid line visibility

### Left Panel
- **Tools**: Select drawing tool
- **Color Palette**: Choose biome colors from your config
- **Statistics**: View tile counts

### Center Canvas
- **Main Grid**: Your level editing area
- **Minimap**: Overview in bottom-right corner

### Right Panel
- **Layers**: Manage layers (visibility, opacity, lock/unlock)

## Tools

### Pencil (B)
Freehand drawing tool. Click and drag to paint tiles.

**Options:**
- Brush Size: 1×1, 2×2, 3×3, 5×5, 7×7

### Bucket Fill (G)
Flood fill connected tiles of the same color.

### Line (L)
Draw straight lines between two points.

**Options:**
- Brush Size: Line thickness

### Rectangle (R)
Draw rectangular regions.

**Options:**
- Fill Mode: Filled or Outline only
- Brush Size: Not applicable for rectangles

### Eyedropper (I)
Pick a color from an existing tile.

### Eraser (E)
Remove tiles to make them transparent.

**Options:**
- Brush Size: Eraser size

## Keyboard Shortcuts

### Tools
- `B` - Pencil
- `G` - Bucket Fill
- `L` - Line
- `R` - Rectangle
- `I` - Eyedropper
- `E` - Eraser

### Actions
- `Ctrl+Z` / `Cmd+Z` - Undo
- `Ctrl+Shift+Z` / `Ctrl+Y` - Redo
- `Ctrl+S` / `Cmd+S` - Save
- `Ctrl+N` / `Cmd+N` - New Level
- `+` / `=` - Zoom In
- `-` - Zoom Out

### Navigation
- `Middle Mouse` or `Shift+Left Mouse` - Pan canvas
- `Mouse Wheel` - Zoom in/out

## Configuration

### Biome Configuration File

Edit `config/biomes.json` to customize your biomes and layers:

```json
{
  "version": "1.0",
  "tilesets": {
    "BiomeName": {
      "color": "#HEX_COLOR",
      "tag": "Biome.GameplayTag",
      "category": "Category"
    }
  },
  "layers": [
    {
      "name": "Layer Name",
      "visible": true,
      "opacity": 1.0,
      "locked": false
    }
  ],
  "defaultGridSize": {
    "width": 256,
    "height": 256
  }
}
```

### Adding New Biomes

1. Open `config/biomes.json`
2. Add a new entry under `tilesets`:

```json
"CustomBiome": {
  "color": "#FF5733",
  "tag": "Biome.Custom",
  "category": "Special"
}
```

3. Reload the page to see your new biome

### Configuring Layers

Modify the `layers` array to add or change default layers:

```json
{
  "name": "MyLayer",
  "visible": true,
  "opacity": 0.8,
  "locked": false
}
```

## Level Data Format

Exported levels use this JSON structure:

```json
{
  "version": "1.0",
  "gridSize": {
    "width": 256,
    "height": 256
  },
  "layers": [
    {
      "name": "Terrain",
      "visible": true,
      "opacity": 1.0,
      "locked": false,
      "tiles": [
        {
          "x": 0,
          "y": 0,
          "tag": "Biome.Grassland",
          "name": "Grassland"
        }
      ]
    }
  ]
}
```

Only non-empty tiles are stored for efficient file sizes.

## Importing into Unreal Engine

The exported JSON format is ready for import into Unreal Engine:

1. Export your level using the **Export** button
2. In Unreal Engine, create a level loader that:
   - Reads the JSON file
   - Iterates through each layer
   - For each tile, spawns/places appropriate actors based on the gameplay tag
   - Uses the X/Y coordinates to position elements

Example C++ pseudocode:

```cpp
// Parse JSON level data
for (const FLayerData& Layer : LevelData.Layers) {
    for (const FTileData& Tile : Layer.Tiles) {
        FGameplayTag BiomeTag = FGameplayTag::RequestGameplayTag(
            FName(*Tile.Tag)
        );

        // Spawn actor at position
        FVector Position(Tile.X * TileSize, Tile.Y * TileSize, 0);
        SpawnBiomeActor(BiomeTag, Position);
    }
}
```

## Layers

Layers allow you to organize your level into logical groups:

- **Terrain**: Base ground layer
- **Structures**: Buildings, roads, etc.
- **Objects**: Trees, rocks, etc.
- **Decorations**: Visual details

### Layer Controls
- **Visibility**: Show/hide layer
- **Opacity**: Adjust transparency (0-100%)
- **Lock**: Prevent editing
- **Delete**: Remove layer (must have at least 1 layer)
- **Add**: Create new layer with `+` button

## Browser Compatibility

Works in all modern browsers:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requires:
- HTML5 Canvas support
- ES6 JavaScript
- localStorage API

## Performance

- Handles grids up to 512×512 tiles smoothly
- Sparse storage - only occupied tiles use memory
- Viewport culling for efficient rendering
- Canvas-based rendering for fast updates

## Tips & Best Practices

1. **Use Layers Wisely**: Separate terrain, structures, and decorations into different layers
2. **Save Frequently**: Use Ctrl+S to save your work (auto-save is only a backup)
3. **Zoom to Fit**: Use the "Fit" button when starting to see your entire canvas
4. **Experiment**: Undo/redo history lets you try ideas without fear
5. **Color Palette**: Organize biomes by category in your config for easier selection

## Testing

Comprehensive test suites are included for quality assurance:

### Automated Tests

**Playwright (Recommended):**
```bash
npm install
npm run install-browsers
npm test                    # Run all tests
npm run test:ui            # Interactive UI mode
```

**Python + Selenium:**
```bash
pip install selenium webdriver-manager
python tests/selenium_test.py
```

**Test Coverage:**
- ✅ 25+ automated Playwright tests
- ✅ 14 Python Selenium tests
- ✅ All tools, layers, and features tested
- ✅ Keyboard shortcuts verified
- ✅ File operations tested

See [TESTING.md](TESTING.md) for complete testing guide, manual testing checklist, and Playwright MCP setup instructions.

## Troubleshooting

### Configuration Not Loading
- Check that `config/biomes.json` is valid JSON
- Ensure the file path is correct relative to `index.html`
- Check browser console (F12) for error messages

### Level Won't Load
- Verify JSON format matches the expected structure
- Ensure gameplay tags in your level exist in your config

### Performance Issues
- Reduce grid size for lower-spec devices
- Disable grid lines on high zoom levels
- Use fewer layers for complex levels

## File Structure

```
LevelEditor/
├── index.html              # Main application
├── config/
│   └── biomes.json        # Biome configuration
├── css/
│   └── styles.css         # Styling
├── js/
│   ├── app.js             # Application initialization
│   ├── config.js          # Configuration manager
│   ├── editor.js          # Canvas renderer & editor
│   ├── layers.js          # Layer management
│   └── tools.js           # Drawing tools
└── README.md              # This file
```

## License

This project is provided as-is for use with Unreal Engine projects.

## Credits

Built with vanilla JavaScript - no frameworks, no build process, no dependencies!

---

**Happy Level Editing!** 🎮🗺️
