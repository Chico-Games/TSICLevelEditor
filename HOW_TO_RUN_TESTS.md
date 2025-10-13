# How to Run Tests Yourself

Quick guide to running and watching the automated tests on your level editor.

---

## 🚀 Quick Start (3 Commands)

### 1. Open Terminal
Open Command Prompt or PowerShell in the LevelEditor folder:
```bash
cd "c:\Users\Administrator\Documents\Unreal Projects\LevelEditor"
```

### 2. Run Tests (Choose One)

#### Option A: Watch Tests in Browser (Recommended)
```bash
npm run test:headed
```
**What happens:** Browser window opens and you see tests running live!

#### Option B: Fast Headless Tests
```bash
npm test
```
**What happens:** Tests run in background (no browser window), results in terminal

#### Option C: Interactive UI Mode
```bash
npm run test:ui
```
**What happens:** Opens Playwright test UI where you can click tests to run

### 3. View Results
```bash
npm run test:report
```
**What happens:** Opens HTML report with screenshots, videos, and traces

---

## 📋 All Available Commands

| Command | What It Does |
|---------|--------------|
| `npm test` | Run all tests (headless) |
| `npm run test:headed` | Run with visible browser |
| `npm run test:ui` | Open interactive test UI |
| `npm run test:report` | View HTML report |

---

## 🎬 Watch Tests Run

### Step-by-Step Instructions:

1. **Open Command Prompt**
   - Press `Windows + R`
   - Type `cmd` and press Enter

2. **Navigate to folder**
   ```bash
   cd "c:\Users\Administrator\Documents\Unreal Projects\LevelEditor"
   ```

3. **Run tests with visible browser**
   ```bash
   npm run test:headed
   ```

4. **Watch the magic!**
   - Browser window opens automatically
   - You'll see:
     - ✅ Page loading
     - ✅ Colors being selected
     - ✅ Mouse moving and clicking
     - ✅ Tiles being drawn
     - ✅ Tools switching
     - ✅ Layers toggling
     - ✅ All 24 tests executing!

---

## 📸 View Screenshots & Videos

After running tests, view the detailed report:

```bash
npx playwright show-report
```

This opens an interactive HTML report showing:
- ✅ **Screenshots** - Every step of each test
- ✅ **Videos** - Recording of test execution
- ✅ **Traces** - Detailed timeline with network calls
- ✅ **Console Logs** - Any errors or messages
- ✅ **Test Duration** - How long each test took

### In the Report You Can:
- Click any test to see details
- Scrub through video timeline
- View screenshots at each step
- See exactly what the test did
- Debug any failures (if they occur)

---

## 🔍 Run Specific Tests

Want to run just one test?

```bash
npx playwright test tests/playwright.test.js -g "should draw on canvas"
```

Replace "should draw on canvas" with any test name from the suite.

---

## 🎯 Understanding the Output

### Terminal Output:
```
Running 24 tests using 1 worker

  ✓ 1. should load the application successfully (293ms)
  ✓ 2. should load configuration and display biomes (698ms)
  ✓ 3. should load layers from configuration (699ms)
  ...

  24 passed (21.6s)
```

**What it means:**
- ✓ = Test passed
- Number = Test execution order
- (time) = How long it took
- Final line = Summary

---

## 🛠️ Advanced Options

### Run with Debug Mode
```bash
npx playwright test tests/playwright.test.js --debug
```
Opens Playwright Inspector - step through tests one action at a time!

### Run Specific Browser
```bash
npx playwright test tests/playwright.test.js --project=chromium
npx playwright test tests/playwright.test.js --project=firefox
npx playwright test tests/playwright.test.js --project=webkit
```

### Run with Trace Viewer
```bash
npx playwright test tests/playwright.test.js --trace on
npx playwright show-trace test-results/.../trace.zip
```
Opens detailed trace with timeline, screenshots, network, and console!

---

## 📁 Where Test Artifacts Are Saved

After running tests with screenshots/videos:

```
LevelEditor/
├── test-results/          # Test artifacts folder
│   ├── screenshots/       # Screenshots for each test
│   ├── videos/           # Video recordings
│   └── traces/           # Execution traces
└── playwright-report/    # HTML report
    └── index.html       # Open this in browser
```

---

## 🎨 What You'll See When Tests Run

### Test #6: Draw on Canvas
1. Browser opens to your editor
2. Mouse clicks "Grassland" color (green)
3. Green color highlighted with blue border
4. Mouse moves to canvas at position (100, 100)
5. Mouse drags to (150, 150)
6. Green line appears on canvas
7. Statistics update: "Tiles: 50"
8. ✓ Test passes!

### Test #8: Bucket Fill
1. Bucket tool selected
2. "Ocean" color clicked (blue)
3. Mouse clicks empty canvas
4. WHOOSH! Entire area fills with blue
5. Statistics: "Tiles: 5,248"
6. ✓ Test passes!

### Test #10: Undo/Redo
1. Some tiles drawn
2. Undo button clicked
3. Tiles disappear
4. Redo button clicked
5. Tiles reappear
6. ✓ Test passes!

---

## ⚡ Quick Reference Card

```
╔══════════════════════════════════════════════════════╗
║           QUICK TEST COMMANDS REFERENCE              ║
╠══════════════════════════════════════════════════════╣
║  Watch tests:       npm run test:headed              ║
║  Fast tests:        npm test                         ║
║  Interactive:       npm run test:ui                  ║
║  View report:       npm run test:report              ║
║  Debug mode:        npx playwright test --debug      ║
║  One test:          npx playwright test -g "name"    ║
╚══════════════════════════════════════════════════════╝
```

---

## 🎯 Recommended Workflow

### For Daily Testing:
```bash
npm run test:headed
```
Quick visual confirmation everything works.

### Before Deploying:
```bash
npm test
npm run test:report
```
Full test suite + review detailed report.

### When Debugging:
```bash
npx playwright test --debug
```
Step through tests to find issues.

---

## 🐛 Troubleshooting

### "npm not found"
Install Node.js from [nodejs.org](https://nodejs.org/)

### "Command not found"
Make sure you're in the correct directory:
```bash
cd "c:\Users\Administrator\Documents\Unreal Projects\LevelEditor"
```

### Tests fail
1. Check browser console (F12) for errors
2. Run with debug mode: `npx playwright test --debug`
3. View trace: `npm run test:report`

### Browser doesn't open
- Try: `npx playwright install`
- Check firewall isn't blocking Chromium

---

## 📚 Learn More

- **Full testing guide:** [TESTING.md](TESTING.md)
- **Visual guide:** [TEST_VISUAL_GUIDE.md](TEST_VISUAL_GUIDE.md)
- **Test results:** [TEST_RESULTS.md](TEST_RESULTS.md)
- **Playwright docs:** [playwright.dev](https://playwright.dev)

---

## 🎊 That's It!

You now know how to:
- ✅ Run tests yourself
- ✅ Watch them execute live
- ✅ View screenshots and videos
- ✅ Debug any issues
- ✅ Analyze test results

**Go test your editor!** 🚀

---

**Pro Tip:** Add this to your regular workflow - run tests after making changes to catch bugs early!
