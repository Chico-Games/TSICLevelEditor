# Maze Direction Encoding - Quick Reference

## 4-Bit Direction Encoding

Each tile stores connections as a single byte (0-15) with 4 direction bits:

```
Bit 0 (value 1)  = North (Up, toward Y=0)
Bit 1 (value 2)  = South (Down, toward larger Y)
Bit 2 (value 4)  = East (Right, toward larger X)
Bit 3 (value 8)  = West (Left, toward smaller X)
```

## Complete Lookup Table

| Decimal | Binary | Hex | Directions | Visual | Description |
|---------|--------|-----|------------|--------|-------------|
| 0 | 0000 | 0x0 | None | ╳ | Dead end (isolated) |
| 1 | 0001 | 0x1 | N | ╵ | North only |
| 2 | 0010 | 0x2 | S | ╷ | South only |
| 3 | 0011 | 0x3 | N+S | │ | Vertical corridor |
| 4 | 0100 | 0x4 | E | ╶ | East only |
| 5 | 0101 | 0x5 | N+E | └ | L-corner (NE) |
| 6 | 0110 | 0x6 | S+E | ┌ | L-corner (SE) |
| 7 | 0111 | 0x7 | N+S+E | ├ | T-junction (opening west) |
| 8 | 1000 | 0x8 | W | ╴ | West only |
| 9 | 1001 | 0x9 | N+W | ┘ | L-corner (NW) |
| 10 | 1010 | 0xA | S+W | ┐ | L-corner (SW) |
| 11 | 1011 | 0xB | N+S+W | ┤ | T-junction (opening east) |
| 12 | 1100 | 0xC | E+W | ─ | Horizontal corridor |
| 13 | 1101 | 0xD | N+E+W | ┴ | T-junction (opening south) |
| 14 | 1110 | 0xE | S+E+W | ┬ | T-junction (opening north) |
| 15 | 1111 | 0xF | N+S+E+W | ┼ | 4-way intersection |

## JavaScript Bit Operations

### Check if direction is set:
```javascript
const hasNorth = (value & 1) !== 0;   // Bit 0
const hasSouth = (value & 2) !== 0;   // Bit 1
const hasEast  = (value & 4) !== 0;   // Bit 2
const hasWest  = (value & 8) !== 0;   // Bit 3

// Alternative (bit shift):
const hasNorth = (value & (1 << 0)) !== 0;
const hasSouth = (value & (1 << 1)) !== 0;
const hasEast  = (value & (1 << 2)) !== 0;
const hasWest  = (value & (1 << 3)) !== 0;
```

### Set a direction bit:
```javascript
value |= 1;  // Set North (bit 0)
value |= 2;  // Set South (bit 1)
value |= 4;  // Set East (bit 2)
value |= 8;  // Set West (bit 3)

// Alternative (bit shift):
value |= (1 << 0);  // Set North
value |= (1 << 1);  // Set South
value |= (1 << 2);  // Set East
value |= (1 << 3);  // Set West
```

### Clear a direction bit:
```javascript
value &= ~1;  // Clear North (bit 0)
value &= ~2;  // Clear South (bit 1)
value &= ~4;  // Clear East (bit 2)
value &= ~8;  // Clear West (bit 3)

// Alternative (bit shift):
value &= ~(1 << 0);  // Clear North
value &= ~(1 << 1);  // Clear South
value &= ~(1 << 2);  // Clear East
value &= ~(1 << 3);  // Clear West
```

### Toggle a direction bit:
```javascript
value ^= 1;  // Toggle North (bit 0)
value ^= 2;  // Toggle South (bit 1)
value ^= 4;  // Toggle East (bit 2)
value ^= 8;  // Toggle West (bit 3)
```

## Coordinate System Reminder

```
Y=0 at TOP (North), Y increases DOWNWARD (South)

    X→
Y   0   1   2   3
↓
0   ┌───┬───┬───┬───
    │ 0 │ 1 │ 2 │ 3
1   ├───┼───┼───┼───
    │ 4 │ 5 │ 6 │ 7
2   ├───┼───┼───┼───
    │ 8 │ 9 │10 │11
```

