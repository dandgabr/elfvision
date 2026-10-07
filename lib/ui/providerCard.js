// One provider card in the popup. The card owns its widgets and repaints them
// from a cardView() result; the menu is never rebuilt, so it stays open while
// a refresh runs.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {MeterBar} from './meter.js';
import {attachTooltip, hideTooltip} from './tooltip.js';

function label(text, styleClass, extra = {}) {
    return new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER, ...extra});
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
     * @param {Function} options.onToggle - called when the chevron is activated
     */
    _init({iconPath, t, onToggle}) {
        super._init({vertical: true, style_class: 'gaq-card', x_expand: true});
        this._t = t;

        this._chevron = new St.Button({
            style_class: 'gaq-chevron',
            can_focus: true,
            reactive: true,
            track_hover: true,
            child: new St.Icon({style_class: 'gaq-chevron-icon', icon_name: 'pan-down-symbolic'}),
        });
        this._chevron.connect('clicked', () => onToggle());

        this._name = label('', 'gaq-card-name');
        this._plan = label('', 'gaq-card-plan');
        this._pill = label('', 'gaq-pill');
        this._hero = label('', 'gaq-hero');
        this._heroSmall = label('', 'gaq-hero-small', {y_align: Clutter.ActorAlign.END});

        // Name over plan keeps the left side narrow, so a wide hero value
        // (a money balance) never forces the name to be ellipsized.
        const title = new St.BoxLayout({vertical: true, y_align: Clutter.ActorAlign.CENTER});
        title.add_child(this._name);
        title.add_child(this._plan);

        const hero = new St.BoxLayout({style_class: 'gaq-hero-box', y_align: Clutter.ActorAlign.CENTER});
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
        header.add_child(hero);
        this.add_child(header);

        this._summaryMeter = new MeterBar();
        this.add_child(this._summaryMeter);

        this._body = new St.BoxLayout({vertical: true, style_class: 'gaq-card-body', x_expand: true});
        this.add_child(this._body);
    }

    /**
     * @param {object} view - a cardView() result
     * @param {{open: boolean}} options
     */
    update(view, {open}) {
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

        this._chevron.child.icon_name = open ? 'pan-up-symbolic' : 'pan-down-symbolic';
        this._chevron.accessible_name = open ? this._t.gettext('Collapse') : this._t.gettext('Expand');
        this._chevron.visible = view.state !== 'auth';

        // Only this card's body is rebuilt, never the popup menu itself.
        hideTooltip();
        this._body.destroy_all_children();
        if (showBody)
            this._fillBody(view);
    }

    _fillBody(view) {
        if (view.money) {
            const money = view.money;
            const meter = new MeterBar();
            meter.setValue(money.percent, {cssClass: money.percent >= 95 ? 'gaq-critical' : money.percent >= 80 ? 'gaq-warning' : 'gaq-ok'});
            this._body.add_child(meter);
            const line = new St.BoxLayout({x_expand: true});
            line.add_child(label(money.spentLabel, 'gaq-muted'));
            line.add_child(spacer());
            line.add_child(label(money.spentText, 'gaq-strong'));
            line.add_child(label(` ${money.ofText}`, 'gaq-muted'));
            this._body.add_child(line);
            this._body.add_child(label(money.note, 'gaq-detail'));
            return;
        }

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
        if (view.message) {
            const message = label(view.message, 'gaq-detail');
            message.clutter_text.line_wrap = true;
            this._body.add_child(message);
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
        });
        const line = new St.BoxLayout({x_expand: true});
        line.add_child(label(row.label, 'gaq-muted'));
        line.add_child(spacer());
        line.add_child(label(`${row.mark}${row.percentText}%`, `gaq-strong ${row.cssClass}`));
        box.add_child(line);

        const meter = new MeterBar({thin: true});
        meter.setValue(row.percent, {pace: row.pace, cssClass: row.cssClass});
        box.add_child(meter);

        box.add_child(label(`${row.resetText} · ${row.absoluteText}`, 'gaq-detail'));
        if (row.paceTip)
            attachTooltip(box, () => row.paceTip, () => meter.tick);
        return box;
    }
});
