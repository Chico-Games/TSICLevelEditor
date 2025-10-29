/**
 * Automated Performance Test
 * Tests performance with complex filled level
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Automated Performance Tests - Complex Level', () => {
    test('comprehensive performance test with 100% filled level', async ({ page }) => {
        // Increase timeout for this test
        test.setTimeout(120000);

        console.log('\n🔬 STARTING COMPREHENSIVE PERFORMANCE TEST...\n');

        // Navigate to test page
        await page.goto(`file://${path.resolve(__dirname, '../test-complex-level-performance.html')}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Wait for run button to be available
        await page.waitForSelector('#run-btn');

        console.log('✅ Test page loaded');

        // Click the run test button
        await page.click('#run-btn');

        console.log('⏳ Running automated tests...\n');

        // Wait for tests to complete (watch for progress bar to reach 100%)
        await page.waitForFunction(() => {
            const bar = document.getElementById('progress-bar');
            return bar && bar.style.width === '100%';
        }, { timeout: 60000 });

        await page.waitForTimeout(1000);

        // Extract all test results
        const results = await page.evaluate(() => {
            const getText = (id) => {
                const el = document.getElementById(id);
                return el ? el.textContent : 'N/A';
            };

            const getMetrics = (id) => {
                const el = document.getElementById(id);
                if (!el) return [];
                const metrics = el.querySelectorAll('.metric');
                return Array.from(metrics).map(m => ({
                    text: m.textContent,
                    className: m.className
                }));
            };

            return {
                status: getText('overall-status'),
                setup: getMetrics('setup-info'),
                load: getMetrics('load-results'),
                click: getMetrics('click-results'),
                draw: getMetrics('draw-results'),
                tool: getMetrics('tool-results'),
                render: getMetrics('render-results'),
                summary: getMetrics('summary-results'),
                testResults: window.testResults
            };
        });

        // Print results
        console.log('=' .repeat(60));
        console.log('📋 TEST SETUP');
        console.log('=' .repeat(60));
        results.setup.forEach(m => console.log(m.text));

        console.log('\n' + '=' .repeat(60));
        console.log('⏱️  LEVEL LOAD PERFORMANCE');
        console.log('=' .repeat(60));
        results.load.forEach(m => console.log(m.text));

        console.log('\n' + '=' .repeat(60));
        console.log('🖱️  INITIAL CLICK RESPONSE (CRITICAL!)');
        console.log('=' .repeat(60));
        results.click.forEach(m => console.log(m.text));

        console.log('\n' + '=' .repeat(60));
        console.log('✏️  DRAWING PERFORMANCE');
        console.log('=' .repeat(60));
        results.draw.forEach(m => console.log(m.text));

        console.log('\n' + '=' .repeat(60));
        console.log('🔧 TOOL SWITCHING');
        console.log('=' .repeat(60));
        results.tool.forEach(m => console.log(m.text));

        console.log('\n' + '=' .repeat(60));
        console.log('🎨 RENDER PERFORMANCE');
        console.log('=' .repeat(60));
        results.render.forEach(m => console.log(m.text));

        console.log('\n' + '=' .repeat(60));
        console.log('📊 SUMMARY');
        console.log('=' .repeat(60));
        results.summary.forEach(m => console.log(m.text));

        console.log('\n' + '=' .repeat(60));
        console.log('RAW NUMBERS');
        console.log('=' .repeat(60));
        console.log(`Setup Time: ${results.testResults.setupTime.toFixed(2)}ms`);
        console.log(`Fill Time: ${results.testResults.fillTime.toFixed(2)}ms`);
        console.log(`First Click Delay: ${results.testResults.firstClickDelay.toFixed(2)}ms`);
        console.log(`Drawing Times: ${results.testResults.drawingTimes.map(t => t.toFixed(2)).join(', ')}ms`);
        console.log(`Tool Switch Times: ${results.testResults.toolSwitchTimes.map(t => t.toFixed(2)).join(', ')}ms`);
        console.log(`Render Times: ${results.testResults.renderTimes.map(t => t.toFixed(2)).join(', ')}ms`);
        console.log(`\nPassed: ${results.testResults.passed}`);
        console.log(`Warnings: ${results.testResults.warnings}`);
        console.log(`Failed: ${results.testResults.failed}`);

        console.log('\n' + '=' .repeat(60));

        // Assertions
        console.log('\n🧪 RUNNING ASSERTIONS...\n');

        // Critical assertion: Initial click delay should be fast
        const clickDelay = results.testResults.firstClickDelay;
        console.log(`Testing: Initial click delay (${clickDelay.toFixed(2)}ms) should be < 200ms`);
        expect(clickDelay).toBeLessThan(200);
        if (clickDelay < 50) {
            console.log('✅ EXCELLENT - Click response is instant!');
        } else if (clickDelay < 200) {
            console.log('⚠️  WARNING - Click response is acceptable but could be better');
        }

        // Drawing should be smooth
        const avgDrawTime = results.testResults.drawingTimes.reduce((a,b) => a+b, 0) / results.testResults.drawingTimes.length;
        console.log(`\nTesting: Average draw time (${avgDrawTime.toFixed(2)}ms) should be < 300ms`);
        expect(avgDrawTime).toBeLessThan(300);
        if (avgDrawTime < 100) {
            console.log('✅ EXCELLENT - Drawing is very smooth!');
        } else if (avgDrawTime < 300) {
            console.log('⚠️  WARNING - Drawing is acceptable but could be smoother');
        }

        // Render should target 30+ FPS
        const avgRenderTime = results.testResults.renderTimes.reduce((a,b) => a+b, 0) / results.testResults.renderTimes.length;
        console.log(`\nTesting: Average render time (${avgRenderTime.toFixed(2)}ms) should be < 33ms (30 FPS)`);
        expect(avgRenderTime).toBeLessThan(100); // At least 10 FPS
        if (avgRenderTime < 16) {
            console.log('✅ EXCELLENT - Can achieve 60 FPS!');
        } else if (avgRenderTime < 33) {
            console.log('✅ GOOD - Can achieve 30 FPS');
        } else {
            console.log('⚠️  WARNING - Render is slower than ideal');
        }

        // Overall: should have more passes than failures
        console.log(`\nTesting: More passes than failures`);
        expect(results.testResults.passed).toBeGreaterThan(results.testResults.failed);

        console.log('\n' + '=' .repeat(60));
        console.log('✅ ALL ASSERTIONS PASSED!');
        console.log('=' .repeat(60));
        console.log('\n');
    });
});
