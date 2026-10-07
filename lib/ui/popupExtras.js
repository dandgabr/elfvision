// Two small parts of the popup (docs/adr/0010): the legend that explains the marks on the bar, and
// the collapsed list of providers the user stopped tracking.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {fmt, legendRows} from '../core/viewmodel.js';
import {wrap} from './providerCard.js';

const MARK_ICON_PX = 12;

const label = (text, styleClass, props = {}) => new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER, ...props});

/** The marks of the bar, each with what it means. Hidden until the user asks for it. */
export class LegendBox {
    /** @param {object} t - gettext functions */
    constructor(t) {
        this.actor = new St.BoxLayout({vertical: true, style_class: 'gaq-legend', x_expand: true, visible: false});
        this.actor.add_child(label(t.gettext('Marks on the bar'), 'gaq-section'));
        for (const row of legendRows(t)) {
            const line = new St.BoxLayout({style_class: 'gaq-legend-row', x_expand: true});
            // An icon gets a fixed size and sits in the same kind of pill as a text mark.
            const mark = row.icon
                ? new St.Bin({
                    style_class: `gaq-pill ${row.cssClass} gaq-legend-mark`,
                    y_align: Clutter.ActorAlign.CENTER,
                    child: new St.Icon({icon_name: row.icon, icon_size: MARK_ICON_PX}),
                })
                : label(row.glyph, `gaq-pill ${row.cssClass} gaq-legend-mark`);
            const text = new St.BoxLayout({vertical: true, x_expand: true});
            text.add_child(label(row.title, 'gaq-strong', {x_align: Clutter.ActorAlign.START}));
            text.add_child(wrap(label(row.description, 'gaq-detail', {x_expand: true})));
            line.add_child(mark);
            line.add_child(text);
            this.actor.add_child(line);
        }
    }

    get visible() {
        return this.actor.visible;
    }

    toggle() {
        this.actor.visible = !this.actor.visible;
        return this.actor.visible;
    }
}

/** "Not tracked (2)", a collapsed list with a Resume button on each provider. */
export class UntrackedSection {
    /**
     * @param {object} options
     * @param {object} options.t - gettext functions
     * @param {(id: string) => string} options.iconPath
     * @param {(id: string) => void} options.onResume
     */
    constructor({t, iconPath, onResume}) {
        this._t = t;
        this._iconPath = iconPath;
        this._onResume = onResume;
        this._key = '';
        this._open = false;
        this._userToggled = false;
        this.actor = new St.BoxLayout({vertical: true, style_class: 'gaq-untracked', x_expand: true, visible: false});
        this._chevron = new St.Icon({style_class: 'gaq-chevron-icon', icon_name: 'pan-end-symbolic'});
        this._title = label('', 'gaq-section', {x_expand: true});
        const header = new St.BoxLayout({x_expand: true});
        header.add_child(this._chevron);
        header.add_child(this._title);
        this._toggle = new St.Button({style_class: 'gaq-untracked-toggle', can_focus: true, reactive: true, track_hover: true, x_expand: true, toggle_mode: true, child: header});
        this._toggle.connect('clicked', () => {
            this._userToggled = true;
            this._open = this._toggle.checked;
            this._sync();
        });
        this._list = new St.BoxLayout({vertical: true, style_class: 'gaq-untracked-list', x_expand: true, visible: false});
        this.actor.add_child(this._toggle);
        this.actor.add_child(this._list);
    }

    /**
     * @param {Array<{id: string, name: string}>} providers
     * @param {{expand?: boolean}} [options] - open the list by itself (nothing else is on the popup),
     *   until the user has opened or closed it by hand
     */
    update(providers, {expand = false} = {}) {
        if (!this._userToggled)
            this._open = expand;
        const key = providers.map(provider => provider.id).join('|');
        this.actor.visible = providers.length > 0;
        this._title.text = fmt(this._t.ngettext('Not tracked (%d)', 'Not tracked (%d)', providers.length), providers.length);
        this._toggle.accessible_name = this._title.text;
        if (key !== this._key) {
            this._key = key;
            for (const child of this._list.get_children())
                child.destroy();
            for (const {id, name} of providers) {
                const row = new St.BoxLayout({style_class: 'gaq-untracked-row', x_expand: true});
                row.add_child(new St.Icon({style_class: 'gaq-icon', gicon: Gio.icon_new_for_string(this._iconPath(id)), y_align: Clutter.ActorAlign.CENTER}));
                row.add_child(label(name, 'gaq-muted', {x_expand: true}));
                const resume = new St.Button({label: this._t.gettext('Resume'), style_class: 'gaq-button', can_focus: true, reactive: true, track_hover: true});
                resume.accessible_name = fmt(this._t.gettext('Resume tracking %s'), name);
                resume.connect('clicked', () => {
                    // The row is about to go: keep the keyboard focus on the section.
                    this._toggle.grab_key_focus();
                    this._onResume(id);
                });
                row.add_child(resume);
                this._list.add_child(row);
            }
        }
        this._sync();
    }

    _sync() {
        this._list.visible = this._open && this.actor.visible;
        this._toggle.checked = this._open;
        // The arrow of a closed list points the way the text reads.
        const rtl = this._chevron.get_text_direction() === Clutter.TextDirection.RTL;
        this._chevron.icon_name = this._open ? 'pan-down-symbolic' : (rtl ? 'pan-start-symbolic' : 'pan-end-symbolic');
    }
}
