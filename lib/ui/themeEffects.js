// Decorative-only native popup layers. No provider, credential, clipboard or network dependency.
import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import GObject from 'gi://GObject';

import {validateEffectProfile} from '../core/themeEffects.js';
import {createParticles, positionParticles} from './effects/leaves.js';
import {applyMaterial, glassHighlight} from './effects/glass.js';
import {attachFrost, removeFrost} from './effects/frost.js';
import {textureLayer} from './effects/textures.js';
import {opticalLayer} from './effects/optics.js';

const UPDATE_MS = 34; // Below 30 updates/s; time-based positions do not depend on callback cadence.
const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const FALLBACK_COLORS = {bg: '#36363a', surface: '#36363a', accent: '#78aeed', border: '#56565c', fg: '#ffffff', danger: '#ca8292', ok: '#86a874'};

// Decorations must not contribute their child positions or texture size to popup measurement.
export const EffectsLayer = GObject.registerClass(class GaqEffectsLayer extends Clutter.Actor {
    _init() {
        super._init({layout_manager: new Clutter.FixedLayout(), reactive: false, x_expand: true, y_expand: true, clip_to_allocation: true,
            x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL});
        this.get_accessible()?.set_role(Atk.Role.REDUNDANT_OBJECT);
    }
    vfunc_get_preferred_width(_height) { return [0, 0]; }
    vfunc_get_preferred_height(_width) { return [0, 0]; }
});

// Only foreground controls determine popup measurement. Both decorative siblings receive
// that exact allocation even when their natural request is zero or the stage is nested.
export const EffectsStack = GObject.registerClass(class GaqEffectsStack extends St.Widget {
    _init({background, decoration, foreground}) {
        super._init({x_expand: true, clip_to_allocation: true});
        this._background = background;
        this._decoration = decoration;
        this._foreground = foreground;
        for (const actor of [background, decoration, foreground])
            this.add_child(actor);
        this.connect('destroy', () => {
            this._background = null;
            this._decoration = null;
            this._foreground = null;
        });
    }

    vfunc_get_preferred_width(height) {
        return this._foreground?.get_preferred_width(height) ?? [0, 0];
    }

    vfunc_get_preferred_height(width) {
        return this._foreground?.get_preferred_height(width) ?? [0, 0];
    }

    vfunc_allocate(box) {
        if (!this._foreground || ![box.x1, box.x2, box.y1, box.y2].every(Number.isFinite))
            return;
        this.set_allocation(box);
        const viewport = new Clutter.ActorBox();
        viewport.x1 = 0;
        viewport.y1 = 0;
        viewport.x2 = box.x2 - box.x1;
        viewport.y2 = box.y2 - box.y1;
        this._background.allocate(viewport);
        this._decoration.allocate(viewport);
        this._foreground.allocate(viewport);
    }
});

export class ThemeEffects {
    constructor({backgroundActor, decorationActor, extensionPath}) {
        this._background = backgroundActor;
        this._decoration = decorationActor;
        this._path = extensionPath;
        this._destroyed = false;
        this._opened = false;
        this._state = null;
        this._source = 0;
        this._generation = 0;
        this._updates = 0;
        this._callbackUsec = 0;
        this._particles = [];
        this._blur = null;
        this._ambient = null;
        this._material = 'opaque';
        this._active = false;
        this._backgroundGone = false;
        this._decorationGone = false;
        this._handlers = [];
        for (const [actor, kind] of [[backgroundActor, 'background'], [decorationActor, 'decoration']]) {
            this._handlers.push([actor, actor.connect('notify::allocation', () => this._layout()), kind]);
            this._handlers.push([actor, actor.connect('destroy', () => {
                this[`_${kind}Gone`] = true;
                this.destroy();
            }), kind]);
        }
        backgroundActor.accessible_role = Atk.Role.REDUNDANT_OBJECT;
        backgroundActor.reactive = false;
        decorationActor.reactive = false;
        backgroundActor.clip_to_allocation = true;
        decorationActor.clip_to_allocation = true;
        backgroundActor.hide();
    }

    /** Replacing a theme destroys the old layer before allocating the replacement. */
    apply({policy, theme, scheme}) {
        if (this._destroyed)
            return;
        const profile = validateEffectProfile(theme?.profile ?? theme?.effects);
        const colors = Object.fromEntries(Object.entries(FALLBACK_COLORS)
            .map(([key, fallback]) => [key, COLOR.test(theme?.colors?.[key]) ? theme.colors[key] : fallback]));
        this._state = {
            themeId: theme?.themeId, policy, profile: profile.profile, colors, scheme: scheme === 'light' ? 'light' : 'dark',
            radius: Number.isFinite(theme?.radius?.card) ? Math.max(0, Math.min(40, theme.radius.card)) : 14,
            allowed: theme?.origin === 'builtin' && theme?.mode !== 'off' && theme?.enabled !== false && !profile.problems.length,
        };
        this._rebuild();
    }

    setOpen(open) {
        if (this._destroyed || this._opened === Boolean(open))
            return;
        this._opened = Boolean(open);
        this._rebuild();
    }