**Direction Offsets:**
- North: `index - worldWidth` (toward Y=0)
- South: `index + worldWidth` (toward larger Y)
- East: `index + 1` (toward larger X)
- West: `index - 1` (toward smaller X)

## Bidirectional Requirement

**CRITICAL:** Maze connections are always bidirectional!

If tile A has a North connection (bit 0), then:
- Tile B (to the north) MUST have a South connection (bit 1)

**Opposite Directions:**
- North (0) ↔ South (1)
- East (2) ↔ West (3)

```javascript
function getOppositeDirection(direction) {
    switch (direction) {
        case 0: return 1;  // North ↔ South
        case 1: return 0;  // South ↔ North
        case 2: return 3;  // East ↔ West
        case 3: return 2;  // West ↔ East
    }
}
```

## Common Patterns

### Dead ends (1 connection):
- 1 (N), 2 (S), 4 (E), 8 (W)

### Corridors (2 opposite connections):
- 3 (N+S) = Vertical
- 12 (E+W) = Horizontal

### L-corners (2 adjacent connections):
- 5 (N+E), 6 (S+E), 9 (N+W), 10 (S+W)

### T-junctions (3 connections):
- 7 (N+S+E), 11 (N+S+W), 13 (N+E+W), 14 (S+E+W)

### 4-way intersection (4 connections):
- 15 (N+S+E+W)

## Visualization Example

For a small 2×2 maze:

```
Tile indices:     Maze data:       Visual:
┌───┬───┐        ┌───┬───┐        ┌───────┐
│ 0 │ 1 │        │ 6 │ 8 │        │   ←───┤
├───┼───┤        ├───┼───┤        └───────┘
│ 2 │ 3 │        │ 5 │ 9 │
└───┴───┘        └───┴───┘

Decoded:
- Tile 0 (value 6 = 0b0110 = S+E): connects South and East
- Tile 1 (value 8 = 0b1000 = W): connects West only
- Tile 2 (value 5 = 0b0101 = N+E): connects North and East
- Tile 3 (value 9 = 0b1001 = N+W): connects North and West
```

## Usage in Rendering

### Wall-based rendering (draw walls where NO connection):
```javascript
const directions = mazeData[tileIndex];

// Draw north wall if no north connection
if (!(directions & 1)) {
    drawWall(tileX, tileY, tileX + tileSize, tileY);
}

// Draw east wall if no east connection
if (!(directions & 4)) {
    drawWall(tileX + tileSize, tileY, tileX + tileSize, tileY + tileSize);
}

// Draw south wall if no south connection
if (!(directions & 2)) {
    drawWall(tileX, tileY + tileSize, tileX + tileSize, tileY + tileSize);
}

// Draw west wall if no west connection
if (!(directions & 8)) {
    drawWall(tileX, tileY, tileX, tileY + tileSize);
}
```

### Path-based rendering (draw lines WHERE connection exists):
```javascript
const directions = mazeData[tileIndex];
const centerX = tileX + tileSize / 2;
const centerY = tileY + tileSize / 2;

// Draw line north if connection exists
if (directions & 1) {
    drawLine(centerX, centerY, centerX, tileY);
}

// Draw line east if connection exists
if (directions & 4) {
    drawLine(centerX, centerY, tileX + tileSize, centerY);
}

// Draw line south if connection exists
if (directions & 2) {
    drawLine(centerX, centerY, centerX, tileY + tileSize);
}

// Draw line west if connection exists
if (directions & 8) {
    drawLine(centerX, centerY, tileX, centerY);
}
```

---

**Quick memory aid:**
- **1** = **N**orth (1 syllable, 1 bit)
- **2** = **S**outh (South = 2nd direction alphabetically after North)
- **4** = **E**ast (4 letters in "East")
- **8** = **W**est (W looks like 8 rotated)
