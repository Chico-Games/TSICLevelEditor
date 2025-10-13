"""
Selenium E2E Tests for Biome Level Editor

Prerequisites:
    pip install selenium

For Chrome:
    pip install webdriver-manager

Run tests:
    python tests/selenium_test.py
"""

import os
import time
import unittest
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys


class BiomeLevelEditorTests(unittest.TestCase):
    """Test suite for the Biome Level Editor"""

    @classmethod
    def setUpClass(cls):
        """Set up the test environment once for all tests"""
        # Get absolute path to index.html
        cls.base_path = Path(__file__).parent.parent.resolve()
        cls.index_path = cls.base_path / "index.html"
        cls.base_url = f"file:///{cls.index_path}".replace("\\", "/")

        print(f"\n[INFO] Testing: {cls.base_url}")

        # Initialize Chrome driver
        options = webdriver.ChromeOptions()
        options.add_argument('--headless')  # Run in headless mode
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--window-size=1920,1080')

        # Try to use webdriver-manager for automatic driver management
        try:
            from webdriver_manager.chrome import ChromeDriverManager
            from selenium.webdriver.chrome.service import Service
            service = Service(ChromeDriverManager().install())
            cls.driver = webdriver.Chrome(service=service, options=options)
        except ImportError:
            # Fallback to assuming chromedriver is in PATH
            cls.driver = webdriver.Chrome(options=options)

        cls.driver.implicitly_wait(5)
        cls.wait = WebDriverWait(cls.driver, 10)

    @classmethod
    def tearDownClass(cls):
        """Clean up after all tests"""
        cls.driver.quit()

    def setUp(self):
        """Set up each test"""
        self.driver.get(self.base_url)
        # Wait for canvas to be ready
        self.wait.until(
            EC.presence_of_element_located((By.ID, "grid-canvas"))
        )
        time.sleep(0.5)  # Give JS time to initialize

    def test_01_page_loads(self):
        """Test that the page loads successfully"""
        print("\n[TEST] Page loads with all elements")

        # Check title
        h1 = self.driver.find_element(By.TAG_NAME, "h1")
        self.assertIn("Biome Level Editor", h1.text)

        # Check main elements exist
        self.assertTrue(self.driver.find_element(By.ID, "grid-canvas").is_displayed())
        self.assertTrue(self.driver.find_element(By.ID, "minimap-canvas").is_displayed())
        self.assertTrue(self.driver.find_element(By.ID, "color-palette").is_displayed())

        print("  ✓ All main elements loaded")

    def test_02_config_loads_biomes(self):
        """Test that biomes load from configuration"""
        print("\n[TEST] Configuration loads biomes")

        # Wait a bit for config to load
        time.sleep(0.5)

        # Check color palette has items
        palette_items = self.driver.find_elements(By.CLASS_NAME, "color-item")
        self.assertGreater(len(palette_items), 0, "No biomes loaded")

        # Check specific biomes
        biome_names = [item.text for item in palette_items]
        self.assertIn("Grassland", biome_names)
        self.assertIn("Ocean", biome_names)
        self.assertIn("Desert", biome_names)

        print(f"  ✓ Loaded {len(palette_items)} biomes")

    def test_03_layers_load(self):
        """Test that layers load from configuration"""
        print("\n[TEST] Layers load from configuration")

        time.sleep(0.5)

        # Check layers exist
        layer_items = self.driver.find_elements(By.CLASS_NAME, "layer-item")
        self.assertGreater(len(layer_items), 0, "No layers loaded")

        # Check for specific layer names
        layer_names = [
            item.find_element(By.CLASS_NAME, "layer-name").text
            for item in layer_items
        ]
        self.assertIn("Terrain", layer_names)
        self.assertIn("Structures", layer_names)

        print(f"  ✓ Loaded {len(layer_items)} layers")

    def test_04_select_color(self):
        """Test selecting a color from the palette"""
        print("\n[TEST] Select color from palette")

        time.sleep(0.5)

        # Find and click Grassland
        grassland = None
        for item in self.driver.find_elements(By.CLASS_NAME, "color-item"):
            if "Grassland" in item.text:
                grassland = item
                break

        self.assertIsNotNone(grassland, "Grassland biome not found")
        grassland.click()
        time.sleep(0.2)

        # Check it's selected
        self.assertIn("selected", grassland.get_attribute("class"))

        # Check current color label updates
        label = self.driver.find_element(By.ID, "current-color-label")
        self.assertIn("Grassland", label.text)

        print("  ✓ Color selected successfully")

    def test_05_switch_tools(self):
        """Test switching between different tools"""
        print("\n[TEST] Switch between tools")

        time.sleep(0.5)

        tools = ["pencil", "bucket", "line", "rectangle", "eraser"]

        for tool_name in tools:
            tool_btn = self.driver.find_element(
                By.CSS_SELECTOR, f'.tool-btn[data-tool="{tool_name}"]'
            )
            tool_btn.click()
            time.sleep(0.1)

            # Check it's active
            self.assertIn("active", tool_btn.get_attribute("class"))

        print(f"  ✓ Tested {len(tools)} tools")

    def test_06_keyboard_shortcuts(self):
        """Test keyboard shortcuts for tools"""
        print("\n[TEST] Keyboard shortcuts for tools")

        time.sleep(0.5)

        body = self.driver.find_element(By.TAG_NAME, "body")

        shortcuts = {
            'b': 'pencil',
            'g': 'bucket',
            'l': 'line',
            'r': 'rectangle',
            'e': 'eraser'
        }

        for key, tool in shortcuts.items():
            body.send_keys(key)
            time.sleep(0.1)

            tool_btn = self.driver.find_element(
                By.CSS_SELECTOR, f'.tool-btn[data-tool="{tool}"]'
            )
            self.assertIn("active", tool_btn.get_attribute("class"))

        print(f"  ✓ Tested {len(shortcuts)} keyboard shortcuts")

    def test_07_draw_on_canvas(self):
        """Test drawing on the canvas"""
        print("\n[TEST] Draw on canvas with pencil")

        time.sleep(0.5)

        # Select a color
        color_item = self.driver.find_elements(By.CLASS_NAME, "color-item")[0]
        color_item.click()
        time.sleep(0.2)

        # Get canvas
        canvas = self.driver.find_element(By.ID, "grid-canvas")

        # Draw on canvas
        actions = ActionChains(self.driver)
        actions.move_to_element_with_offset(canvas, 100, 100)
        actions.click_and_hold()
        actions.move_by_offset(50, 50)
        actions.release()
        actions.perform()

        time.sleep(0.2)

        # Check statistics updated
        stat_tiles = self.driver.find_element(By.ID, "stat-tiles")
        tile_count = int(stat_tiles.text)
        self.assertGreater(tile_count, 0, "No tiles were drawn")

        print(f"  ✓ Drew {tile_count} tiles")

    def test_08_change_brush_size(self):
        """Test changing brush size"""
        print("\n[TEST] Change brush size")

        time.sleep(0.5)

        # Select a color
        color_item = self.driver.find_elements(By.CLASS_NAME, "color-item")[0]
        color_item.click()
        time.sleep(0.2)

        # Change brush size to 3x3
        brush_select = self.driver.find_element(By.ID, "brush-size")
        brush_select.send_keys("3")
        time.sleep(0.2)

        # Draw a single click
        canvas = self.driver.find_element(By.ID, "grid-canvas")
        actions = ActionChains(self.driver)
        actions.move_to_element_with_offset(canvas, 200, 200)
        actions.click()
        actions.perform()

        time.sleep(0.2)

        # Check multiple tiles were placed (3x3 = 9 tiles)
        stat_tiles = self.driver.find_element(By.ID, "stat-tiles")
        tile_count = int(stat_tiles.text)
        self.assertGreaterEqual(tile_count, 9, "Brush size didn't work")

        print(f"  ✓ Brush size working (placed {tile_count} tiles)")

    def test_09_undo_redo(self):
        """Test undo and redo functionality"""
        print("\n[TEST] Undo and Redo")

        time.sleep(0.5)

        # Draw something
        color_item = self.driver.find_elements(By.CLASS_NAME, "color-item")[0]
        color_item.click()
        time.sleep(0.2)

        canvas = self.driver.find_element(By.ID, "grid-canvas")
        actions = ActionChains(self.driver)
        actions.move_to_element_with_offset(canvas, 100, 100)
        actions.click()
        actions.perform()
        time.sleep(0.2)

        stat_tiles = self.driver.find_element(By.ID, "stat-tiles")
        after_draw = int(stat_tiles.text)
        self.assertGreater(after_draw, 0)

        # Undo
        undo_btn = self.driver.find_element(By.ID, "btn-undo")
        undo_btn.click()
        time.sleep(0.2)

        after_undo = int(stat_tiles.text)
        self.assertLess(after_undo, after_draw)

        # Redo
        redo_btn = self.driver.find_element(By.ID, "btn-redo")
        redo_btn.click()
        time.sleep(0.2)

        after_redo = int(stat_tiles.text)
        self.assertEqual(after_redo, after_draw)

        print("  ✓ Undo/Redo working correctly")

    def test_10_layer_visibility(self):
        """Test toggling layer visibility"""
        print("\n[TEST] Layer visibility toggle")

        time.sleep(0.5)

        # Find first visibility checkbox
        checkboxes = self.driver.find_elements(
            By.CSS_SELECTOR, 'input[type="checkbox"][id^="layer-visible"]'
        )
        self.assertGreater(len(checkboxes), 0, "No layer checkboxes found")

        checkbox = checkboxes[0]
        initial_state = checkbox.is_selected()

        # Toggle it
        checkbox.click()
        time.sleep(0.2)

        new_state = checkbox.is_selected()
        self.assertNotEqual(initial_state, new_state)

        print("  ✓ Layer visibility toggled")

    def test_11_add_layer(self):
        """Test adding a new layer"""
        print("\n[TEST] Add new layer")

        time.sleep(0.5)

        # Count initial layers
        initial_layers = len(self.driver.find_elements(By.CLASS_NAME, "layer-item"))

        # Add layer
        add_btn = self.driver.find_element(By.ID, "btn-add-layer")
        add_btn.click()
        time.sleep(0.2)

        # Count new layers
        new_layers = len(self.driver.find_elements(By.CLASS_NAME, "layer-item"))
        self.assertEqual(new_layers, initial_layers + 1)

        print(f"  ✓ Layer added ({initial_layers} → {new_layers})")

    def test_12_zoom_controls(self):
        """Test zoom in and out"""
        print("\n[TEST] Zoom controls")

        time.sleep(0.5)

        # Get initial zoom
        zoom_label = self.driver.find_element(By.ID, "zoom-level")
        initial_zoom = zoom_label.text

        # Zoom in
        zoom_in = self.driver.find_element(By.ID, "btn-zoom-in")
        zoom_in.click()
        time.sleep(0.2)

        zoomed_in = zoom_label.text
        self.assertNotEqual(initial_zoom, zoomed_in)

        # Zoom out
        zoom_out = self.driver.find_element(By.ID, "btn-zoom-out")
        zoom_out.click()
        time.sleep(0.2)

        zoomed_out = zoom_label.text
        self.assertEqual(initial_zoom, zoomed_out)

        print(f"  ✓ Zoom working ({initial_zoom} → {zoomed_in} → {zoomed_out})")

    def test_13_statistics_update(self):
        """Test that statistics update correctly"""
        print("\n[TEST] Statistics update")

        time.sleep(0.5)

        stat_tiles = self.driver.find_element(By.ID, "stat-tiles")
        stat_empty = self.driver.find_element(By.ID, "stat-empty")

        initial_tiles = int(stat_tiles.text)
        initial_empty = int(stat_empty.text)

        # Draw something
        color_item = self.driver.find_elements(By.CLASS_NAME, "color-item")[0]
        color_item.click()
        time.sleep(0.2)

        canvas = self.driver.find_element(By.ID, "grid-canvas")
        actions = ActionChains(self.driver)
        actions.move_to_element_with_offset(canvas, 150, 150)
        actions.click()
        actions.perform()
        time.sleep(0.2)

        new_tiles = int(stat_tiles.text)
        new_empty = int(stat_empty.text)

        self.assertGreater(new_tiles, initial_tiles)
        self.assertLess(new_empty, initial_empty)

        print(f"  ✓ Statistics updated (tiles: {initial_tiles} → {new_tiles})")

    def test_14_minimap_visible(self):
        """Test that minimap is visible and has content"""
        print("\n[TEST] Minimap visibility")

        time.sleep(0.5)

        minimap = self.driver.find_element(By.ID, "minimap-canvas")
        self.assertTrue(minimap.is_displayed())

        # Check it has dimensions
        size = minimap.size
        self.assertGreater(size['width'], 0)
        self.assertGreater(size['height'], 0)

        print(f"  ✓ Minimap visible ({size['width']}x{size['height']})")


def run_tests():
    """Run the test suite"""
    print("\n" + "="*60)
    print("  BIOME LEVEL EDITOR - SELENIUM TEST SUITE")
    print("="*60)

    # Create test suite
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(BiomeLevelEditorTests)

    # Run tests with verbose output
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Print summary
    print("\n" + "="*60)
    print("  TEST SUMMARY")
    print("="*60)
    print(f"  Tests run: {result.testsRun}")
    print(f"  Successes: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"  Failures: {len(result.failures)}")
    print(f"  Errors: {len(result.errors)}")
    print("="*60)

    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)
