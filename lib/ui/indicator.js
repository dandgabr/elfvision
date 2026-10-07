// The panel button: the bar items plus the popup. Milestone M0 feeds it the
// static demo snapshots; later milestones swap in the scheduler's snapshots.
//
// The bar adapts to the room the panel leaves it: it shrinks to a compact
// form, then shows fewer providers, then a single headline item, so it is
// never clipped by other extensions (docs/adr/0004-panel-bar.md).

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {demoSnapshots} from '../core/fixtures.js';
import {candidateLayouts, chooseLayout, sideWidth} from '../core/fit.js';
import {selectForBar} from '../core/selection.js';
import {barView, cardView, summaryText, updatedText} from '../core/viewmodel.js';
import {BarItem} from './barItem.js';
import {ProviderCard} from './providerCard.js';

const HOUR12 = false;
const AUTO_OPEN_STATES = ['warning', 'critical', 'error', 'auth', 'stale'];
const POPUP_HEIGHT_SHARE = 0.7;
const FOOTER_AND_CHROME_PX = 110;
const FIT_DEBOUNCE_MS = 120;

export default GObject.registerClass(
class GaqIndicator extends PanelMenu.Button {
    /**
     * @param {Extension} extension
     * @param {Gio.Settings} settings
     * @param {'left'|'center'|'right'} position - the panel box that holds this button
     */
    _init(extension, settings, position) {
        super._init(0.5, extension.metadata.name, false);
        this._extension = extension;
        this._settings = settings;
        this._position = position;
        this._t = {
            gettext: s => extension.gettext(s),
            ngettext: (singular, plural, n) => extension.ngettext(singular, plural, n),
            pgettext: (context, s) => extension.pgettext(context, s),
        };

        this._barItems = new Map();
        this._cards = new Map();
        this._userOpen = new Map();
        this._lastRefreshMs = Date.now();
        this._layoutKey = '';
        this._fitSource = 0;
        this._signals = [];

        this._bar = new St.BoxLayout({style_class: 'gaq-bar', y_expand: true, y_align: Clutter.ActorAlign.FILL});
        // The items live in their own box so rebuilding them never destroys the
        // "+N" badge that sits next to them in headline mode.
        this._items = new St.BoxLayout({style_class: 'gaq-items', y_expand: true, y_align: Clutter.ActorAlign.FILL});
        this._more = new St.Label({style_class: 'gaq-more', y_align: Clutter.ActorAlign.CENTER, visible: false});
        this._bar.add_child(this._items);
        this._bar.add_child(this._more);
        this.add_child(this._bar);

        this._buildPopup();
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._onOpened();
        });

        for (const key of ['bar-count', 'compact-mode'])
            this._signals.push([this._settings, this._settings.connect(`changed::${key}`, () => this._relayout())]);
        this._signals.push([this, this.connect('notify::allocation', () => this._scheduleFit())]);
        this._watchPanel();

        this._refresh();
    }

    // ---------------------------------------------------------------- popup

    _iconPath(id) {
        return `${this._extension.path}/icons/${id}-symbolic.svg`;
    }

    _buildPopup() {
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false, activate: false});
        const root = new St.BoxLayout({vertical: true, style_class: 'gaq-popup', x_expand: true});

        this._summary = new St.Label({style_class: 'gaq-summary'});
        this._onBarTitle = new St.Label({style_class: 'gaq-section'});
        this._onBarBox = new St.BoxLayout({vertical: true, style_class: 'gaq-cards', x_expand: true});
        this._hiddenTitle = new St.Label({style_class: 'gaq-section'});
        this._hiddenBox = new St.BoxLayout({vertical: true, style_class: 'gaq-cards', x_expand: true});

        const content = new St.BoxLayout({vertical: true, style_class: 'gaq-content', x_expand: true});
        for (const child of [this._summary, this._onBarTitle, this._onBarBox, this._hiddenTitle, this._hiddenBox])
            content.add_child(child);

        // Classic (non-overlay) scrollbars take their own column, so they never
        // draw over the cards.
        this._scroll = new St.ScrollView({
            style_class: 'gaq-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: false,
            x_expand: true,
            child: content,
        });

        this._updated = new St.Label({style_class: 'gaq-muted', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        const refresh = this._button(this._t.gettext('Refresh'), () => this._refresh());
        const preferences = this._button(this._t.gettext('Preferences'), () => {
            this.menu.close();
            this._extension.openPreferences();
        });
        const footer = new St.BoxLayout({style_class: 'gaq-footer', x_expand: true});
        footer.add_child(this._updated);
        footer.add_child(refresh);
        footer.add_child(preferences);

        root.add_child(this._scroll);
        root.add_child(footer);
        item.add_child(root);
        this.menu.addMenuItem(item);
    }

    _button(text, onClick) {
        const button = new St.Button({
            label: text,
            style_class: 'gaq-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        button.connect('clicked', onClick);
        return button;
    }

    _onOpened() {
        const monitor = Main.layoutManager.findMonitorForActor(this) ?? Main.layoutManager.primaryMonitor;
        const maxHeight = Math.floor(monitor.height * POPUP_HEIGHT_SHARE) - FOOTER_AND_CHROME_PX;
        this._scroll.style = `max-height: ${maxHeight}px;`;
        this._updated.text = updatedText(Date.now() - this._lastRefreshMs, {t: this._t});
    }

    _isOpen(view) {
        const user = this._userOpen.get(view.id);
        // The user's choice holds until the card changes state.
        if (user && user.state === view.state)
            return user.open;
        return AUTO_OPEN_STATES.includes(view.state);
    }

    _toggle(id) {
        const snapshot = this._snapshots.find(s => s.id === id);
        const view = cardView(snapshot, this._context());
        this._userOpen.set(id, {open: !this._isOpen(view), state: view.state});
        this._syncCard(snapshot);
    }

    _context() {
        return {t: this._t, nowMs: this._nowMs, hour12: HOUR12};
    }

    // ------------------------------------------------------------ refresh

    _refresh() {
        this._nowMs = Date.now();
        this._lastRefreshMs = this._nowMs;
        this._snapshots = demoSnapshots(this._nowMs);
        this._summary.text = summaryText(this._snapshots, this._context());
        this._updated.text = updatedText(0, {t: this._t});
        this._relayout();
    }

    /** Recompute what the bar shows, then what the popup lists. */
    _relayout() {
        if (!this._snapshots)
            return;
        this._fit();
    }

    // ---------------------------------------------------------- bar layout

    _boxActor() {
        const panel = Main.panel;
        return {left: panel._leftBox, center: panel._centerBox, right: panel._rightBox}[this._position];
    }

    /** Width the panel leaves to the box that holds this button. */
    _budget() {
        if (this._position === 'center')
            return Infinity;
        const panel = Main.panel;
        const monitor = Main.layoutManager.findMonitorForActor(panel);
        let offset = 0;
        if (monitor) {
            const work = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
            offset = 2 * (work.x - monitor.x) + work.width - monitor.width;
        }
        const [, centerNatural] = panel._centerBox.get_preferred_width(-1);
        return sideWidth(panel.get_allocation_box().get_width(), centerNatural, offset);
    }

    _fit() {
        // Measuring a button the panel has already removed (shell teardown,
        // a rebuild in progress) makes St complain, so skip it.
        if (!this.get_stage())
            return;
        const layouts = candidateLayouts(this._settings.get_int('bar-count'), this._settings.get_string('compact-mode'));
        const box = this._boxActor();
        const [, own] = this.get_preferred_width(-1);
        const [, boxNatural] = box.get_preferred_width(-1);
        const others = Math.max(0, boxNatural - own);
        const budget = this._budget();

        const choice = chooseLayout(layouts, layout => {
            this._applyBar(layout);
            return others + this.get_preferred_width(-1)[1];
        }, budget);
        this._applyBar(choice.layout);
        this._syncPopup(choice.layout);
    }

    _applyBar({count, compact, headline}) {
        const {onBar} = selectForBar(this._snapshots, {count: headline ? 1 : count});
        const key = `${onBar.map(s => s.id).join(',')}|${compact || headline}|${headline}`;

        const wanted = onBar.map(s => s.id);
        const same = wanted.length === this._barItems.size && wanted.every(id => this._barItems.has(id));
        if (!same) {
            this._items.destroy_all_children();
            this._barItems.clear();
            for (const snapshot of onBar) {
                const item = new BarItem(this._iconPath(snapshot.id));
                this._barItems.set(snapshot.id, item);
                this._items.add_child(item);
            }
        }
        for (const snapshot of onBar)
            this._barItems.get(snapshot.id).update(barView(snapshot, this._context()), {compact: compact || headline});

        const rest = this._snapshots.filter(s => s.tracked !== false).length - 1;
        this._more.text = `+${rest}`;
        this._more.visible = headline && rest > 0;

        this._layoutKey = key;
        this._shown = onBar;
        this.accessible_name = onBar.map(s => barView(s, this._context()).accessibleName).join(', ');
    }

    _syncPopup(layout) {
        const {onBar, hidden} = selectForBar(this._snapshots, {count: layout.headline ? 1 : layout.count});
        this._syncCards(this._onBarBox, onBar);
        this._syncCards(this._hiddenBox, hidden);
        this._onBarTitle.text = this._t.gettext('On the bar');
        this._hiddenTitle.text = hidden.length
            ? this._t.ngettext('Hidden from the bar (%d)', 'Hidden from the bar (%d)', hidden.length)
                .replace('%d', String(hidden.length))
            : '';
        this._hiddenTitle.visible = hidden.length > 0;
    }

    // ------------------------------------------- reacting to the panel's room

    _watchPanel() {
        const panel = Main.panel;
        for (const box of [panel._leftBox, panel._centerBox, panel._rightBox]) {
            for (const signal of ['child-added', 'child-removed', 'notify::allocation'])
                this._signals.push([box, box.connect(signal, () => this._scheduleFit())]);
        }
        this._signals.push([Main.layoutManager,
            Main.layoutManager.connect('monitors-changed', () => this._scheduleFit())]);
    }

    /** Fit again shortly after the panel changes, without reacting to every frame. */
    _scheduleFit() {
        if (this._fitSource || !this._snapshots)
            return;
        this._fitSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FIT_DEBOUNCE_MS, () => {
            this._fitSource = 0;
            this._fit();
            return GLib.SOURCE_REMOVE;
        });
    }

    // ---------------------------------------------------------- popup cards

    _syncCards(container, snapshots) {
        const wanted = snapshots.map(s => s.id);
        const current = container.get_children();
        const same = current.length === wanted.length &&
            current.every((card, i) => card === this._cards.get(wanted[i]));
        if (!same) {
            for (const card of current)
                container.remove_child(card);
            for (const snapshot of snapshots) {
                let card = this._cards.get(snapshot.id);
                if (!card) {
                    card = new ProviderCard({
                        iconPath: this._iconPath(snapshot.id),
                        t: this._t,
                        onToggle: () => this._toggle(snapshot.id),
                    });
                    this._cards.set(snapshot.id, card);
                }
                container.add_child(card);
            }
        }
        for (const snapshot of snapshots)
            this._syncCard(snapshot);
    }

    _syncCard(snapshot) {
        const view = cardView(snapshot, this._context());
        this._cards.get(snapshot.id).update(view, {open: this._isOpen(view)});
    }

    destroy() {
        if (this._fitSource) {
            GLib.source_remove(this._fitSource);
            this._fitSource = 0;
        }
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];
        this._barItems.clear();
        this._cards.clear();
        this._userOpen.clear();
        super.destroy();
    }
});
