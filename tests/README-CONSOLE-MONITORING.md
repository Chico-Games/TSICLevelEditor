# Console Monitoring in Tests

All Playwright tests now automatically monitor browser console logs for errors and warnings.

## How It Works

Every test automatically:
- ✅ Monitors console.error() calls
- ✅ Monitors console.warn() calls
- ✅ Monitors uncaught JavaScript exceptions
- ✅ Fails the test if any errors or warnings are detected

## Setup

All test files use the custom test fixture from `test-base.js`:

```javascript
const { test, expect } = require('./test-base');
```

This replaces the standard Playwright import:
```javascript
// OLD - don't use this anymore
const { test, expect } = require('@playwright/test');
```

## Known Benign Errors

The following errors are automatically filtered out as they are expected:
- 404 errors for missing resources (favicon.ico, test-map.json)
- These won't cause tests to fail

## Example

If your code triggers a console error:
```javascript
console.error('Something went wrong');
```

The test will automatically fail with a clear message:
```
Error: Test "my test name" had 1 console error(s):
  1. Something went wrong
```

## Benefits

- Catches JavaScript errors that might otherwise go unnoticed
- Ensures clean console output across the application
- Prevents warnings from accumulating over time
- Makes debugging easier by surfacing issues immediately

## Disabling for Specific Tests

If you need to intentionally trigger console errors/warnings in a test (e.g., testing error handling), you can still manually add listeners in individual tests to override the global monitoring.
