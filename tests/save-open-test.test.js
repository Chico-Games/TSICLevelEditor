/**
 * Save and Open Functionality Tests
 * Tests that Save and Open buttons work correctly after removing Export
 */

const { test, expect } = require('./test-base');

test.describe('Save and Open Functionality', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(1000); // Wait for initialization
    });

    test('should have Open button (no Export button)', async ({ page }) => {
        // Verify Open button exists
        const openBtn = await page.locator('#btn-load');
        await expect(openBtn).toBeVisible();
        const openText = await openBtn.textContent();
        expect(openText).toBe('Open');

        // Verify Save button exists
        const saveBtn = await page.locator('#btn-save');
        await expect(saveBtn).toBeVisible();

        // Verify Export button does NOT exist
        const exportBtn = await page.locator('#btn-export');
        await expect(exportBtn).toHaveCount(0);

        // Verify export dialog does NOT exist
        const exportDialog = await page.locator('#export-dialog');
        await expect(exportDialog).toHaveCount(0);
    });

    test('should not throw error when Ctrl+E is pressed', async ({ page }) => {
        // Setup console error listener
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        // Setup page error listener
        const pageErrors = [];
        page.on('pageerror', error => {
            pageErrors.push(error.message);
        });

        // Press Ctrl+E (old export shortcut)
        await page.keyboard.press('Control+E');
        await page.waitForTimeout(500);

        // Should have no errors (Ctrl+E should do nothing now)
        expect(consoleErrors.length).toBe(0);
        expect(pageErrors.length).toBe(0);

        // Status message should not show export-related messages
        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).not.toContain('Export');
    });

    test('Save button should trigger download', async ({ page }) => {
        // Draw something so we have data to save
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

        // Setup download listener
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 });

        // Click Save button
        await page.click('#btn-save');

        // Wait for download to start
        const download = await downloadPromise;

        // Verify download filename matches pattern
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/level_\d+\.json/);

        // Verify status message
        await page.waitForTimeout(500);
        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).toBe('Level saved');
    });

    test('Ctrl+S should trigger Save', async ({ page }) => {
        // Draw something
        await page.click('[data-tool="pencil"]');
        const firstColor = await page.locator('.color-item').first();
        await firstColor.click();

        const canvas = await page.locator('#grid-canvas');
        const box = await canvas.boundingBox();
        await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

        // Setup download listener
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 });

        // Press Ctrl+S
        await page.keyboard.press('Control+S');

        // Wait for download
        const download = await downloadPromise;
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/level_\d+\.json/);
    });

    test('Open button should open file picker', async ({ page }) => {
        // Get the hidden file input
        const fileInput = await page.locator('#file-input');

        // Verify it exists and is hidden
        await expect(fileInput).toHaveCount(1);
        const isVisible = await fileInput.isVisible();
        expect(isVisible).toBe(false);

        // Click Open button should trigger file input
        await page.click('#btn-load');

        // File input should receive the click (we can't verify the picker opens, but we can check no errors)
        await page.waitForTimeout(500);

        // No JavaScript errors should occur
        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).not.toContain('error');
        expect(statusMsg).not.toContain('Error');
    });

    test('Ctrl+O should trigger Open', async ({ page }) => {
        // Press Ctrl+O
        await page.keyboard.press('Control+O');

        // Should trigger file input (no errors)
        await page.waitForTimeout(500);

        const statusMsg = await page.locator('#status-message').textContent();
        expect(statusMsg).not.toContain('error');
        expect(statusMsg).not.toContain('Error');
    });

    test('should not have any broken references to removed elements', async ({ page }) => {
        // Setup error listeners
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        const pageErrors = [];
        page.on('pageerror', error => {
            pageErrors.push(error.message);
        });

        // Try various actions that might trigger errors
        await page.click('#btn-new');
        await page.waitForTimeout(200);

        await page.click('#btn-load-test-map');
        await page.waitForTimeout(2000);

        await page.keyboard.press('Control+S');
        await page.waitForTimeout(500);

        // Check for errors related to removed elements
        const relevantErrors = [...consoleErrors, ...pageErrors].filter(err =>
            err.includes('export-dialog') ||
            err.includes('export-confirm') ||
            err.includes('export-cancel') ||
            err.includes('btn-export') ||
            err.includes('exportLevel')
        );

        expect(relevantErrors.length).toBe(0);
    });
});
