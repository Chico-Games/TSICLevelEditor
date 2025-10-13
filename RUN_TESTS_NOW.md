# Run Tests Right Now! 🧪

Quick guide to immediately test your Biome Level Editor.

## Option 1: Playwright Tests (BEST - 25+ tests)

### Step 1: Install
```bash
cd "c:\Users\Administrator\Documents\Unreal Projects\LevelEditor"
npm install
npm run install-browsers
```

### Step 2: Run Tests
```bash
# Run all tests (30 seconds)
npm test

# OR run with UI mode (see tests in action)
npm run test:ui

# OR run with visible browser
npm run test:headed

# OR generate HTML report
npm run test:report
```

### Expected Output:
```
Running 25 tests using 1 worker

  ✓ should load the application successfully
  ✓ should load configuration and display biomes
  ✓ should load layers from configuration
  ✓ should select a color from palette
  ✓ should switch between tools
  ✓ should draw on canvas with pencil tool
  ✓ should change brush size
  ✓ should use bucket fill tool
  ✓ should use eraser tool
  ✓ should undo and redo actions
  ... (15 more tests)

  25 passed (34.5s)
```

✅ **If all 25 tests pass, your editor works perfectly!**

---

## Option 2: Python Selenium Tests (14 tests)

### Step 1: Install
```bash
pip install selenium webdriver-manager
```

### Step 2: Run Tests
```bash
cd "c:\Users\Administrator\Documents\Unreal Projects\LevelEditor"
python tests\selenium_test.py
```

### Expected Output:
```
============================================================
  BIOME LEVEL EDITOR - SELENIUM TEST SUITE
============================================================

[TEST] Page loads with all elements
  ✓ All main elements loaded

[TEST] Configuration loads biomes
  ✓ Loaded 24 biomes

[TEST] Layers load from configuration
  ✓ Loaded 4 layers

... (11 more tests)

============================================================
  TEST SUMMARY
============================================================
  Tests run: 14
  Successes: 14
  Failures: 0
  Errors: 0
============================================================
```

✅ **If all 14 tests pass, core functionality works!**

---

## Option 3: Manual Testing (5 minutes)

### Quick Smoke Test

1. **Open the editor:**
   ```
   Open: C:\Users\Administrator\Documents\Unreal Projects\LevelEditor\index.html
   ```

2. **Test basic functionality:**
   - [ ] Page loads without errors
   - [ ] Color palette shows biomes
   - [ ] Click a color (e.g., Grassland)
   - [ ] Click and drag on canvas to draw
   - [ ] See tiles appear
   - [ ] Press `Ctrl+Z` to undo
   - [ ] Click "G" for bucket fill
   - [ ] Click canvas - fills large area
   - [ ] Switch layers on the right
   - [ ] Zoom in/out with +/- buttons

3. **If all steps work → Editor is functional! ✅**

---

## Troubleshooting

### "npm not found"
Install Node.js from [nodejs.org](https://nodejs.org/)

### "python not found"
Install Python from [python.org](https://www.python.org/)

### Tests fail with "Cannot find index.html"
Make sure you're in the correct directory:
```bash
cd "c:\Users\Administrator\Documents\Unreal Projects\LevelEditor"
```

### Chrome/Browser not found
```bash
# For Playwright:
npm run install-browsers

# For Selenium:
pip install --upgrade webdriver-manager
```

---

## What Gets Tested?

### ✅ All Drawing Tools
- Pencil (freehand drawing)
- Bucket fill (flood fill)
- Line tool
- Rectangle tool
- Eyedropper (color picker)
- Eraser

### ✅ All Features
- Color selection
- Brush sizes
- Undo/Redo
- Keyboard shortcuts
- Layer management
- Zoom/pan controls
- File operations
- Statistics
- Minimap

### ✅ Edge Cases
- Empty canvas behavior
- Multiple layers
- Large brush sizes
- Tool switching
- Configuration loading

---

## Next Steps After Testing

### If All Tests Pass ✅
1. Your editor is production-ready!
2. Customize `config/biomes.json` with your game's biomes
3. Deploy to web (see [DEPLOYMENT.md](DEPLOYMENT.md))
4. Share with your team!

### If Tests Fail ❌
1. Check browser console (F12) for errors
2. Verify `config/biomes.json` is valid
3. Try manual testing to isolate issue
4. Check [TESTING.md](TESTING.md) troubleshooting section

---

## Test Reports

### View Playwright Report
```bash
npm run test:report
```
Opens interactive HTML report in browser showing:
- Which tests passed/failed
- Screenshots
- Video recordings
- Execution timeline
- Error details

### View Selenium Results
Results print to console automatically.

---

## Quick Commands Reference

```bash
# Playwright
npm test                    # Run all tests
npm run test:ui            # Interactive UI mode
npm run test:headed        # Show browser
npm run test:report        # HTML report

# Python
python tests\selenium_test.py

# Manual
# Just open index.html in browser!
```

---

## Performance Expectations

- **Playwright:** ~30-45 seconds for all 25 tests
- **Selenium:** ~40-60 seconds for all 14 tests
- **Manual:** ~5 minutes for smoke test

---

## CI/CD Integration

Once tests pass locally, add to your CI pipeline:

```yaml
# .github/workflows/test.yml
name: Test
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx playwright install --with-deps
      - run: npm test
```

---

## Getting Help

- **Full testing guide:** [TESTING.md](TESTING.md)
- **Test summary:** [TEST_SUMMARY.md](TEST_SUMMARY.md)
- **Quick start:** [tests/README.md](tests/README.md)
- **Main docs:** [README.md](README.md)

---

## TL;DR - Fastest Test

```bash
cd "c:\Users\Administrator\Documents\Unreal Projects\LevelEditor"
npm install && npm run install-browsers && npm test
```

✅ **Done! If tests pass, you're good to go!** 🎉

---

*For AI-powered testing with Claude, see the "Browser Automation with MCP" section in [TESTING.md](TESTING.md).*
