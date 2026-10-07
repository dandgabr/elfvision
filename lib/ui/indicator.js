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

import {ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {candidateLayouts, chooseStickyLayout, sideWidth} from '../core/fit.js';
import {selectForBar} from '../core/selection.js';
import {barView, cardView, fmt, footerText, problemCount, summaryText} from '../core/viewmodel.js';
import {BarItem} from './barItem.js';
import {ProviderCard, wrap} from './providerCard.js';
import {hideTooltip} from './tooltip.js';

const HOUR12 = false;
const AUTO_OPEN_STATES = ['warning', 'critical', 'error', 'auth', 'stale'];
const POPUP_HEIGHT_SHARE = 0.7;
const FOOTER_AND_CHROME_PX = 110;
const FIT_DEBOUNCE_MS = 120;
const REFRESH_FEEDBACK_MS = 600;
const SAFE_ID = /^[a-z0-9-]+$/;

const layoutKey = ({count, compact, headline}) => `${count}|${compact}|${headline}`;

export default GObject.registerClass(
class GaqIndicator extends PanelMenu.Button {
    /**
     * @param {Extension} extension
     * @param {Gio.Settings} settings
     * @param {'left'|'center'|'right'} position - the panel box that holds this button
     * @param {import('../services/controller.js').QuotaController} controller
     */
    _init(extension, settings, position, controller) {
        super._init(0.5, extension.metadata.name, false);
        this._extension = extension;
        this._settings = settings;
        this._position = position;
        this._controller = controller;
        this._snapshots = [];
        this._t = {
            gettext: s => extension.gettext(s),
            ngettext: (singular, plural, n) => extension.ngettext(singular, plural, n),
            pgettext: (context, s) => extension.pgettext(context, s),
        };

        this._barItems = new Map();
        this._cards = new Map();
        this._userOpen = new Map();
        this._fitSource = 0;
        this._anchor = null;
        this._widths = new Map();
        this._fitPending = false;
        this._appliedKey = '';
        this._appliedLayout = null;
        this._busySource = 0;
        this._cleaned = false;
        this._unsubscribe = null;

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
            if (open) {
                this._onOpened();
            } else {
                hideTooltip();
                this._releaseAnchor();
                if (this._fitPending) {
                    this._fitPending = false;
                    this._scheduleFit();
                }
            }
        });

        // connectObject ties every connection to this button: they are dropped
        // when it is destroyed, even if the emitter (a panel box during shell
        // teardown) is already gone, which a manual disconnect cannot handle.
        for (const key of ['bar-count', 'compact-mode'])
            this._settings.connectObject(`changed::${key}`, () => this._relayout(), this);
        this.connect('notify::allocation', () => this._scheduleFit());
        // The first fit needs the button to be on the stage.
        this.connect('notify::mapped', () => {
            // Check the JS flag first: reading a GObject property of a button that
            // is being destroyed makes GJS log a critical.
            if (!this._cleaned && this._snapshots && this.mapped)
                this._fit();
        });
        // Font and theme changes alter every measured width.
        St.ThemeContext.get_for_stage(global.stage).connectObject('changed', () => {
            this._widths.clear();
            this._scheduleFit();
        }, this);
        this._watchPanel();
        // Shell teardown can destroy the actor from C, without our destroy().
        this.connect('destroy', () => this._cleanup());

        this._unsubscribe = this._controller.subscribe(() => this._onSnapshots());
        this._onSnapshots();
    }

    // ---------------------------------------------------------------- popup

    _iconPath(id) {
        // Provider ids will come from data; never let one escape the icons folder.
        const name = SAFE_ID.test(id) ? id : 'generic';
        return `${this._extension.path}/icons/${name}-symbolic.svg`;
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

        // The note can be long when providers are in trouble: let it wrap.
        this._updated = wrap(new St.Label({style_class: 'gaq-muted', x_expand: true, y_align: Clutter.ActorAlign.CENTER}));
        const refresh = this._button(this._t.gettext('Refresh'), () => this._onRefreshClicked(refresh));
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

    /** Refresh now, and keep the button inert for a moment so the click visibly did something. */
    _onRefreshClicked(button) {
        if (this._busySource)
            return;
        const label = button.label;
        button.reactive = false;
        button.label = this._t.gettext('Refreshing…');
        const minimumShown = new Promise(resolve => {
            this._busySource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REFRESH_FEEDBACK_MS, () => {
                this._busySource = 0;
                resolve();
                return GLib.SOURCE_REMOVE;
            });
        });
        Promise.allSettled([this._controller.refresh(), minimumShown]).then(() => {
            if (this._cleaned)
                return;
            button.label = label;
            button.reactive = true;
        });
    }

    /**
     * The popup follows its source actor on every allocation, so a neighbour
     * that changes width (a monitor updating each second) would make it
     * shiver sideways. Anchor it to a still, invisible copy of the button's
     * box for as long as it is open.
     */
    _pinPopup() {
        const pointer = this.menu._boxPointer;
        if (!pointer || this._anchor)
            return;
        const [x, y] = this.get_transformed_position();
        const [width, height] = this.get_transformed_size();
        this._anchor = new Clutter.Actor({x, y, width, height, opacity: 0, reactive: false});
        Main.uiGroup.add_child(this._anchor);
        pointer.setPosition(this._anchor, this.menu._arrowAlignment ?? 0.5);
    }

    _releaseAnchor() {
        this._anchor?.destroy();
        this._anchor = null;
    }

    _onOpened() {
        this._pinPopup();
        const monitor = Main.layoutManager.findMonitorForActor(this) ?? Main.layoutManager.primaryMonitor;
        const maxHeight = Math.floor(monitor.height * POPUP_HEIGHT_SHARE) - FOOTER_AND_CHROME_PX;
        this._scroll.style = `max-height: ${maxHeight}px;`;
        this._updated.text = this._updatedLabel();
    }

    /** "Updated 3 min ago · 1 with a problem", or a note while nothing has arrived yet. */
    _updatedLabel() {
        const last = this._controller.lastUpdateMs;
        return footerText(last ? Date.now() - last : null, problemCount(this._snapshots), {t: this._t});
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
        if (!snapshot)
            return;
        const view = cardView(snapshot, this._context());
        this._userOpen.set(id, {open: !this._isOpen(view), state: view.state});
        this._syncCard(snapshot);
    }

    _context() {
        return {t: this._t, nowMs: this._nowMs, hour12: HOUR12};
    }

    // ------------------------------------------------------------ refresh

    /** The controller has new data: redraw the bar and the popup from it. */
    _onSnapshots() {
        if (this._cleaned)
            return;
        this._nowMs = Date.now();
        this._snapshots = this._controller.snapshots();
        this._summary.text = this._snapshots.length
            ? summaryText(this._snapshots, this._context())
            : this._t.gettext('Waiting for the first update…');
        this._updated.text = this._updatedLabel();
        this._relayout();
    }

    /** Recompute what the bar shows, then what the popup lists. */
    _relayout() {
        if (!this._snapshots)
            return;
        if (this.menu.isOpen && this._appliedLayout) {
            // Keep the bar still under the open popup: refresh what it shows,
            // and re-measure once the popup closes.
            this._applyBar(this._appliedLayout);
            this._syncPopup(this._appliedLayout);
            this._fitPending = true;
            return;
        }
        this._fit();
    }

    // ---------------------------------------------------------- bar layout

    /** The panel box that holds this button. */
    _boxActor() {
        const panel = Main.panel;
        return this.container?.get_parent() ??
            {left: panel._leftBox, center: panel._centerBox, right: panel._rightBox}[this._position];
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
        if (!panel._centerBox)
            return Infinity;
        const [, centerNatural] = panel._centerBox.get_preferred_width(-1);
        return sideWidth(panel.get_allocation_box().get_width(), centerNatural, offset);
    }

    /**
     * Pick the richest layout that fits and apply it.
     *
     * A full pass measures candidates by applying them, which briefly shows and
     * hides items, so it only runs when the data or the settings change. Panel
     * changes (other extensions resizing, which can happen every second) reuse
     * the widths measured by the last full pass and only touch the widgets when
     * the chosen layout actually changes.
     *
     * @param {{full?: boolean}} [options]
     */
    _fit({full = true} = {}) {
        // Measuring a button the panel has already removed (shell teardown,
        // a rebuild in progress) makes St complain, so skip it.
        if (!this.get_stage())
            return;
        const layouts = candidateLayouts(this._settings.get_int('bar-count'), this._settings.get_string('compact-mode'));
        const box = this._boxActor();
        if (!box)
            return;
        const [, own] = this.get_preferred_width(-1);
        const [, boxNatural] = box.get_preferred_width(-1);
        const others = Math.max(0, boxNatural - own);
        const budget = this._budget();

        if (full)
            this._widths.clear();
        const previous = this._appliedKey || null;
        const choice = chooseStickyLayout(layouts, layout => {
            const key = layoutKey(layout);
            if (!this._widths.has(key)) {
                this._applyBar(layout);
                this._widths.set(key, this.get_preferred_width(-1)[1]);
            }
            return others + this._widths.get(key);
        }, budget, previous, layoutKey);

        const key = layoutKey(choice.layout);
        if (full || key !== this._appliedKey)
            this._applyBar(choice.layout);
        if (full || key !== previous)
            this._syncPopup(choice.layout);
    }

    _applyBar({count, compact, headline}) {
        const tracked = this._snapshots.filter(s => s.tracked !== false);

        // One persistent item per tracked provider, in the fixed order. Layouts
        // only toggle visibility, so measuring candidates never creates or
        // destroys widgets (which would make the shell warn about allocations).
        tracked.forEach((snapshot, index) => {
            let item = this._barItems.get(snapshot.id);
            if (!item) {
                item = new BarItem(this._iconPath(snapshot.id));
                this._barItems.set(snapshot.id, item);
                this._items.add_child(item);
            }
            this._items.set_child_at_index(item, index);
        });
        for (const [id, item] of [...this._barItems]) {
            if (!tracked.some(s => s.id === id)) {
                item.destroy();
                this._barItems.delete(id);
            }
        }

        this._appliedKey = layoutKey({count, compact, headline});
        this._appliedLayout = {count, compact, headline};
        if (!tracked.length) {
            // Nothing has arrived yet: a small placeholder keeps the button clickable.
            this._more.text = '…';
            this._more.style_class = 'gaq-more gaq-placeholder';
            this._more.accessible_name = this._t.gettext('Waiting for the first update');
            this._more.visible = true;
            this.accessible_name = this._more.accessible_name;
            return;
        }
        const {onBar} = selectForBar(this._snapshots, {count: headline ? 1 : count});
        const shown = new Set(onBar.map(s => s.id));
        for (const snapshot of tracked) {
            const item = this._barItems.get(snapshot.id);
            item.visible = shown.has(snapshot.id);
            if (!item.visible)
                continue;
            try {
                item.update(barView(snapshot, this._context()), {compact: compact || headline});
            } catch (error) {
                // One malformed snapshot must not take the whole bar down.
                console.error(`gnome-ai-quota: cannot draw ${snapshot.id} on the bar: ${error.message}`);
            }
        }

        const rest = tracked.length - 1;
        this._more.style_class = 'gaq-more';
        this._more.text = `+${rest}`;
        this._more.accessible_name = fmt(this._t.ngettext('%d more provider', '%d more providers', rest), rest);
        this._more.visible = headline && rest > 0;

        this.accessible_name = onBar.map(s => {
            try {
                return barView(s, this._context()).accessibleName;
            } catch (_error) {
                return s.name;
            }
        }).join(', ');
    }

    _syncPopup(layout) {
        const {onBar, hidden} = selectForBar(this._snapshots, {count: layout.headline ? 1 : layout.count});
        this._syncCards([[this._onBarBox, onBar], [this._hiddenBox, hidden]]);
        this._onBarTitle.text = this._t.gettext('On the bar');
        this._hiddenTitle.text = hidden.length
            ? fmt(this._t.ngettext('Hidden from the bar (%d)', 'Hidden from the bar (%d)', hidden.length), hidden.length)
            : '';
        this._hiddenTitle.visible = hidden.length > 0;
    }

    // ------------------------------------------- reacting to the panel's room

    _watchPanel() {
        const panel = Main.panel;
        for (const box of [panel._leftBox, panel._centerBox, panel._rightBox].filter(Boolean)) {
            for (const signal of ['child-added', 'child-removed', 'notify::allocation'])
                box.connectObject(signal, () => this._scheduleFit(), this);
        }
        Main.layoutManager.connectObject('monitors-changed', () => this._scheduleFit(), this);
    }

    /** Fit again shortly after the panel changes, without reacting to every frame. */
    _scheduleFit() {
        if (this._cleaned || this._fitSource || !this._snapshots)
            return;
        this._fitSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FIT_DEBOUNCE_MS, () => {
            this._fitSource = 0;
            // The bar stays still while the popup is open (it is anchored to the
            // bar); the pending fit runs when the popup closes.
            if (this.menu.isOpen)
                this._fitPending = true;
            else
                this._fit({full: false});
            return GLib.SOURCE_REMOVE;
        });
    }

    // ---------------------------------------------------------- popup cards

    /**
     * Put each card in the right container. A card moving between containers
     * must be detached first, or the second add_child warns about a parent.
     *
     * @param {Array<[St.BoxLayout, object[]]>} groups
     */
    _syncCards(groups) {
        const changed = groups.some(([container, snapshots]) => {
            const current = container.get_children();
            return current.length !== snapshots.length ||
                current.some((card, i) => card !== this._cards.get(snapshots[i].id));
        });

        if (changed) {
            for (const [container] of groups) {
                for (const card of container.get_children())
                    container.remove_child(card);
            }
            for (const [container, snapshots] of groups) {
                for (const snapshot of snapshots)
                    container.add_child(this._cardFor(snapshot));
            }
        }

        const present = new Set(groups.flatMap(([, snapshots]) => snapshots.map(s => s.id)));
        for (const [id, card] of [...this._cards]) {
            if (!present.has(id)) {
                card.destroy();
                this._cards.delete(id);
                this._userOpen.delete(id);
            }
        }
        for (const [, snapshots] of groups) {
            for (const snapshot of snapshots)
                this._syncCard(snapshot);
        }
    }

    _cardFor(snapshot) {
        let card = this._cards.get(snapshot.id);
        if (!card) {
            card = new ProviderCard({
                iconPath: this._iconPath(snapshot.id),
                t: this._t,
                onToggle: () => this._toggle(snapshot.id),
                onRetry: () => this._controller.refresh(snapshot.id),
                onFocus: actor => {
                    try {
                        ensureActorVisibleInScrollView(this._scroll, actor);
                    } catch (_error) {
                        // The card is not in the scroll view yet.
                    }
                },
            });
            this._cards.set(snapshot.id, card);
        }
        return card;
    }

    _syncCard(snapshot) {
        const card = this._cards.get(snapshot.id);
        if (!card)
            return;
        try {
            const view = cardView(snapshot, this._context());
            card.update(view, {open: this._isOpen(view)});
        } catch (error) {
            console.error(`gnome-ai-quota: cannot draw the card of ${snapshot.id}: ${error.message}`);
        }
    }

    /** Release everything this button holds. Idempotent: destroy() and the destroy signal both call it. */
    _cleanup() {
        if (this._cleaned)
            return;
        this._cleaned = true;
        this._unsubscribe?.();
        this._unsubscribe = null;
        hideTooltip();
        this._releaseAnchor();
        for (const source of [this._fitSource, this._busySource]) {
            if (source)
                GLib.source_remove(source);
        }
        this._fitSource = 0;
        this._busySource = 0;
        this._barItems.clear();
        this._cards.clear();
        this._userOpen.clear();
    }

    destroy() {
        this._cleanup();
        super.destroy();
    }
});
