# Testing Guide for Biome Level Editor

This document provides comprehensive testing strategies for the Biome Level Editor, including automated tests, manual testing checklists, and instructions for setting up browser automation.

## Table of Contents

1. [Automated Testing](#automated-testing)
2. [Manual Testing](#manual-testing)
3. [Browser Automation with MCP](#browser-automation-with-mcp)
4. [Performance Testing](#performance-testing)
5. [Cross-Browser Testing](#cross-browser-testing)

---

## Automated Testing

We provide two automated testing options:

### Option 1: Playwright Tests (Recommended)

**Prerequisites:**
```bash
npm install -D @playwright/test
npx playwright install
```

**Run tests:**
```bash
# Run all tests
npx playwright test tests/playwright.test.js

# Run with UI mode (see tests running in browser)
npx playwright test tests/playwright.test.js --ui

# Run in headed mode (see browser)
npx playwright test tests/playwright.test.js --headed

# Run specific test
npx playwright test tests/playwright.test.js -g "should draw on canvas"

# Generate HTML report
npx playwright test tests/playwright.test.js --reporter=html
```

**What it tests:**
- ✅ Page loading and initialization
- ✅ Configuration loading (biomes & layers)
- ✅ Color selection from palette
- ✅ Tool switching (pencil, bucket, line, rectangle, eraser, eyedropper)
- ✅ Drawing on canvas
- ✅ Brush size changes
- ✅ Undo/Redo functionality
- ✅ Keyboard shortcuts
- ✅ Layer management (visibility, opacity, add/remove)
- ✅ Zoom controls
- ✅ Statistics updates
- ✅ Minimap rendering
- ✅ File operations (export)

**Test count:** 25+ comprehensive tests

---

### Option 2: Python + Selenium Tests

**Prerequisites:**
```bash
pip install selenium webdriver-manager
```

**Run tests:**
```bash
python tests/selenium_test.py
```

**What it tests:**
- ✅ Page loading
- ✅ Configuration loading
- ✅ Color selection
- ✅ Tool switching
- ✅ Keyboard shortcuts
- ✅ Drawing functionality
- ✅ Brush size
- ✅ Undo/Redo
- ✅ Layer operations
- ✅ Zoom controls
- ✅ Statistics
- ✅ Minimap

**Test count:** 14 core functionality tests

---

## Manual Testing

Use this checklist to verify all functionality works as expected.

### 🎨 Initial Load

- [ ] Page loads without errors (check browser console with F12)
- [ ] All UI panels are visible (toolbar, tools panel, canvas, layers panel)
- [ ] Color palette displays all biomes from config
- [ ] Layers panel shows default layers
- [ ] Canvas and minimap are rendered
- [ ] Status bar shows position and messages

### 🖌️ Drawing Tools

#### Pencil Tool (B)
- [ ] Select pencil tool (should be active by default)
- [ ] Click on canvas to place single tile
- [ ] Click and drag to draw continuous line
- [ ] Change brush size to 3x3, verify larger brush
- [ ] Draw with different colors
- [ ] Verify tiles appear on canvas and minimap

#### Bucket Fill (G)
- [ ] Select bucket tool
- [ ] Click on empty area - should fill large region
- [ ] Draw some tiles with pencil, change color, use bucket on those tiles
- [ ] Verify bucket only fills connected tiles of same color

#### Line Tool (L)
- [ ] Select line tool
- [ ] Click once to start, click again to finish
- [ ] Verify straight line is drawn
- [ ] Try different brush sizes with line
- [ ] Preview should show while dragging

#### Rectangle Tool (R)
- [ ] Select rectangle tool
- [ ] Draw filled rectangle
- [ ] Change fill mode to "outline"
- [ ] Draw outline-only rectangle
- [ ] Preview should show while dragging

#### Eyedropper (I)
- [ ] Draw some colored tiles
- [ ] Select eyedropper
- [ ] Click on a colored tile
- [ ] Verify that color becomes selected
- [ ] Check current color display updates

#### Eraser (E)
- [ ] Draw some tiles
- [ ] Select eraser tool
- [ ] Erase some tiles
- [ ] Verify tiles are removed
- [ ] Try different brush sizes

### ⌨️ Keyboard Shortcuts

**Tool shortcuts:**
- [ ] Press `B` → Pencil activates
- [ ] Press `G` → Bucket activates
- [ ] Press `L` → Line activates
- [ ] Press `R` → Rectangle activates
- [ ] Press `I` → Eyedropper activates
- [ ] Press `E` → Eraser activates

**Action shortcuts:**
- [ ] Draw something, press `Ctrl+Z` → Undo works
- [ ] Press `Ctrl+Y` or `Ctrl+Shift+Z` → Redo works
- [ ] Press `+` → Zoom in
- [ ] Press `-` → Zoom out
- [ ] Press `Ctrl+S` → Save dialog appears
- [ ] Press `Ctrl+N` → New level (with confirmation)

### 🎭 Layers

- [ ] Click on different layers to switch active layer
- [ ] Active layer is highlighted
- [ ] Draw on one layer, switch to another, verify drawing stays on correct layer
- [ ] Toggle layer visibility checkbox - layer disappears/appears
- [ ] Adjust opacity slider - layer becomes more/less transparent
- [ ] Lock a layer - verify you can't draw on it
- [ ] Click "+" to add new layer
- [ ] Delete a layer (should keep at least 1 layer)

### 🔍 View Controls

**Zoom:**
- [ ] Click zoom in (+) → View zooms in
- [ ] Click zoom out (-) → View zooms out
- [ ] Zoom level displays current percentage
- [ ] Click "Fit" → View fits grid to window
- [ ] Mouse wheel zoom works (if supported)

**Pan:**
- [ ] Hold Shift + drag → Pan around canvas
- [ ] Middle mouse button drag → Pan around canvas

**Grid:**
- [ ] Toggle "Show Grid" → Grid lines appear/disappear
- [ ] Grid lines should be visible at high zoom, subtle at low zoom

### 📊 Statistics

- [ ] Draw tiles → "Tiles" count increases
- [ ] "Empty" count decreases correspondingly
- [ ] Erase tiles → Counts update correctly
- [ ] Total should always equal grid size (e.g., 256×256 = 65,536)

### 🗺️ Minimap

- [ ] Minimap shows overview of entire level
- [ ] Draw tiles → They appear on minimap
- [ ] Colors match main canvas
- [ ] Blue viewport rectangle shows current view
- [ ] Pan/zoom → Viewport rectangle updates

### 💾 File Operations

**New:**
- [ ] Click "New" → Shows confirmation if unsaved changes
- [ ] Canvas clears
- [ ] Undo stack clears

**Save:**
- [ ] Draw something
- [ ] Click "Save" → JSON file downloads
- [ ] Filename includes timestamp

**Load:**
- [ ] Click "Load"
- [ ] Select a saved JSON file
- [ ] Level loads correctly with all layers
- [ ] Colors and positions match

**Export:**
- [ ] Click "Export"
- [ ] JSON file downloads with "export" in filename
- [ ] Open in text editor - verify format is correct

### 🔄 Undo/Redo

- [ ] Draw something → Undo button enabled
- [ ] Click undo → Drawing reverts
- [ ] Redo button becomes enabled
- [ ] Click redo → Drawing reappears
- [ ] Do multiple actions → Undo multiple times
- [ ] Undo all → Canvas returns to initial state
- [ ] Redo all → All actions reapplied
- [ ] Make new action after undo → Redo stack clears

### 🎨 Color Palette

- [ ] All configured biomes appear
- [ ] Click a color → It highlights with blue border
- [ ] Current color box updates to match
- [ ] Current color label shows biome name
- [ ] Selected color persists when switching tools

### 🖱️ Mouse Interactions

- [ ] Hover over canvas → Position in status bar updates
- [ ] Click → Draws at correct position
- [ ] Drag → Continuous drawing works
- [ ] Mouse leave canvas → Preview clears
- [ ] Preview shows correct brush size/shape

### 📐 Grid Size

- [ ] Change width/height values
- [ ] Click "Resize"
- [ ] Grid resizes (existing tiles preserved if within bounds)
- [ ] Minimap updates to new size
- [ ] Statistics update for new total

### 💾 Auto-save

- [ ] Make changes
- [ ] Wait 30 seconds
- [ ] "Auto-saved" message appears in status bar
- [ ] Refresh page → Option to load auto-save appears
- [ ] Load auto-save → Changes restored

---

## Browser Automation with MCP

For AI-powered browser automation during development, you can use the Playwright MCP server.

### Setup Playwright MCP

**Option 1: Using Smithery (Automated)**
```bash
npx @smithery/cli install @executeautomation/playwright-mcp-server --client claude
```

**Option 2: Manual Configuration**

1. Locate your Claude configuration:
   - Windows: `C:\Users\{username}\AppData\Roaming\Claude\claude_desktop_config.json`
   - Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. Add this configuration:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

3. Restart Claude Desktop completely (close and reopen)

4. Install Playwright browsers:
```bash
npx playwright install chromium
```

### Using Playwright MCP with Claude

Once configured, you can ask Claude to:

```
"Use Playwright to open my level editor at file:///path/to/index.html and test the drawing tools"

"Navigate to the level editor and take a screenshot of the minimap"

"Test the bucket fill tool on the level editor"

"Verify all biomes load correctly in the color palette"
```

Claude will be able to:
- Navigate to your local file
- Click buttons and elements
- Fill forms
- Take screenshots
- Execute JavaScript
- Verify element states

### MCP Commands Available

When Playwright MCP is active, these tools become available:
- `mcp__playwright__navigate` - Navigate to URL
- `mcp__playwright__click` - Click elements
- `mcp__playwright__screenshot` - Take screenshots
- `mcp__playwright__fill` - Fill input fields
- `mcp__playwright__evaluate` - Execute JavaScript

---

## Performance Testing

### Test Large Grids

1. Create 512×512 grid
2. Use bucket fill to fill large areas
3. Verify:
   - [ ] Canvas renders smoothly
   - [ ] No lag when drawing
   - [ ] Minimap updates quickly
   - [ ] Zoom/pan remain responsive

### Test Memory Usage

1. Open browser DevTools (F12) → Performance tab
2. Draw extensively for 5 minutes
3. Check memory usage doesn't continuously increase
4. Test undo/redo doesn't leak memory

### Test Many Layers

1. Add 10+ layers
2. Draw on all layers
3. Verify:
   - [ ] Rendering remains smooth
   - [ ] Layer switching is instant
   - [ ] Opacity blending works correctly

---

## Cross-Browser Testing

Test in these browsers to ensure compatibility:

### Chrome/Edge (Chromium)
- [ ] All features work
- [ ] Canvas renders correctly
- [ ] Performance is good
- [ ] Shortcuts work

### Firefox
- [ ] All features work
- [ ] Canvas renders correctly
- [ ] Keyboard shortcuts work (may vary)
- [ ] File operations work

### Safari (Mac/iOS)
- [ ] Page loads
- [ ] Drawing works
- [ ] Touch events work on iPad
- [ ] Cmd key shortcuts work (instead of Ctrl)

### Mobile Browsers
- [ ] Page is usable on tablets
- [ ] Touch drawing works
- [ ] Pinch zoom works
- [ ] UI is readable

---

## Common Issues

### Config Doesn't Load
**Symptoms:** No colors in palette, default layers only
**Fix:**
- Check `config/biomes.json` exists
- Verify JSON is valid (use jsonlint.com)
- Check browser console for errors (F12)
- Ensure file is served correctly (no CORS issues)

### Drawing Doesn't Work
**Symptoms:** Clicking canvas does nothing
**Fix:**
- Check if a color is selected
- Check if layer is locked
- Check browser console for JavaScript errors
- Verify canvas is initialized (should see grid)

### Undo/Redo Broken
**Symptoms:** Buttons disabled or don't work
**Fix:**
- Undo only works after making changes
- Check browser console for errors
- Verify you're not in a locked layer

### Performance Issues
**Symptoms:** Lag when drawing, slow rendering
**Fix:**
- Reduce grid size
- Disable grid lines
- Use fewer layers
- Close other browser tabs
- Update graphics drivers

---

## Reporting Bugs

When reporting issues, include:
1. Browser name and version
2. Operating system
3. Steps to reproduce
4. Expected vs actual behavior
5. Browser console errors (F12 → Console)
6. Screenshot if applicable

---

## Running All Tests

### Quick Test Suite
```bash
# Playwright (comprehensive)
npx playwright test tests/playwright.test.js --reporter=list

# Python Selenium (basic)
python tests/selenium_test.py
```

### Full Test Suite
```bash
# Run Playwright with all browsers
npx playwright test tests/playwright.test.js --project=chromium
npx playwright test tests/playwright.test.js --project=firefox
npx playwright test tests/playwright.test.js --project=webkit

# Generate HTML report
npx playwright show-report
```

---

## Continuous Integration

To run tests in CI/CD:

**GitHub Actions Example:**
```yaml
name: Test Level Editor

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          npm install -D @playwright/test
          npx playwright install --with-deps chromium
      - name: Run tests
        run: npx playwright test tests/playwright.test.js
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Summary

You now have:
- ✅ **25+ automated Playwright tests** for comprehensive coverage
- ✅ **14 Python Selenium tests** for simpler testing
- ✅ **Complete manual testing checklist** for human verification
- ✅ **MCP setup guide** for AI-powered browser automation
- ✅ **Performance testing guidelines**
- ✅ **Cross-browser testing checklist**

**Recommended Testing Workflow:**
1. Run automated tests before each release
2. Manual test new features
3. Cross-browser test before major releases
4. Use MCP for quick development testing
5. Performance test with large grids

Happy testing! 🧪✨
