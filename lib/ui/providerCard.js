// One provider card in the popup. The card owns its widgets and repaints them
// from a cardView() result; the menu is never rebuilt, so it stays open while
// a refresh runs.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {fmt} from '../core/viewmodel.js';
import {MeterBar} from './meter.js';
import {tabularNumbers} from './numericText.js';
import {attachTooltip, hideTooltip} from './tooltip.js';

function label(text, styleClass, extra = {}) {
    return tabularNumbers(new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER, ...extra}));
}

/** Let a label wrap onto several lines instead of ending in an ellipsis. */
export function wrap(labelActor) {
    labelActor.clutter_text.line_wrap = true;
    labelActor.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    labelActor.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    return labelActor;
}

function spacer() {
    return new St.Widget({x_expand: true});
}

export const ProviderCard = GObject.registerClass(
class GaqProviderCard extends St.BoxLayout {
    /**
     * @param {object} options
     * @param {string} options.iconPath - symbolic icon file
     * @param {object} options.t - translation functions
     * @param {Function} options.onToggle - called when the header is activated
     * @param {Function} [options.onFocus] - called with a widget that gained keyboard focus
     * @param {Function} [options.onRetry] - called when "Try again" is pressed
     * @param {Function} [options.onConfigure] - called when "Open Preferences" is pressed
     */
    _init({iconPath, t, onToggle, onFocus = () => {}, onRetry = () => {}, onConfigure = () => {}}) {
        super._init({vertical: true, style_class: 'gaq-card', x_expand: true});
        this._t = t;

        // The chevron is only an indicator; the whole header is the button, so
        // the target is large and Enter or Space work on the focused header.
        this._chevron = new St.Icon({style_class: 'gaq-chevron-icon', icon_name: 'pan-down-symbolic'});
        this._onFocus = onFocus;
        this._onRetry = onRetry;
        this._onConfigure = onConfigure;

        this._name = wrap(label('', 'gaq-card-name'));
        this._plan = wrap(label('', 'gaq-card-plan'));
        this._pill = wrap(label('', 'gaq-pill'));
        this._hero = wrap(label('', 'gaq-hero'));
        this._heroSmall = wrap(label('', 'gaq-hero-small', {y_align: Clutter.ActorAlign.END}));

        // Primary readings get their own row so names, status and large text
        // never compete for the same narrow horizontal allocation.
        const title = new St.BoxLayout({vertical: true, y_align: Clutter.ActorAlign.CENTER});
        title.add_child(this._name);
        title.add_child(this._plan);

        const hero = new St.BoxLayout({vertical: true, style_class: 'gaq-hero-box', x_expand: true});
        hero.add_child(this._hero);
        hero.add_child(this._heroSmall);

        const header = new St.BoxLayout({style_class: 'gaq-card-header', x_expand: true});
        header.add_child(this._chevron);
        header.add_child(new St.Icon({
            style_class: 'gaq-card-icon',
            gicon: Gio.icon_new_for_string(iconPath),
            y_align: Clutter.ActorAlign.CENTER,
        }));
        header.add_child(title);
        header.add_child(spacer());
        header.add_child(this._pill);
        this._header = header;
        this._heroBox = hero;
        this._headerContent = new St.BoxLayout({vertical: true, x_expand: true});
        this._headerContent.add_child(header);
        this._headerContent.add_child(hero);
        this._heroSmall.x_align = Clutter.ActorAlign.START;

        this._toggle = new St.Button({
            style_class: 'gaq-card-toggle',
            can_focus: true,
            reactive: true,
            track_hover: true,
            x_expand: true,
            child: this._headerContent,
        });
        this._toggle.connect('clicked', () => onToggle());
        this._toggle.connect('key-focus-in', () => this._onFocus(this._toggle));
        this.add_child(this._toggle);
        this._focusTargets = new Map([['header', this._toggle]]);

        this._summaryMeter = new MeterBar();
        this.add_child(this._summaryMeter);

        this._body = new St.BoxLayout({vertical: true, style_class: 'gaq-card-body', x_expand: true});
        this.add_child(this._body);
    }

    /**
     * @param {object} view - a cardView() result
     * @param {{open: boolean}} options
     */
    /** Forget what was drawn, so the next update draws everything again (after a draw that failed). */
    invalidate() {
        this._renderedKey = '';
    }

    /** Capture a logical target only while keyboard focus belongs to this card. */
    captureFocus() {
        const focus = global.stage.get_key_focus();
        if (!focus || !this.contains(focus))
            return null;
        for (const [key, actor] of this._focusTargets) {
            if (actor === focus || actor.contains(focus))
                return key;
        }
        return null;
    }

    /** Restore the target, then the header or another mapped action if it disappeared. */
    restoreFocus(key) {
        if (key === null)
            return;
        let target = this._focusTargets.get(key);
        if (!target?.can_focus || (target !== this._toggle && !this._body.visible)) {
            target = this._toggle.can_focus ? this._toggle
                : [...this._focusTargets.values()].find(actor => actor.can_focus && actor.mapped);
        }
        target?.grab_key_focus();
    }

    update(view, {open}) {
        // The same card again: rebuilding the body would drop the keyboard focus for nothing.
        const key = JSON.stringify([view, open]);
        if (key === this._renderedKey)
            return;
        const focusedTarget = this.captureFocus();
        this._renderedKey = key;
        this.style_class = `gaq-card ${view.cssClass}`;
        this._name.text = view.name;
        this._plan.text = view.plan;

        this._pill.visible = view.pill !== null;
        if (view.pill) {
            this._pill.text = view.pill.text;
            this._pill.style_class = `gaq-pill ${view.pill.cssClass}`;
        }
        this._hero.text = view.heroText;
        this._heroSmall.text = view.heroSmall;

        const showBody = open || view.state === 'auth';
        this._body.visible = showBody;
        this._summaryMeter.visible = !showBody && view.state !== 'auth';
        this._summaryMeter.setValue(view.percent, {cssClass: view.cssClass});

        this._chevron.icon_name = open ? 'pan-up-symbolic' : 'pan-down-symbolic';
        // Hidden but not removed, so the title does not jump 22 px to the left.
        this._chevron.opacity = view.state === 'auth' ? 0 : 255;
        // A signed-out card has nothing to expand, so its header is inert.
        this._toggle.reactive = view.state !== 'auth';
        this._toggle.can_focus = view.state !== 'auth';
        const summary = view.state === 'auth'
            ? view.pill.text
            : [`${view.heroText}${view.heroSmall}`, view.state === 'error' ? view.pill.text : ''].filter(Boolean).join(', ');
        this._toggle.accessible_name = view.state === 'auth'
            ? `${view.name}, ${summary}`
            : fmt(open ? this._t.gettext('Collapse %s') : this._t.gettext('Expand %s'), `${view.name}, ${summary}`);

        // Only this card's body is rebuilt, never the popup menu itself.
        hideTooltip();
        this._focusTargets.clear();
        this._focusTargets.set('header', this._toggle);
        this._body.destroy_all_children();
        if (showBody)
            this._fillBody(view);
        this.restoreFocus(focusedTarget);
    }

    _fillBody(view) {
        if (view.money) {
            const money = view.money;
            const meter = new MeterBar();
            meter.setValue(money.percent, {cssClass: money.percent >= 95 ? 'gaq-critical' : money.percent >= 80 ? 'gaq-warning' : 'gaq-ok'});
            this._body.add_child(meter);
            const line = new St.BoxLayout({vertical: true, x_expand: true});
            line.add_child(wrap(label(money.spentLabel, 'gaq-muted')));
            line.add_child(wrap(label(money.spentText, 'gaq-strong')));
            line.add_child(wrap(label(money.ofText, 'gaq-muted')));
            this._body.add_child(line);
            this._body.add_child(wrap(label(money.note, 'gaq-detail')));
        } else {
            for (const group of view.groups) {
                if (group.title) {
                    const heading = new St.BoxLayout({style_class: 'gaq-pool', x_expand: true});
                    heading.add_child(label(group.title, 'gaq-strong'));
                    heading.add_child(spacer());
                    heading.add_child(label(`${group.topText}%`, 'gaq-strong'));
                    this._body.add_child(heading);
                }
                for (const row of group.rows)
                    this._body.add_child(this._buildRow(row));
            }
            if (view.paceText)
                this._body.add_child(label(view.paceText, 'gaq-pace'));
        }

        // Failure and status texts, then the one action that can help.
        if (view.message) {
            const message = label(view.message, view.state === 'auth' || view.state === 'error' ? 'gaq-message' : 'gaq-detail');
            wrap(message);
            this._body.add_child(message);
        }
        if (view.retryText)
            this._body.add_child(label(view.retryText, 'gaq-detail'));
        if (view.canConfigure) {
            const configure = new St.Button({
                label: view.configureText || this._t.gettext('Open Preferences'),
                style_class: 'gaq-button',
                can_focus: true,
                reactive: true,
                track_hover: true,
                x_align: Clutter.ActorAlign.START,
            });
            this._focusTargets.set('configure', configure);
            configure.connect('clicked', () => this._onConfigure());
            configure.connect('key-focus-in', () => this._onFocus(configure));
            this._body.add_child(configure);
        }
        if (view.canRetry) {
            const retry = new St.Button({
                label: this._t.gettext('Try again'),
                style_class: 'gaq-button',
                can_focus: true,
                reactive: true,
                track_hover: true,
                x_align: Clutter.ActorAlign.START,
            });
            this._focusTargets.set('retry', retry);
            retry.connect('clicked', () => this._onRetry());
            retry.connect('key-focus-in', () => this._onFocus(retry));
            this._body.add_child(retry);
        }
    }

    _buildRow(row) {
        // The whole row is the hover target, so the tooltip is easy to reach.
        const box = new St.BoxLayout({
            vertical: true,
            style_class: 'gaq-window',
            x_expand: true,
            reactive: row.paceTip !== null,
            track_hover: row.paceTip !== null,
            can_focus: row.paceTip !== null,
        });
        if (box.can_focus)
            this._focusTargets.set(`row:${row.id}`, box);
        const line = new St.BoxLayout({x_expand: true});
        line.add_child(label(row.label, 'gaq-muted'));
        line.add_child(spacer());
        line.add_child(label(`${row.mark}${row.valueText}`, `gaq-strong ${row.cssClass}`));
        box.add_child(line);

        const meter = new MeterBar({thin: true});
        meter.setValue(row.percent, {pace: row.pace, cssClass: row.cssClass});
        if (!row.noMeter)
            box.add_child(meter);

        const when = [row.resetText, row.absoluteText].filter(Boolean).join(' · ');
        if (when)
            box.add_child(label(when, 'gaq-detail'));
        if (row.paceTip) {
            attachTooltip(box, () => row.paceTip, () => meter.tick);
            box.accessible_name = `${row.poolTitle ? `${row.poolTitle}, ` : ''}${row.label}, ${row.valueText}, ${row.paceTip}`;
            box.connect('key-focus-in', () => this._onFocus(box));
        }
        return box;
    }
});
