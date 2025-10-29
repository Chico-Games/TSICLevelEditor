/**
 * Color Search Tests
 * Verifies that the color palette search functionality works correctly
 */

const { test, expect } = require('./test-base');

test.describe('Color Search', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForSelector('#grid-canvas');
        await page.waitForTimeout(500);
    });

    test('search input should be visible', async ({ page }) => {
        const searchInput = await page.locator('#color-search');
        await expect(searchInput).toBeVisible();

        const placeholder = await searchInput.getAttribute('placeholder');
        expect(placeholder).toBe('Search colors...');
    });

    test('clear button should be hidden initially', async ({ page }) => {
        const clearButton = await page.locator('#color-search-clear');
        const isVisible = await clearButton.evaluate(el => el.classList.contains('visible'));
        expect(isVisible).toBe(false);
    });

    test('typing in search should show clear button', async ({ page }) => {
        const searchInput = await page.locator('#color-search');
        const clearButton = await page.locator('#color-search-clear');

        await searchInput.fill('grass');
        await page.waitForTimeout(100);

        const isVisible = await clearButton.evaluate(el => el.classList.contains('visible'));
        expect(isVisible).toBe(true);
    });

    test('should filter colors by partial name match', async ({ page }) => {
        const searchInput = await page.locator('#color-search');
        await searchInput.fill('show');
        await page.waitForTimeout(200);

        // Count visible color items
        const visibleColors = await page.evaluate(() => {
            const colorItems = document.querySelectorAll('.color-item');
            return Array.from(colorItems).filter(item => !item.classList.contains('hidden')).length;
        });

        console.log(`Visible colors after searching "show": ${visibleColors}`);

        // Should have at least one match (e.g., Biome_ShowFloor)
        expect(visibleColors).toBeGreaterThan(0);

        // Verify that all visible colors contain "show" in their name
        const allMatchShow = await page.evaluate(() => {
            const colorItems = document.querySelectorAll('.color-item:not(.hidden)');
            return Array.from(colorItems).every(item =>
                item.dataset.name.toLowerCase().includes('show')
            );
        });

        expect(allMatchShow).toBe(true);
    });

    test('should be case-insensitive', async ({ page }) => {
        const searchInput = await page.locator('#color-search');

        // Test with uppercase
        await searchInput.fill('WAREHOUSE');
        await page.waitForTimeout(200);

        const visibleColorsUpper = await page.evaluate(() => {
            const colorItems = document.querySelectorAll('.color-item:not(.hidden)');
            return colorItems.length;
        });

        // Clear and test with lowercase
        await searchInput.fill('');
        await page.waitForTimeout(100);
        await searchInput.fill('warehouse');
        await page.waitForTimeout(200);

        const visibleColorsLower = await page.evaluate(() => {
            const colorItems = document.querySelectorAll('.color-item:not(.hidden)');
            return colorItems.length;
        });

        // Should return same results
        expect(visibleColorsUpper).toBe(visibleColorsLower);
        expect(visibleColorsUpper).toBeGreaterThan(0);
    });

    test('should match by category name', async ({ page }) => {
        const searchInput = await page.locator('#color-search');
        await searchInput.fill('Biomes');
        await page.waitForTimeout(200);

        // Should show all colors in the Biomes category
        const result = await page.evaluate(() => {
            const categories = document.querySelectorAll('.color-category');
            let biomeCategory = null;

            for (const category of categories) {
                const header = category.querySelector('.color-category-header');
                if (header && header.textContent.includes('Biomes')) {
                    biomeCategory = category;
                    break;
                }
            }

            if (!biomeCategory) return { exists: false };

            const isHidden = biomeCategory.classList.contains('hidden');
            const colorItems = biomeCategory.querySelectorAll('.color-item');
            const visibleItems = Array.from(colorItems).filter(item => !item.classList.contains('hidden')).length;

            return {
                exists: true,
                isHidden,
                totalItems: colorItems.length,
                visibleItems
            };
        });

        console.log('Biomes category search result:', result);

        expect(result.exists).toBe(true);
        expect(result.isHidden).toBe(false);
        expect(result.visibleItems).toBeGreaterThan(0);
        expect(result.visibleItems).toBe(result.totalItems); // All biome colors should be visible
    });

    test('clear button should reset search', async ({ page }) => {
        const searchInput = await page.locator('#color-search');
        const clearButton = await page.locator('#color-search-clear');

        // Enter search query
        await searchInput.fill('grass');
        await page.waitForTimeout(200);

        const visibleBeforeClear = await page.evaluate(() => {
            return document.querySelectorAll('.color-item:not(.hidden)').length;
        });

        // Click clear button
        await clearButton.click();
        await page.waitForTimeout(200);

        const visibleAfterClear = await page.evaluate(() => {
            return document.querySelectorAll('.color-item:not(.hidden)').length;
        });

        const inputValue = await searchInput.inputValue();

        // After clearing, all colors should be visible again
        expect(inputValue).toBe('');
        expect(visibleAfterClear).toBeGreaterThan(visibleBeforeClear);

        // Clear button should be hidden again
        const isVisible = await clearButton.evaluate(el => el.classList.contains('visible'));
        expect(isVisible).toBe(false);
    });

    test('Escape key should clear search', async ({ page }) => {
        const searchInput = await page.locator('#color-search');

        // Enter search query
        await searchInput.fill('grass');
        await page.waitForTimeout(200);

        // Press Escape
        await searchInput.press('Escape');
        await page.waitForTimeout(200);

        const inputValue = await searchInput.inputValue();
        const visibleColors = await page.evaluate(() => {
            return document.querySelectorAll('.color-item:not(.hidden)').length;
        });

        expect(inputValue).toBe('');
        expect(visibleColors).toBeGreaterThan(10); // Should show many colors again
    });

    test('should show "no results" message for non-matching query', async ({ page }) => {
        const searchInput = await page.locator('#color-search');
        await searchInput.fill('xyznonexistent');
        await page.waitForTimeout(200);

        const noResultsMsg = await page.evaluate(() => {
            const msg = document.querySelector('.search-no-results');
            return msg ? {
                exists: true,
                visible: msg.style.display !== 'none',
                text: msg.textContent
            } : { exists: false };
        });

        expect(noResultsMsg.exists).toBe(true);
        expect(noResultsMsg.visible).toBe(true);
        expect(noResultsMsg.text).toContain('No colors found');
        expect(noResultsMsg.text).toContain('xyznonexistent');
    });

    test('should hide categories with no matches', async ({ page }) => {
        const searchInput = await page.locator('#color-search');

        // Search for something specific that should only be in one category
        await searchInput.fill('Radiation');
        await page.waitForTimeout(200);

        const categoryVisibility = await page.evaluate(() => {
            const categories = document.querySelectorAll('.color-category');
            return Array.from(categories).map(cat => {
                const header = cat.querySelector('.color-category-header');
                return {
                    name: header ? header.textContent : 'Unknown',
                    hidden: cat.classList.contains('hidden')
                };
            });
        });

        console.log('Category visibility after searching "Radiation":', categoryVisibility);

        // At least one category should be hidden
        const hiddenCategories = categoryVisibility.filter(cat => cat.hidden);
        expect(hiddenCategories.length).toBeGreaterThan(0);

        // At least one category should be visible (the one with Radiation hazards)
        const visibleCategories = categoryVisibility.filter(cat => !cat.hidden);
        expect(visibleCategories.length).toBeGreaterThan(0);
    });

    test('should auto-expand categories with matches', async ({ page }) => {
        const searchInput = await page.locator('#color-search');

        // First, collapse a category
        const categoryHeader = await page.locator('.color-category-header').first();
        await categoryHeader.click();
        await page.waitForTimeout(200);

        // Verify it's collapsed
        const isCollapsedBefore = await page.evaluate(() => {
            const category = document.querySelector('.color-category');
            return category ? category.classList.contains('collapsed') : false;
        });

        expect(isCollapsedBefore).toBe(true);

        // Now search for something that will match in that category
        await searchInput.fill('biome');
        await page.waitForTimeout(200);

        // Category should auto-expand
        const isCollapsedAfter = await page.evaluate(() => {
            const category = document.querySelector('.color-category:not(.hidden)');
            return category ? category.classList.contains('collapsed') : false;
        });

        expect(isCollapsedAfter).toBe(false);
    });

    test('empty search should show all colors', async ({ page }) => {
        const searchInput = await page.locator('#color-search');

        // First search for something
        await searchInput.fill('grass');
        await page.waitForTimeout(200);

        const visibleWithSearch = await page.evaluate(() => {
            return document.querySelectorAll('.color-item:not(.hidden)').length;
        });

        // Clear search
        await searchInput.fill('');
        await page.waitForTimeout(200);

        const visibleWithoutSearch = await page.evaluate(() => {
            return document.querySelectorAll('.color-item:not(.hidden)').length;
        });

        expect(visibleWithoutSearch).toBeGreaterThan(visibleWithSearch);
        expect(visibleWithoutSearch).toBeGreaterThan(10); // Should have many colors
    });

    test('should handle special characters in search', async ({ page }) => {
        const searchInput = await page.locator('#color-search');

        // Test with various special characters
        const queries = ['()', '[]', '{}', '._-', '123'];

        for (const query of queries) {
            await searchInput.fill(query);
            await page.waitForTimeout(100);

            // Should not crash
            const pageTitle = await page.title();
            expect(pageTitle).toBe('Biome Level Editor');
        }
    });

    test('search should work after loading a file', async ({ page }) => {
        // Generate a test map first
        await page.click('#btn-load-test-map');
        await page.waitForTimeout(1000);

        const searchInput = await page.locator('#color-search');
        await searchInput.fill('warehouse');
        await page.waitForTimeout(200);

        const visibleColors = await page.evaluate(() => {
            return document.querySelectorAll('.color-item:not(.hidden)').length;
        });

        expect(visibleColors).toBeGreaterThan(0);
    });

    test('should maintain search state when switching layers', async ({ page }) => {
        const searchInput = await page.locator('#color-search');
        await searchInput.fill('radiation');
        await page.waitForTimeout(200);

        // Switch to a different layer
        await page.click('.layer-item:has-text("Floor")');
        await page.waitForTimeout(200);

        // Search should still be active
        const inputValue = await searchInput.inputValue();
        expect(inputValue).toBe('radiation');

        const visibleColors = await page.evaluate(() => {
            return document.querySelectorAll('.color-item:not(.hidden)').length;
        });

        expect(visibleColors).toBeGreaterThan(0);
    });

    test('clicking a filtered color should select it', async ({ page }) => {
        const searchInput = await page.locator('#color-search');
        await searchInput.fill('bathroom');
        await page.waitForTimeout(200);

        // Click the first visible color
        const firstVisibleColor = await page.locator('.color-item:not(.hidden)').first();
        await firstVisibleColor.click();
        await page.waitForTimeout(100);

        // Verify color was selected
        const colorLabel = await page.locator('#current-color-label').textContent();
        expect(colorLabel.toLowerCase()).toContain('bathroom');
    });

    test('search performance with rapid typing', async ({ page }) => {
        const searchInput = await page.locator('#color-search');

        const startTime = Date.now();

        // Rapidly type characters
        const searchText = 'warehouse';
        for (const char of searchText) {
            await searchInput.type(char, { delay: 50 });
        }

        await page.waitForTimeout(200);

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`Search performance test duration: ${duration}ms`);

        // Should complete in reasonable time (less than 2 seconds)
        expect(duration).toBeLessThan(2000);

        // Should still have results
        const visibleColors = await page.evaluate(() => {
            return document.querySelectorAll('.color-item:not(.hidden)').length;
        });

        expect(visibleColors).toBeGreaterThan(0);
    });
});
