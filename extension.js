import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import GaqIndicator from './lib/ui/indicator.js';

// Index inside the panel box. The left box starts with the Activities button,
// so the indicator goes right after it.
const BOX_INDEX = {left: 1, center: 0, right: 0};

export default class GnomeAiQuotaExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._createIndicator();
        // Moving to another panel box needs a new button, so rebuild it.
        this._positionChangedId = this._settings.connect('changed::position', () => {
            this._destroyIndicator();
            this._createIndicator();
        });
    }

    disable() {
        this._settings?.disconnect(this._positionChangedId);
        this._positionChangedId = 0;
        this._destroyIndicator();
        this._settings = null;
    }

    _createIndicator() {
        const position = this._settings.get_string('position');
        this._indicator = new GaqIndicator(this, this._settings, position);
        Main.panel.addToStatusArea(this.uuid, this._indicator, BOX_INDEX[position], position);
    }

    _destroyIndicator() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
