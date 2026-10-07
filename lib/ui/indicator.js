// The panel button: the bar items plus the popup. Milestone M0 feeds it the
// static demo snapshots; later milestones swap in the scheduler's snapshots.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {demoSnapshots} from '../core/fixtures.js';
import {selectForBar} from '../core/selection.js';
import {barView, cardView, summaryText, updatedText} from '../core/viewmodel.js';
import {BarItem} from './barItem.js';
import {ProviderCard} from './providerCard.js';

// Defaults from docs/adr/0005-popup.md; they become settings in a later milestone.
const DEFAULTS = {barCount: 3, hour12: false};
const AUTO_OPEN_STATES = ['warning', 'critical', 'error', 'auth', 'stale'];
const POPUP_HEIGHT_SHARE = 0.7;
const FOOTER_AND_CHROME_PX = 110;

export default GObject.registerClass(
class GaqIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, extension.metadata.name, false);
        this._extension = extension;
        this._t = {
            gettext: s => extension.gettext(s),
            ngettext: (singular, plural, n) => extension.ngettext(singular, plural, n),
            pgettext: (context, s) => extension.pgettext(context, s),
        };

        this._barItems = new Map();
        this._cards = new Map();
        this._userOpen = new Map();
        this._lastRefreshMs = Date.now();

        this._bar = new St.BoxLayout({style_class: 'gaq-bar', y_expand: true, y_align: Clutter.ActorAlign.FILL});
        this.add_child(this._bar);

        this._buildPopup();
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._onOpened();
        });

        this._refresh();
    }

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

        this._scroll = new St.ScrollView({
            style_class: 'gaq-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            x_expand: true,
            child: content,
        });

        this._updated = new St.Label({style_class: 'gaq-muted', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        const refresh = new St.Button({
            label: this._t.gettext('Refresh'),
            style_class: 'gaq-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        refresh.connect('clicked', () => this._refresh());
        const preferences = new St.Button({
            label: this._t.gettext('Preferences'),
            style_class: 'gaq-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        preferences.connect('clicked', () => {
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
        return {t: this._t, nowMs: this._nowMs, hour12: DEFAULTS.hour12};
    }

    _refresh() {
        this._nowMs = Date.now();
        this._lastRefreshMs = this._nowMs;
        this._snapshots = demoSnapshots(this._nowMs);
        const {onBar, hidden} = selectForBar(this._snapshots, {count: DEFAULTS.barCount});

        this._syncBar(onBar);
        this._syncCards(this._onBarBox, onBar);
        this._syncCards(this._hiddenBox, hidden);

        this._summary.text = summaryText([...onBar, ...hidden], this._context());
        this._onBarTitle.text = this._t.gettext('On the bar');
        this._hiddenTitle.text = hidden.length
            ? this._t.ngettext('Hidden from the bar (%d)', 'Hidden from the bar (%d)', hidden.length)
                .replace('%d', String(hidden.length))
            : '';
        this._hiddenTitle.visible = hidden.length > 0;
        this._updated.text = updatedText(0, {t: this._t});

        this.accessible_name = onBar.map(s => barView(s, this._context()).accessibleName).join(', ');
    }

    _syncBar(onBar) {
        const wanted = onBar.map(s => s.id);
        const same = wanted.length === this._barItems.size && wanted.every(id => this._barItems.has(id));
        if (!same) {
            this._bar.destroy_all_children();
            this._barItems.clear();
            for (const snapshot of onBar) {
                const item = new BarItem(this._iconPath(snapshot.id));
                this._barItems.set(snapshot.id, item);
                this._bar.add_child(item);
            }
        }
        for (const snapshot of onBar)
            this._barItems.get(snapshot.id).update(barView(snapshot, this._context()));
    }

    _syncCards(container, snapshots) {
        const wanted = snapshots.map(s => s.id);
        const current = container.get_children();
        const same = current.length === wanted.length &&
            current.every((card, i) => card === this._cards.get(wanted[i]));
        if (!same) {
            for (const card of current) {
                container.remove_child(card);
            }
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
        this._barItems.clear();
        this._cards.clear();
        this._userOpen.clear();
        super.destroy();
    }
});
