// The panel button: the bar items plus the popup, fed by the quota controller.
//
// The bar adapts to the room the panel leaves it: it shrinks to a compact
// form, then shows fewer providers, then a single headline item, so it is
// never clipped by other extensions (docs/adr/0004-panel-bar.md).

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {barView as panelBarView} from '../core/barView.js';
import {candidateLayouts, chooseStickyLayout, sideWidth} from '../core/fit.js';
import {availableProviders} from '../providers/registry.js';
import {selectForBar} from '../core/selection.js';
import {barTooltip, cardView, fmt, footerText, problemCount, summaryText, untrackedProviders} from '../core/viewmodel.js';
import {BarItem} from './barItem.js';
import {LegendBox, UntrackedSection} from './popupExtras.js';
import {ProviderCard, wrap} from './providerCard.js';
import {attachTooltip, destroyTooltip, hideTooltip} from './tooltip.js';
import {EffectsLayer, EffectsStack, ThemeEffects} from './themeEffects.js';

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
        this._renderSource = 0;
        this._fitSource = 0;
        this._anchor = null;
        this._widths = new Map();
        this._fitPending = false;
        this._appliedKey = '';
        this._appliedLayout = null;
        this._busySource = 0;
        this._legendSource = 0;
        this._cleaned = false;
        this._unsubscribe = null;

        this._bar = new St.BoxLayout({style_class: 'gaq-bar', y_expand: true, y_align: Clutter.ActorAlign.FILL});
        // The items live in their own box so rebuilding them never destroys the
        // "+N" badge that sits next to them in headline mode.
        this._items = new St.BoxLayout({style_class: 'gaq-items', y_expand: true, y_align: Clutter.ActorAlign.FILL});
        this._more = new St.Label({style_class: 'gaq-more', y_align: Clutter.ActorAlign.CENTER, visible: false});
        this._bar.add_child(this._items);
        this._bar.add_child(this._more);
        // With nothing connected the bar shows only the extension's mark.
        this._emptyIcon = new St.Icon({
            gicon: Gio.icon_new_for_string(this._iconPath('generic')),
            style_class: 'gaq-glyph-icon',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._bar.add_child(this._emptyIcon);
        this.add_child(this._bar);

        this._buildPopup();
        // The theme styles the popup surface through this class.
        this.menu.actor.add_style_class_name('gaq-menu');
        this._unsubscribeEffects = this._extension._themes.subscribeEffects(() => this._syncEffects());
        Main.sessionMode.connectObject('updated', () => this._syncEffects(), this);
        this._syncEffects(false);
        this.menu.connect('open-state-changed', (_menu, open) => {
            this._syncEffects(open);
            if (open) {
                this._onOpened();
            } else {
                this._stopOpenTick();
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
        this._desktop = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._desktop.connectObject('changed::clock-format', () => this._onSnapshots(), this);
        for (const key of ['clock-format', 'reset-format', 'auto-open', 'untracked-providers'])
            this._settings.connectObject(`changed::${key}`, () => this._onSnapshots(), this);
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

        // Nothing connected yet: say so and point to the place to add an account.
        this._emptyBox = new St.BoxLayout({vertical: true, style_class: 'gaq-cards', x_expand: true, visible: false});
        this._emptyTitle = wrap(new St.Label({style_class: 'gaq-section'}));
        this._emptyHint = wrap(new St.Label({style_class: 'gaq-detail'}));
        this._emptyBox.add_child(this._emptyTitle);
        this._emptyBox.add_child(this._emptyHint);
        this._addAccount = this._button(this._t.gettext('Add account'), () => {
            this.menu.close();
            // Open on the first account that is not connected, when there is one.
            const running = new Set(this._controller.providerIds());
            const next = availableProviders().find(meta => !running.has(meta.id));
            this._settings.set_string('prefs-target', this._settings.get_boolean('first-use-done') && next ? next.id : '');
            this._extension.openPreferences();
        });
        this._addAccount.x_align = Clutter.ActorAlign.START;

        // Providers the user paused: a collapsed list, each with a Resume button.
        this._untracked = new UntrackedSection({
            t: this._t,
            iconPath: id => this._iconPath(id),
            onResume: id => {
                // What is written is the paused providers that exist, minus this one: an id that is not a
                // provider (an edited setting) is not kept.
                const known = availableProviders().map(meta => meta.id);
                this._settings.set_strv('untracked-providers',
                    this._settings.get_strv('untracked-providers').filter(other => other !== id && known.includes(other)));
            },
        });
        // The marks on the bar and what they mean, opened from the "?" button of the footer.
        this._legend = new LegendBox(this._t);

        const content = new St.BoxLayout({vertical: true, style_class: 'gaq-content', x_expand: true});
        for (const child of [this._summary, this._emptyBox, this._onBarTitle, this._onBarBox, this._hiddenTitle, this._hiddenBox,
            this._untracked.actor, this._addAccount, this._legend.actor])
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
        // A toggle: it says whether the legend is open, and its tooltip says what it is.
        const legend = this._button('?', () => {
            legend.checked = this._legend.toggle();
            if (legend.checked)
                this._scrollToLegend();
        });
        this._legendButton = legend;
        this.menu.actor.connect('captured-event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.KEY_PRESS || event.get_key_symbol() !== Clutter.KEY_Escape || !this._legend.visible)
                return Clutter.EVENT_PROPAGATE;
            this._legend.hide();
            legend.checked = false;
            if (this._legendSource) {
                GLib.source_remove(this._legendSource);
                this._legendSource = 0;
            }
            hideTooltip();
            return Clutter.EVENT_STOP;
        });
        legend.toggle_mode = true;
        legend.accessible_name = this._t.gettext('What the marks on the bar mean');
        attachTooltip(legend, () => this._t.gettext('What the marks on the bar mean'));
        // The status gets a line of its own; the buttons sit under it.
        const buttons = new St.BoxLayout({style_class: 'gaq-footer-buttons', x_expand: true});
        buttons.add_child(new St.Widget({x_expand: true}));
        buttons.add_child(legend);
        buttons.add_child(refresh);
        buttons.add_child(preferences);
        const footer = new St.BoxLayout({vertical: true, style_class: 'gaq-footer', x_expand: true});
        footer.add_child(this._updated);
        footer.add_child(buttons);

        root.add_child(this._scroll);
        root.add_child(footer);
        this._effectBackground = new St.Widget({reactive: false, can_focus: false, x_expand: true, y_expand: true});
        this._effectDecoration = new EffectsLayer();
        this._effects = new ThemeEffects({backgroundActor: this._effectBackground, decorationActor: this._effectDecoration,
            extensionPath: this._extension.path});
        // A fixed decorative gutter makes background effects visible without placing
        // particles over opaque reading zones or moving controls on policy changes.
        const frame = new St.Bin({style_class: 'gaq-popup-frame', child: root, x_expand: true, y_expand: true});
        const stack = new EffectsStack({background: this._effectBackground, decoration: this._effectDecoration, foreground: frame});
        item.add_child(stack);
        this.menu.addMenuItem(item);
    }

    _syncEffects(open = this.menu.isOpen) {
        open = open && !Main.sessionMode.isLocked;
        if (this._cleaned)
            return;
        const state = this._extension._themes.getEffectState(open);
        this._effects.apply({policy: state.policy, theme: state, scheme: state.scheme});
        this._effects.setOpen(open);
        // BoxPointer defaults to ALWAYS offscreen: a child BACKGROUND blur then samples
        // that empty intermediate buffer instead of the desktop. Permit direct painting
        // at full opacity for this owned popup; Shell still redirects its fade transition.
        this.menu.actor.set_offscreen_redirect(this._effects.inspect().material === 'frosted-glass'
            ? Clutter.OffscreenRedirect.AUTOMATIC_FOR_OPACITY : Clutter.OffscreenRedirect.ALWAYS);
        if (this._effects.inspect().active)
            this.menu.actor.add_style_class_name('gaq-effects-active');
        else
            this.menu.actor.remove_style_class_name('gaq-effects-active');
    }

    /** Scroll the legend into view once it has a size: right after it is shown it has none yet. */
    _scrollToLegend() {
        if (this._legendSource)
            GLib.source_remove(this._legendSource);
        this._legendSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._legendSource = 0;
            try {
                ensureActorVisibleInScrollView(this._scroll, this._legend.actor);
            } catch (_error) {
                // The popup was closed meanwhile.
            }
            return GLib.SOURCE_REMOVE;
        });
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
        if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
            return;
        this._anchor = new Clutter.Actor({x, y, width, height, opacity: 0, reactive: false});
        Main.uiGroup.add_child(this._anchor);
        // BoxPointer can allocate before a newly added sibling receives its first
        // allocation. Give the fixed anchor its captured box before using its extents.
        this._anchor.allocate(new Clutter.ActorBox({x1: x, y1: y, x2: x + width, y2: y + height}));
        pointer.setPosition(this._anchor, this.menu._arrowAlignment ?? 0.5);
    }

    _releaseAnchor() {
        this._anchor?.destroy();
        this._anchor = null;
    }

    _onOpened() {
        // A tooltip that was up when the item was clicked would sit on top of the popup.
        hideTooltip();
        this._pinPopup();
        const monitor = Main.layoutManager.findMonitorForActor(this) ?? Main.layoutManager.primaryMonitor;
        const maxHeight = Math.floor(monitor.height * POPUP_HEIGHT_SHARE) - FOOTER_AND_CHROME_PX;
        this._scroll.style = `max-height: ${maxHeight}px;`;
        // The numbers on the cards (a reset in so many minutes, how old a value is) follow the
        // clock, not only the arrival of data: refresh them now and while the popup stays open.
        this._onSnapshots();
        if (!this._openTick) {
            this._openTick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
                this._onSnapshots();
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    _stopOpenTick() {
        if (this._openTick) {
            GLib.source_remove(this._openTick);
            this._openTick = 0;
        }
    }

    /** "Updated 3 min ago · 1 with a problem", or a note while nothing has arrived yet. */
    _updatedLabel() {
        const last = this._controller.lastUpdateMs;
        const text = footerText(last ? Date.now() - last : null, problemCount(this._snapshots), {t: this._t});
        // Made-up numbers must never pass for real ones.
        return this._settings.get_string('data-source') === 'demo' ? `${this._t.gettext('Demo data (made up)')} · ${text}` : text;
    }

    _isOpen(view) {
        const user = this._userOpen.get(view.id);
        // The user's choice holds until the card changes state.
        if (user && user.state === view.state)
            return user.open;
        return this._settings.get_boolean('auto-open') && AUTO_OPEN_STATES.includes(view.state);
    }

    _toggle(id) {
        const snapshot = this._snapshots.find(s => s.id === id);
        if (!snapshot)
            return;
        const view = cardView(snapshot, this._context());
        this._userOpen.set(id, {open: !this._isOpen(view), state: view.state});
        this._syncCard(snapshot);
    }

    /** The 12-hour clock choice: forced by the setting, or the GNOME clock setting. */
    _hour12() {
        const choice = this._settings.get_string('clock-format');
        if (choice !== 'system')
            return choice === '12h';
        return this._desktop.get_string('clock-format') === '12h';
    }

    _context() {
        return {
            t: this._t,
            nowMs: this._nowMs,
            hour12: this._hour12(),
            resetStyle: this._settings.get_string('reset-format'),
            // Demo providers have no account to connect.
            configurable: this._settings.get_string('data-source') === 'live',
        };
    }

    // ------------------------------------------------------------ refresh

    /** The controller has new data: redraw the bar and the popup from it. */
    _onSnapshots() {
        if (this._cleaned)
            return;
        this._snapshots = this._controller.snapshots();
        if (this._renderSource)
            return;
        this._renderSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._renderSource = 0;
            if (!this._cleaned)
                this._renderSnapshots();
            return GLib.SOURCE_REMOVE;
        });
    }

    _renderSnapshots() {
        this._nowMs = Date.now();
        const empty = this._isEmpty();
        this._summary.visible = !empty;
        this._summary.text = this._snapshots.length
            ? summaryText(this._snapshots, this._context())
            : this._t.gettext('Waiting for the first update…');
        // A paused provider is not "nothing connected": say what is true.
        const paused = this._settings.get_strv('untracked-providers').length > 0;
        this._emptyTitle.text = paused ? this._t.gettext('Nothing is being tracked.') : this._t.gettext('Nothing connected yet.');
        this._emptyHint.text = paused
            ? this._t.gettext('Resume a provider below to see its quota.')
            : this._t.gettext('Add an account in Preferences to see your quotas here.');
        this._emptyBox.visible = empty;
        // A quiet way to add the accounts that are not connected yet.
        const live = this._settings.get_string('data-source') === 'live';
        this._addAccount.visible = live && (empty || this._snapshots.length < availableProviders().length);
        this._untracked.update(live ? untrackedProviders(this._settings.get_strv('untracked-providers'), availableProviders()) : [], {expand: empty});
        this._updated.text = this._updatedLabel();
        this._relayout();
    }

    /** True when real data is on and no provider is connected and tracked. */
    _isEmpty() {
        return this._settings.get_string('data-source') === 'live' && this._controller.synced
            && this._snapshots.length === 0 && this._controller.providerIds().length === 0;
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
                item = new BarItem(this._iconPath(snapshot.id), view => barTooltip(view, {...this._context(), nowMs: Date.now()}));
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
        this._emptyIcon.visible = false;
        if (!tracked.length) {
            if (this._isEmpty()) {
                this._more.visible = false;
                this._emptyIcon.visible = true;
                this.accessible_name = this._t.gettext('Nothing connected yet');
                return;
            }
            // Nothing has arrived yet: a small placeholder keeps the button clickable.
            this._more.text = '…';
            this._more.style_class = 'gaq-more gaq-placeholder';
            this._more.accessible_name = this._t.gettext('Waiting for the first update');
            this._more.visible = true;
            this.accessible_name = this._more.accessible_name;
            return;
        }
        const {items} = panelBarView({snapshots: this._snapshots,
            settings: {count, compact, headline, ...this._context()}, now: this._nowMs});
        for (const description of items) {
            const item = this._barItems.get(description.id);
            item.visible = description.visible;
            if (!item.visible)
                continue;
            if (description.invalid) {
                item.invalidate();
                continue;
            }
            try {
                item.update(description.view, {compact: description.compact});
            } catch (error) {
                item.invalidate();
                console.error(`gnome-ai-quota: cannot draw ${description.id} on the bar: ${error.message}`);
            }
        }

        const rest = tracked.length - 1;
        this._more.style_class = 'gaq-more';
        this._more.text = `+${rest}`;
        this._more.accessible_name = fmt(this._t.ngettext('%d more provider', '%d more providers', rest), rest);
        this._more.visible = headline && rest > 0;

        this.accessible_name = items.filter(item => item.visible).map(item =>
            item.view?.accessibleName ?? tracked.find(snapshot => snapshot.id === item.id)?.name).join(', ');
    }

    _syncPopup(layout) {
        const {onBar, hidden} = selectForBar(this._snapshots, {count: layout.headline ? 1 : layout.count});
        this._syncCards([[this._onBarBox, onBar], [this._hiddenBox, hidden]]);
        this._onBarTitle.text = this._t.gettext('On the bar');
        this._onBarTitle.visible = !this._isEmpty();
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
        const focusedCard = [...this._cards].map(([id, card]) => ({id, card, key: card.captureFocus()}))
            .find(target => target.key !== null);
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
        // Reparenting clears Shell focus; restore the logical target after any body rebuild.
        if (changed && focusedCard && present.has(focusedCard.id))
            focusedCard.card.restoreFocus(focusedCard.key);
    }

    _cardFor(snapshot) {
        let card = this._cards.get(snapshot.id);
        if (!card) {
            card = new ProviderCard({
                iconPath: this._iconPath(snapshot.id),
                t: this._t,
                onToggle: () => this._toggle(snapshot.id),
                onRetry: () => this._controller.refresh(snapshot.id),
                onConfigure: () => {
                    this.menu.close();
                    // The preferences window shows this account first.
                    this._settings.set_string('prefs-target', snapshot.id);
                    this._extension.openPreferences();
                },
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
            card.invalidate();
            console.error(`gnome-ai-quota: cannot draw the card of ${snapshot.id}: ${error.message}`);
        }
    }

    /** Release everything this button holds. Idempotent: destroy() and the destroy signal both call it. */
    _cleanup() {
        if (this._cleaned)
            return;
        this._cleaned = true;
        this._stopOpenTick();
        this._unsubscribeEffects?.();
        this._unsubscribeEffects = null;
        this._effects?.destroy();
        this._unsubscribe?.();
        this._unsubscribe = null;
        destroyTooltip();
        this._releaseAnchor();
        for (const source of [this._renderSource, this._fitSource, this._busySource, this._legendSource]) {
            if (source)
                GLib.source_remove(source);
        }
        this._fitSource = 0;
        this._busySource = 0;
        this._legendSource = 0;
        this._renderSource = 0;
        this._barItems.clear();
        this._cards.clear();
        this._userOpen.clear();
    }

    destroy() {
        this._cleanup();
        super.destroy();
    }
});
