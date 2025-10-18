/**
 * Direct Performance Test - Simple and Fast
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Direct Performance Test', () => {
    test('measure actual performance with filled level', async ({ page }) => {
        test.setTimeout(60000);

        console.log('\n🔬 DIRECT PERFORMANCE TEST\n');

        // Navigate to test page
        await page.goto(`file://${path.resolve(__dirname, '../test-direct-performance.html')}`);
        await page.waitForLoadState('networkidle');

        console.log('⏳ Waiting for test to complete...\n');

        // Wait for test to finish (look for VERDICT text)
        await page.waitForFunction(() => {
            const output = document.getElementById('output');
            return output && output.textContent.includes('VERDICT');
        }, { timeout: 30000 });

        // Give it a moment to finish writing output
        await page.waitForTimeout(500);

        // Extract all output
        const output = await page.evaluate(() => {
            return document.getElementById('output').textContent;
        });

        // Print the results
        console.log(output);

        // Extract specific metrics for assertions
        const metrics = await page.evaluate(() => {
            const text = document.getElementById('output').textContent;

            // Parse the summary section
            const mousedownMatch = text.match(/Mousedown:\s+(\d+\.?\d*)ms/);
            const drawingMatch = text.match(/Drawing:\s+(\d+\.?\d*)ms/);
            const renderMatch = text.match(/Rendering:\s+(\d+\.?\d*)ms \((\d+\.?\d*) FPS\)/);

            return {
                mousedown: mousedownMatch ? parseFloat(mousedownMatch[1]) : 999,
                drawing: drawingMatch ? parseFloat(drawingMatch[1]) : 999,
                render: renderMatch ? parseFloat(renderMatch[1]) : 999,
                fps: renderMatch ? parseFloat(renderMatch[2]) : 0
            };
        });

        console.log('\n📊 EXTRACTED METRICS:');
        console.log(`  Mousedown delay: ${metrics.mousedown}ms`);
        console.log(`  Drawing: ${metrics.drawing}ms avg`);
        console.log(`  Rendering: ${metrics.render}ms (${metrics.fps} FPS)`);

        // Assertions
        console.log('\n🧪 ASSERTIONS:\n');

        console.log(`Testing: Mousedown delay (${metrics.mousedown}ms) < 200ms`);
        expect(metrics.mousedown).toBeLessThan(200);
        if (metrics.mousedown < 50) {
            console.log('✅ EXCELLENT - Instant response!\n');
        } else {
            console.log('⚠️  OK - Acceptable but could be better\n');
        }

        console.log(`Testing: Drawing (${metrics.drawing}ms) < 100ms`);
        expect(metrics.drawing).toBeLessThan(100);
        if (metrics.drawing < 10) {
            console.log('✅ EXCELLENT - Very smooth!\n');
        } else {
            console.log('⚠️  OK - Acceptable but could be better\n');
        }

        console.log(`Testing: FPS (${metrics.fps}) >= 10`);
        expect(metrics.fps).toBeGreaterThanOrEqual(10);
        if (metrics.fps >= 30) {
            console.log('✅ EXCELLENT - Smooth 30+ FPS!\n');
        } else if (metrics.fps >= 15) {
            console.log('⚠️  OK - 15+ FPS is acceptable\n');
        } else {
            console.log('⚠️  SLOW - Below 15 FPS\n');
        }

        console.log('✅ ALL TESTS PASSED!\n');
    });
});
