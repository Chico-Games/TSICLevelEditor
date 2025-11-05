===================================================================
TSIC LEVEL EDITOR - JSON FORMAT DOCUMENTATION
===================================================================

This folder contains everything you need to read the exported JSON files.

DOCUMENTS:
----------

1. QUICK_START_FOR_AI.md
   → Start here! 5-step guide with minimal code example
   → Best for: Getting a basic reader working in 5 minutes

2. HOW_TO_READ_THE_JSON.md
   → Complete reference with detailed explanations
   → Includes: Full Python & JavaScript implementations
   → Best for: Understanding every detail

3. JSON_FORMAT_GUIDE.md
   → Technical specification with all color mappings
   → Best for: Reference lookup

4. EXAMPLE_EXPORT.json
   → Real example showing all 4 sections of the JSON format
   → Best for: Seeing the actual structure

QUICK SUMMARY:
--------------

The JSON has 4 sections:
  1. metadata      - Basic info (world_size, name, etc.)
  2. layers        - 6 layers with RLE-compressed tile data
  3. color_mappings - 41 color-to-enum conversions (biomes, heights, difficulty, hazards)
  4. format_info   - Instructions on how to read

Reading Process:
  1. Load JSON
  2. Get world_size from metadata
  3. Decompress RLE: [[paletteIndex, count], ...] → flat array of colors
  4. Convert index to (x,y): x = index % world_size, y = index // world_size
  5. Look up color in color_mappings to get enum value

Everything you need is in the JSON file - no external lookups required!

WHAT TO SEND TO ANOTHER AI:
----------------------------

Send them:
  - The exported JSON file (e.g., test3.json)
  - QUICK_START_FOR_AI.md (if they need help)

That's it! The JSON is self-documenting.

===================================================================
