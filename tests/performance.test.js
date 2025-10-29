/**
 * Performance Tests
 * Tests rendering performance with fully filled layers
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Performance Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`file://${path.resolve(__dirname, '../index.html')}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
    });

    test('render performance with all layers fully filled', async ({ page }) => {
        // Fill all 6 layers with solid colors
        const layers = [
            { name: 'Height', color: '#525d6b' },
            { name: 'Difficulty', color: '#FFD700' },
            { name: 'Hazard', color: '#39FF14' },
            { name: 'Sky', color: '#87CEEB' },
            { name: 'Floor', color: '#FF6B6B' },
            { name: 'Underground', color: '#8B4513' }
        ];

        for (const layer of layers) {
            // Select layer
            await page.click(`.layer-item:has-text("${layer.name}")`);
            await page.waitForTimeout(100);

            // Select color
            await page.click(`.color-item[data-color="${layer.color}"]`);
            await page.waitForTimeout(100);

            // Select bucket tool
            await page.click('[data-tool="bucket"]');
            await page.waitForTimeout(100);

            // Measure time to fill entire layer
            const fillStart = Date.now();

            // Click center of canvas to flood fill
            const canvas = await page.$('#grid-canvas');
            const box = await canvas.boundingBox();
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

            // Wait for render to complete
            await page.waitForTimeout(500);

            const fillEnd = Date.now();
            const fillTime = fillEnd - fillStart;

            console.log(`Layer ${layer.name}: Fill time = ${fillTime}ms`);

            // Should complete in reasonable time (under 2 seconds)
            expect(fillTime).toBeLessThan(2000);
        }

        // Measure overall render performance after all layers filled
        const renderTimes = [];

        for (let i = 0; i < 10; i++) {
            const renderStart = await page.evaluate(() => {
                return performance.now();
            });

            // Trigger re-render by panning slightly
            await page.keyboard.press('ArrowRight');
            await page.waitForTimeout(50);

            const renderEnd = await page.evaluate(() => {
                return performance.now();
            });

            renderTimes.push(renderEnd - renderStart);
        }

        const avgRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
        console.log(`Average render time with all layers filled: ${avgRenderTime.toFixed(2)}ms`);

        // Average render should be under 100ms
        expect(avgRenderTime).toBeLessThan(100);
    });

    test('drawing performance with pencil tool', async ({ page }) => {
        // Fill all layers first
        await page.evaluate(() => {
            const layers = ['Height', 'Difficulty', 'Hazard', 'Sky', 'Floor', 'Underground'];
            const colors = ['#525d6b', '#FFD700', '#39FF14', '#87CEEB', '#FF6B6B', '#8B4513'];

            for (let i = 0; i < layers.length; i++) {
                const layer = window.editor.layerManager.layers.find(l => l.name === layers[i]);
                window.editor.layerManager.fillLayerWithDefault(layer, colors[i]);
            }
            window.editor.render();
        });

        await page.waitForTimeout(500);

        // Select pencil tool with large brush
        await page.click('[data-tool="pencil"]');
        await page.click('.layer-item:has-text("Floor")');
        await page.click('.color-item[data-color="#FF6B6B"]');

        // Set large brush size
        await page.fill('#brush-size', '20');
        await page.waitForTimeout(100);

        // Measure drawing performance
        const canvas = await page.$('#grid-canvas');
        const box = await canvas.boundingBox();

        const drawStart = Date.now();

        // Draw a line across the canvas
        await page.mouse.move(box.x + 100, box.y + 100);
        await page.mouse.down();
        for (let x = 100; x < box.width - 100; x += 10) {
            await page.mouse.move(box.x + x, box.y + 100);
            await page.waitForTimeout(10);
        }
        await page.mouse.up();

        const drawEnd = Date.now();
        const drawTime = drawEnd - drawStart;

        console.log(`Drawing time with large brush on filled layers: ${drawTime}ms`);

        // Should feel responsive (under 3 seconds for the whole operation)
        expect(drawTime).toBeLessThan(3000);
    });

    test('zoom performance with filled layers', async ({ page }) => {
        // Fill all layers
        await page.evaluate(() => {
            const layers = ['Height', 'Difficulty', 'Hazard', 'Sky', 'Floor', 'Underground'];
            const colors = ['#525d6b', '#FFD700', '#39FF14', '#87CEEB', '#FF6B6B', '#8B4513'];

            for (let i = 0; i < layers.length; i++) {
                const layer = window.editor.layerManager.layers.find(l => l.name === layers[i]);
                window.editor.layerManager.fillLayerWithDefault(layer, colors[i]);
            }
            window.editor.render();
        });

        await page.waitForTimeout(500);

        // Test zoom in/out performance
        const zoomTimes = [];

        for (let i = 0; i < 5; i++) {
            const zoomStart = Date.now();
            await page.click('#btn-zoom-in');
            await page.waitForTimeout(100);
            const zoomEnd = Date.now();
            zoomTimes.push(zoomEnd - zoomStart);
        }

        const avgZoomTime = zoomTimes.reduce((a, b) => a + b, 0) / zoomTimes.length;
        console.log(`Average zoom time: ${avgZoomTime.toFixed(2)}ms`);

        // Zoom should be responsive (under 300ms)
        expect(avgZoomTime).toBeLessThan(300);
    });

    test('minimap drag performance with filled layers', async ({ page }) => {
        // Fill all layers
        await page.evaluate(() => {
            const layers = ['Height', 'Difficulty', 'Hazard', 'Sky', 'Floor', 'Underground'];
            const colors = ['#525d6b', '#FFD700', '#39FF14', '#87CEEB', '#FF6B6B', '#8B4513'];

            for (let i = 0; i < layers.length; i++) {
                const layer = window.editor.layerManager.layers.find(l => l.name === layers[i]);
                window.editor.layerManager.fillLayerWithDefault(layer, colors[i]);
            }
            window.editor.render();
        });

        await page.waitForTimeout(500);

        // Test minimap drag performance
        const minimap = await page.$('#minimap-canvas');
        const box = await minimap.boundingBox();

        const dragStart = Date.now();

        // Drag across minimap
        await page.mouse.move(box.x + 10, box.y + 10);
        await page.mouse.down();
        for (let i = 10; i < box.width - 10; i += 5) {
            await page.mouse.move(box.x + i, box.y + i);
            await page.waitForTimeout(10);
        }
        await page.mouse.up();

        const dragEnd = Date.now();
        const dragTime = dragEnd - dragStart;

        console.log(`Minimap drag time: ${dragTime}ms`);

        // Should feel smooth (under 2 seconds for full drag)
        expect(dragTime).toBeLessThan(2000);
    });

    test('measure tile rendering count', async ({ page }) => {
        // Fill all layers
        await page.evaluate(() => {
            const layers = ['Height', 'Difficulty', 'Hazard', 'Sky', 'Floor', 'Underground'];
            const colors = ['#525d6b', '#FFD700', '#39FF14', '#87CEEB', '#FF6B6B', '#8B4513'];

            for (let i = 0; i < layers.length; i++) {
                const layer = window.editor.layerManager.layers.find(l => l.name === layers[i]);
                window.editor.layerManager.fillLayerWithDefault(layer, colors[i]);
            }
        });

        // Capture console logs to measure render performance
        const consoleLogs = [];
        page.on('console', msg => {
            consoleLogs.push(msg.text());
        });

        // Trigger render
        await page.evaluate(() => {
            window.editor.render();
        });

        await page.waitForTimeout(500);

        // Check for render logs
        const renderLogs = consoleLogs.filter(log => log.includes('Render'));
        console.log('Render logs:', renderLogs);

        // Calculate total tiles rendered
        const totalTiles = 512 * 512 * 6; // 6 layers, 512x512 each
        console.log(`Total tiles in all layers: ${totalTiles.toLocaleString()}`);
    });
});
