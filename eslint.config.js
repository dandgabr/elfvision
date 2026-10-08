// GJS modules and Shell Eval probes have different globals. No browser/Node environment is granted.
import js from '@eslint/js';
import {defineConfig} from 'eslint/config';

export default defineConfig([
    {ignores: ['node_modules/**', 'dist/**', 'build/**', '.superpowers/**']},
    {
        files: ['extension.js', 'prefs.js', 'lib/**/*.js', 'tests/**/*.js', 'tools/**/*.js', 'eslint.config.js'],
        extends: [js.configs.recommended],
        languageOptions: {ecmaVersion: 2024, sourceType: 'module'},
        linterOptions: {reportUnusedDisableDirectives: 'error'},
        rules: {
            // GI vfuncs and signal callbacks retain positional arguments, conventionally prefixed _.
            'no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none'}],
            'no-undef': ['error', {typeof: true}],
        },
    },
    {
        files: ['extension.js', 'lib/services/**/*.js', 'lib/ui/**/*.js', 'lib/providers/**/*.js'],
        languageOptions: {globals: {console: 'readonly'}},
    },
    {
        files: ['lib/core/alerts.js', 'lib/oauth/pkce.js', 'lib/services/**/*.js', 'tests/**/*.js'],
        languageOptions: {globals: {TextEncoder: 'readonly', TextDecoder: 'readonly'}},
    },
    {
        files: ['lib/ui/**/*.js', 'lib/services/themeManager.js'],
        languageOptions: {globals: {global: 'readonly'}},
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {globals: {print: 'readonly', printerr: 'readonly'}},
        // Test fixtures keep the same callback signatures as the production interfaces.
        rules: {'no-unused-vars': ['error', {args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none'}]},
    },
    {
        files: ['tests/structure.test.js'],
        languageOptions: {globals: {console: 'readonly'}},
    },
    {
        // These security checks intentionally match control bytes to reject/strip them.
        files: ['lib/core/theme.js', 'tests/alertText.test.js'],
        rules: {'no-control-regex': 'off'},
    },
    {
        files: ['tests/run.js', 'tests/prefs*.js'],
        languageOptions: {globals: {ARGV: 'readonly'}},
    },
    {
        // These scripts are evaluated by org.gnome.Shell.Eval, not imported as GJS modules.
        files: ['tools/*-probe.js', 'tools/*-verify.js'],
        languageOptions: {
            sourceType: 'script',
            globals: {Main: 'readonly', Gio: 'readonly', GLib: 'readonly', Shell: 'readonly',
                global: 'readonly', imports: 'readonly'},
        },
    },
]);
