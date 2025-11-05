# Quick Start: Reading TSIC JSON Files (For AI Assistants)

## What You're Reading

A JSON file with world tile data for a game level. It's compressed with RLE (Run-Length Encoding) and includes all the lookup tables you need.

## The 4 Sections

```json
{
  "metadata": { "world_size": 512 },
  "layers": [ {...}, {...}, ... ],
  "color_mappings": { "biomes": {...}, "heights": {...}, ... },
  "format_info": { "how_to_read": {...} }
}
```

## How to Read It (5 Steps)

### 1. Get the grid size
```python
world_size = data['metadata']['world_size']  # e.g., 512
total_tiles = world_size * world_size         # 512×512 = 262,144
```

### 2. Decode each layer's RLE data
```python
for layer in data['layers']:
    palette = layer['palette']        # ["#ff6b6b", "#f7dc6f"]
    color_data = layer['color_data']  # [[0, 100000], [1, 162144]]

    # Decompress
    tiles = []
    for [palette_index, count] in color_data:
        color = palette[palette_index]
        tiles.extend([color] * count)

    # Now 'tiles' is a flat array of 262,144 colors
```

### 3. Get tile at position (x, y)
```python
index = y * world_size + x
color = tiles[index]
```

### 4. Convert color to enum value
```python
# Pick category based on layer type
if layer_type in ['Floor', 'Underground', 'Sky']:
    category = 'biomes'
elif layer_type == 'Height':
    category = 'heights'
elif layer_type == 'Difficulty':
    category = 'difficulty'
elif layer_type == 'Hazard':
    category = 'hazards'

# Look up
mapping = data['color_mappings'][category][color]
enum_value = mapping['value']
enum_name = mapping['name']
```

### 5. Done!
You now have the enum value for that tile. Repeat for all layers.

## Complete Minimal Example

```python
import json

with open('level.json', 'r') as f:
    data = json.load(f)

world_size = data['metadata']['world_size']

# Decode Floor layer
floor_layer = next(l for l in data['layers'] if l['layer_type'] == 'Floor')
floor_tiles = []
for idx, count in floor_layer['color_data']:
    color = floor_layer['palette'][idx].lower()
    floor_tiles.extend([color] * count)

# Get tile at (10, 20)
x, y = 10, 20
index = y * world_size + x
color = floor_tiles[index]

# Convert to enum
mapping = data['color_mappings']['biomes'][color]
print(f"Tile at ({x}, {y}): {mapping['name']} = {mapping['value']}")
```

## Key Points

- **RLE decompression is required** - Don't skip it!
- **Row-major order** - Tiles go left-to-right, top-to-bottom
- **Case-insensitive colors** - Use `.lower()` for safety
- **6 layers total** - Height, Difficulty, Hazard, Sky, Floor, Underground
- **4 categories** - biomes (23 values), heights (10 values), difficulty (5 values), hazards (3 values)
- **Everything you need is in the JSON** - No external files needed

## That's It!

The JSON file is self-contained. All mappings and instructions are embedded. Read the full guide in `HOW_TO_READ_THE_JSON.md` if you need more details.