    _clear() {
        this._generation++;
        if (this._source) {
            GLib.source_remove(this._source);
            this._source = 0;
        }
        if (!this._backgroundGone) {
            this._background.remove_all_transitions();
            removeFrost(this._background);
            this._background.hide();
            this._background.set_style(null);
        }
        if (!this._decorationGone) {
            this._decoration.remove_all_transitions();
            this._decoration.destroy_all_children();
            this._decoration.translation_y = 0;
            this._decoration.opacity = 255;
        }
        this._blur = null;
        this._particles = [];
        this._ambient = null;
        this._active = false;
        this._material = 'opaque';
    }

    _rebuild() {
        this._clear();
        if (!this._opened || !this._state?.allowed)
            return;
        const {policy, colors, profile, scheme, radius} = this._state;
        const requested = ['translucent', 'decorative-glass', 'frosted-glass'].includes(policy?.material) ? policy.material : 'opaque';
        this._material = requested;
        if (requested === 'frosted-glass') {
            this._blur = attachFrost(this._background);
            if (!this._blur)
                this._material = 'decorative-glass';
        }
        const glass = ['decorative-glass', 'frosted-glass'].includes(this._material);
        applyMaterial(this._background, {colors, opacity: this._material === 'opaque' ? 1 : profile.opacity[scheme], radius, glass});
        this._background.show();
        this._active = true;
        const optical = this._state.themeId === 'holographic-foil-iridescent' ? 'pearlescent'
            : this._state.themeId === 'aurora-mesh-gradient' ? 'mesh' : null;
        if (optical)
            this._ambient = opticalLayer(this._decoration, {preset: optical, colors});
        else if (glass)
            glassHighlight(this._decoration, colors);
        textureLayer(this._decoration, {preset: profile.texture, color: colors.accent,
            geometry: this._state.themeId === 'isometric' ? 'diamond' : 'orthogonal'});
        if (policy?.motion === 'ambient') {
            if (['leaves', 'motes'].includes(profile.motion)) {
                const count = Math.min(profile.particleCount, Number.isSafeInteger(policy.particleCount) ? Math.max(0, policy.particleCount) : 0);
                this._particles = createParticles(this._decoration, {extensionPath: this._path, count, kind: profile.motion});
            } else if (!this._ambient && ['gradient', 'pulse'].includes(profile.motion)) {
                this._ambient = opticalLayer(this._decoration, {preset: 'linear', colors});
            }
            if (this._particles.length || this._ambient)
                this._startUpdates();
        } else if (policy?.motion === 'interaction') {
            // Animate decoration only. Text, controls and their hit geometry stay fixed.
            this._decoration.translation_y = 2;
            this._decoration.ease({translation_y: 0, duration: 120});
        }
        this._layout();
    }

    _layout() {
        if (this._destroyed || !this._active)
            return;
        // During a theme rebuild .width/.height can report the zero natural request
        // before the next allocation. Use the already allocated sibling box, including
        // when the parent allocation stays unchanged and emits no new notification.
        const allocation = this._background.get_allocation_box();
        const width = allocation.x2 - allocation.x1;
        const height = allocation.y2 - allocation.y1;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
            return;
        for (const actor of this._decoration.get_children()) {
            if (!this._particles.some(particle => particle.actor === actor))
                actor.set_size(width, height);
        }
        positionParticles(this._particles, this._decoration, 0);
    }

    _startUpdates() {
        const generation = this._generation;
        const start = GLib.get_monotonic_time();
        this._source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UPDATE_MS, () => {
            if (this._destroyed || !this._opened || generation !== this._generation) {
                this._source = 0;
                return GLib.SOURCE_REMOVE;
            }
            const before = GLib.get_monotonic_time();
            const elapsed = (before - start) / 1000000;
            positionParticles(this._particles, this._decoration, elapsed);
            if (this._ambient) {
                // Slow and low amplitude; no flash, state-color pulse or per-frame texture/CSS rebuild.
                this._ambient.opacity = Math.round(195 + Math.sin(elapsed * 0.2) * 20);
                if (this._state.profile.motion === 'gradient')
                    this._ambient.translation_x = Math.sin(elapsed * 0.12) * 6;
            }
            this._updates++;
            this._callbackUsec += GLib.get_monotonic_time() - before;
            return GLib.SOURCE_CONTINUE;
        });
    }

    inspect() {
        return {destroyed: this._destroyed, open: this._opened, active: this._active,
            sources: this._source ? 1 : 0, particles: this._particles.length, blurEffects: this._blur ? 1 : 0,
            actors: this._destroyed ? 0 : this._decoration.get_n_children(), material: this._material,
            updates: this._updates, callbackUsec: this._callbackUsec, generation: this._generation};
    }

    destroy() {
        if (this._destroyed)
            return;
        this._opened = false;
        this._clear();
        for (const [actor, id, kind] of this._handlers) {
            if (!this[`_${kind}Gone`])
                actor.disconnect(id);
        }
        this._handlers = [];
        this._state = null;
        this._destroyed = true;
    }
}
