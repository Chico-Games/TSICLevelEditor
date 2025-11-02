# Test Suite for TSIC Level Editor

This directory contains automated tests for the TSIC Level Editor.

## Quick Start

### Option 1: Playwright Tests (Recommended)

**Install:**
```bash
npm install
npm run install-browsers
```

**Run tests:**
```bash
npm test                  # Run all tests
npm run test:ui          # Run with UI mode (interactive)
npm run test:headed      # Run with visible browser
npm run test:report      # Generate HTML report
```

### Option 2: Python + Selenium

**Install:**
```bash
pip install selenium webdriver-manager
```

**Run tests:**
```bash
npm run test:python
# or
python tests/selenium_test.py
```

## Test Files

### `playwright.test.js`
Comprehensive E2E test suite with 25+ tests covering:
- Page loading and initialization
- Configuration loading
- All drawing tools
- Layer management
- Keyboard shortcuts
- Undo/Redo
- File operations
- Zoom and pan
- Statistics and minimap

### `selenium_test.py`
Python-based test suite with 14 tests covering core functionality:
- Basic UI loading
- Drawing operations
- Tool switching
- Layer operations
- Keyboard shortcuts

## Test Coverage

Both test suites verify:
- ✅ All UI elements load correctly
- ✅ Configuration loads from JSON
- ✅ Drawing tools work (pencil, bucket, line, rectangle, eraser, eyedropper)
- ✅ Brush sizes work
- ✅ Layer management (add, remove, visibility, opacity)
- ✅ Undo/Redo functionality
- ✅ Keyboard shortcuts
- ✅ Zoom and pan controls
- ✅ Statistics update correctly
- ✅ Minimap renders

## Running Specific Tests

**Playwright - Run one test:**
```bash
npx playwright test tests/playwright.test.js -g "should draw on canvas"
```

**Playwright - Debug mode:**
```bash
npx playwright test tests/playwright.test.js --debug
```

**Playwright - Multiple browsers:**
```bash
npx playwright test tests/playwright.test.js --project=chromium
npx playwright test tests/playwright.test.js --project=firefox
npx playwright test tests/playwright.test.js --project=webkit
```

## CI/CD Integration

These tests are designed to run in CI/CD pipelines. See [TESTING.md](../TESTING.md) for GitHub Actions example.

## Manual Testing

For manual testing checklist, see [TESTING.md](../TESTING.md).

## Troubleshooting

### Tests fail with "Cannot find index.html"
- Make sure you're running tests from the project root
- Check that `index.html` exists in the parent directory

### Playwright browsers not installed
```bash
npm run install-browsers
```

### Python test fails with "chromedriver not found"
```bash
pip install webdriver-manager
```

### Tests timeout
- Increase timeout in test file
- Check if application loads correctly in browser manually
- Verify no JavaScript errors in console (F12)

## Writing New Tests

### Add Playwright test:
```javascript
test('should do something', async ({ page }) => {
    await page.waitForTimeout(500);

    // Your test code here
    const element = page.locator('#some-id');
    await expect(element).toBeVisible();
});
```

### Add Python test:
```python
def test_15_new_feature(self):
    """Test new feature"""
    print("\n[TEST] New feature")

    time.sleep(0.5)

    # Your test code here
    element = self.driver.find_element(By.ID, "some-id")
    self.assertTrue(element.is_displayed())

    print("  ✓ Feature works")
```

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Selenium Documentation](https://www.selenium.dev/documentation/)
- [Full Testing Guide](../TESTING.md)

## Test Results

After running tests, you'll see:
- ✅ Pass count
- ❌ Failure count
- ⏱️ Execution time
- 📊 HTML report (with `npm run test:report`)

Happy testing! 🧪
