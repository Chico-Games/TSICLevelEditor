// Undo/Redo Test Script
// Copy and paste this into the browser console on http://localhost:8081

console.clear();
console.log('═══════════════════════════════════════════');
console.log('🧪 Undo/Redo Layer Visibility Test');
console.log('═══════════════════════════════════════════');

if (!window.editor) {
    console.error('❌ Editor not found! Open this in the main editor page.');
} else {
    const editor = window.editor;
    let testsPassed = 0;
    let testsFailed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`%c✓ PASS: ${message}`, 'color: #00ff00');
            testsPassed++;
        } else {
            console.error(`%c✗ FAIL: ${message}`, 'color: #ff0000');
            testsFailed++;
        }
    }

    function logState(label) {
        const activeIdx = editor.layerManager.activeLayerIndex;
        const visibleIndices = [];
        editor.layerManager.layers.forEach((layer, idx) => {
            if (layer.visible) visibleIndices.push(idx);
        });
        const recentSelections = [...editor.recentLayerSelections];

        console.log(`%c${label}:`, 'color: #ffaa00; font-weight: bold');
        console.log(`  Active Layer: ${activeIdx} (${editor.layerManager.layers[activeIdx]?.name})`);
        console.log(`  Visible Layers: [${visibleIndices.join(', ')}]`);
        console.log(`  Recent Selections: [${recentSelections.join(', ')}]`);
        console.log(`  Undo Stack: ${editor.undoStack.length}, Redo Stack: ${editor.redoStack.length}`);

        return { activeIdx, visibleIndices, recentSelections };
    }

    async function runTests() {
        console.log('\n━━━ Initial State ━━━');
        logState('Initial');

        console.log('\n━━━ Test 1: Click Layer 1 ━━━');
        const layerItems = document.querySelectorAll('.layer-item');
        if (layerItems[1]) {
            layerItems[1].click();
            await new Promise(r => setTimeout(r, 100));
            const s1 = logState('After Layer 1 Click');
            assert(s1.activeIdx === 1, `Active layer is 1`);
            assert(s1.visibleIndices.includes(1), `Layer 1 is visible`);
            assert(s1.recentSelections.includes(1), `recentSelections includes 1`);
        }

        console.log('\n━━━ Test 2: Click Layer 2 ━━━');
        if (layerItems[2]) {
            layerItems[2].click();
            await new Promise(r => setTimeout(r, 100));
            const s2 = logState('After Layer 2 Click');
            assert(s2.activeIdx === 2, `Active layer is 2`);
            assert(s2.visibleIndices.includes(2), `Layer 2 is visible`);
            assert(s2.visibleIndices.includes(1), `Layer 1 still visible`);
            assert(s2.recentSelections.length <= 2, `Max 2 recent selections`);
        }

        console.log('\n━━━ Test 3: Save state and paint ━━━');
        const beforeStackSize = editor.undoStack.length;
        editor.saveStateNow();
        const layer2 = editor.layerManager.layers[2];
        layer2.setTile(50, 50, 1, { color: '#ff0000' });
        console.log(`Stack size: ${beforeStackSize} → ${editor.undoStack.length}`);
        assert(editor.undoStack.length > beforeStackSize, 'State was saved to undo stack');

        console.log('\n━━━ Test 4: UNDO ━━━');
        console.log('%c🔍 BEFORE UNDO:', 'color: cyan; font-weight: bold');
        const beforeUndo = logState('Before Undo');

        console.log('%c🔙 Calling editor.undo()...', 'color: yellow; font-weight: bold');
        editor.undo();

        console.log('%c🔍 AFTER editor.undo() (before reconstruction):', 'color: cyan; font-weight: bold');
        const afterUndoNoReconstruct = logState('After Undo (no reconstruct)');

        console.log('%c🔧 Reconstructing recentLayerSelections...', 'color: yellow; font-weight: bold');
        editor.recentLayerSelections = [];
        editor.layerManager.layers.forEach((layer, idx) => {
            if (layer.visible) {
                editor.recentLayerSelections.push(idx);
            }
        });
        if (editor.recentLayerSelections.length === 0) {
            editor.recentLayerSelections = [0];
            editor.layerManager.layers[0].visible = true;
        }

        console.log('%c🔍 AFTER reconstruction:', 'color: cyan; font-weight: bold');
        const afterUndoWithReconstruct = logState('After Undo + Reconstruct');

        console.log('%c🎨 Re-rendering...', 'color: yellow; font-weight: bold');
        editor.render();
        editor.renderMinimap();
        if (window.updateLayersPanel) window.updateLayersPanel();

        console.log('%c🔍 FINAL state:', 'color: cyan; font-weight: bold');
        const finalState = logState('Final State After Undo');

        assert(finalState.recentSelections.length > 0, 'recentSelections not empty');
        assert(finalState.visibleIndices.length > 0, 'At least one layer visible');
        assert(finalState.visibleIndices.length <= 2, 'Max 2 layers visible');

        console.log('\n━━━ Test 5: Click Layer 3 After Undo ━━━');
        if (layerItems[3]) {
            layerItems[3].click();
            await new Promise(r => setTimeout(r, 100));
            const s3 = logState('After Layer 3 Click');
            assert(s3.activeIdx === 3, `Active layer is 3`);
            assert(s3.visibleIndices.includes(3), `Layer 3 is visible`);
            assert(s3.visibleIndices.length <= 2, `Max 2 layers visible`);
        }

        console.log('\n═══════════════════════════════════════════');
        console.log(`%c✓ Passed: ${testsPassed}`, 'color: #00ff00; font-weight: bold');
        console.log(`%c✗ Failed: ${testsFailed}`, 'color: #ff0000; font-weight: bold');
        console.log(`Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
        console.log('═══════════════════════════════════════════');
    }

    runTests();
}
