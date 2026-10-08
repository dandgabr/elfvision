#!/usr/bin/env python3
"""Regression checks for authored theme variants; no gallery clone required."""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('generator', pathlib.Path(__file__).with_name('gen-themes.py'))
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)

class AuthoredThemes(unittest.TestCase):
    def theme(self, slug):
        return generator.build_theme(slug, {}, {})

    def test_all_shipped_gallery_styles_have_two_authored_variants(self):
        slugs = [line.strip() for line in pathlib.Path('themes/v1.txt').read_text().splitlines()
                 if line.strip() and not line.startswith('#')]
        self.assertEqual(set(slugs), set(getattr(generator, 'AUTHORED_VARIANTS', {})))
        for slug in slugs:
            self.assertEqual({'light', 'dark'}, set(generator.AUTHORED_VARIANTS[slug]))
            self.assertEqual([], generator.failures(self.theme(slug)), slug)

    def test_background_readouts_meet_text_contrast_in_both_schemes(self):
        for slug in generator.AUTHORED_VARIANTS:
            for mode, palette in self.theme(slug)['schemes'].items():
                for key in ('fg', 'muted'):
                    self.assertGreaterEqual(
                        generator.contrast(generator.parse(palette[key]), generator.parse(palette['bg'])),
                        4.5, f'{slug}/{mode}/{key} on popup background')

    def test_bento_and_cards_have_distinct_dark_reading_surfaces_and_geometry(self):
        bento, cards = self.theme('bento-grid'), self.theme('card-based-ui')
        self.assertNotEqual(bento['schemes']['dark']['surface'], cards['schemes']['dark']['surface'])
        self.assertNotEqual(bento['radius']['card'], cards['radius']['card'])
        self.assertNotEqual(bento['schemes']['dark']['shadow'], cards['schemes']['dark']['shadow'])

    def test_newspaper_has_editorial_ink_in_both_schemes(self):
        theme = self.theme('analog-newspaper-broadsheet')
        self.assertEqual('strong', theme['border'])
        self.assertEqual('0px', theme['radius']['card'])
        self.assertIn('serif', theme['fonts']['body'])

    def test_hand_drawn_display_falls_back_to_casual_generic_not_formal_serif(self):
        display = self.theme('hand-drawn-sketch')['fonts']['display']
        self.assertNotIn('DejaVu Serif', display)
        self.assertTrue(display.endswith('cursive'))

    def test_hand_drawn_does_not_depend_on_unsupported_compound_radius(self):
        theme = self.theme('hand-drawn-sketch')
        self.assertEqual('strong', theme['border'])
        self.assertEqual('12px', theme['radius']['card'])
        self.assertIn('cursive', theme['fonts']['display'])

if __name__ == '__main__':
    unittest.main()
