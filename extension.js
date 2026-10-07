import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {createDemoProviders} from './lib/providers/demo.js';
import {QuotaController} from './lib/services/controller.js';
import {ThemeManager} from './lib/services/themeManager.js';
import GaqIndicator from './lib/ui/indicator.js';

// Index inside the panel box. The left box starts with the Activities button,
// so the indicator goes right after it.
const BOX_INDEX = {left: 1, center: 0, right: 0};

export default class GnomeAiQuotaExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        // The stylesheet must exist before the first widget is measured.
        this._themes = new ThemeManager({extensionPath: this.path, settings: this._settings});
        try {
            this._themes.enable();
            this._createController();
            this._createIndicator();
        } catch (error) {
            // The shell does not call disable() after a failed enable().
            this.disable();
            throw error;
        }
        // Moving to another panel box needs a new button; a new demo scenario
        // needs new providers. Both rebuild the parts that depend on them.
        this._positionChangedId = this._settings.connect('changed::position', () => {
            this._destroyIndicator();
            this._createIndicator();
        });
        this._scenarioChangedId = this._settings.connect('changed::demo-scenario', () => {
            this._destroyIndicator();
            this._destroyController();
            this._createController();
            this._createIndicator();
        });
    }

    disable() {
        if (this._positionChangedId)
            this._settings?.disconnect(this._positionChangedId);
        if (this._scenarioChangedId)
            this._settings?.disconnect(this._scenarioChangedId);
        this._positionChangedId = 0;
        this._scenarioChangedId = 0;
        this._destroyIndicator();
        this._destroyController();
        this._themes?.disable();
        this._themes = null;
        this._settings = null;
    }

    _createController() {
        const providers = createDemoProviders(this._settings.get_string('demo-scenario'));
        this._controller = new QuotaController({providers});
        this._controller.start().catch(error =>
            console.error(`gnome-ai-quota: cannot start: ${error.message}`));
    }

    _destroyController() {
        this._controller?.stop();
        this._controller = null;
    }

    _createIndicator() {
        const position = this._settings.get_string('position');
        this._indicator = new GaqIndicator(this, this._settings, position, this._controller);
        Main.panel.addToStatusArea(this.uuid, this._indicator, BOX_INDEX[position], position);
    }

    _destroyIndicator() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
