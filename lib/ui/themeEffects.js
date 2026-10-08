// Decorative-only native popup layers. No provider, credential, clipboard or network dependency.
import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import GObject from 'gi://GObject';

import {textureInk, readingVeilOpacity} from '../core/theme.js';
import {opticalPreset, validateEffectProfile} from '../core/themeEffects.js';
import {createParticles, positionParticles} from './effects/leaves.js';
import {applyMaterial, glassHighlight} from './effects/glass.js';
import {attachFrost, removeFrost} from './effects/frost.js';
import {textureLayer} from './effects/textures.js';
import {readingVeil} from './effects/readingVeil.js';
import {opticalLayer} from './effects/optics.js';

const UPDATE_MS = 34; // Below 30 updates/s; time-based positions do not depend on callback cadence.
const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const FALLBACK_COLORS = {bg: '#36363a', surface: '#36363a', accent: '#78aeed', border: '#56565c', fg: '#ffffff', muted: '#b7b7bc', danger: '#ca8292', ok: '#86a874'};

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

// Native BinLayout measures every sibling's pending requests and allocates each once.
// The 2px backdrop and zero-request decorations never dominate foreground controls.
export const EffectsStack = GObject.registerClass(class GaqEffectsStack extends St.Widget {
    _init({background, decoration, foreground}) {
        super._init({layout_manager: new Clutter.BinLayout(), x_expand: true, clip_to_allocation: true});
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
});

export class ThemeEffects {
    constructor({backgroundActor, decorationActor, extensionPath, readingActors}) {
        this._background = backgroundActor;
        this._decoration = decorationActor;
        this._path = extensionPath;
        this._readingActors = typeof readingActors === 'function' ? readingActors().slice(0, 2) : [];
        this._destroyed = false;
        this._opened = false;
        this._state = null;
        this._source = 0;
        this._layoutSource = 0;
        this._generation = 0;
        this._updates = 0;
        this._callbackUsec = 0;
        this._particles = [];
        this._blur = null;
        this._ambient = null;
        this._readingVeil = null;
        this._readingVeilBounds = {};
        this._material = 'opaque';
        this._active = false;
        this._backgroundGone = false;
        this._decorationGone = false;
        this._handlers = [];
        for (const [actor, kind] of [[backgroundActor, 'background'], [decorationActor, 'decoration'],
            ...this._readingActors.map((actor, index) => [actor, `reading${index}`])]) {
            this._handlers.push([actor, actor.connect('notify::allocation', () => this._queueLayout()), kind]);
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
            decorationsEnabled: theme?.mode !== 'off',
            allowed: theme?.origin === 'builtin' && theme?.enabled !== false && !profile.problems.length,
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
        this._active = false;
        if (this._layoutSource) {
            GLib.source_remove(this._layoutSource);
            this._layoutSource = 0;
        }
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
        this._readingVeil = null;
        this._readingVeilBounds = {};
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
        // Material stays live when motion/decorations are Off. Keeping the same
        // background/foreground stack also keeps the popup inset unchanged.
        if (this._state.decorationsEnabled) {
            const optical = opticalPreset(this._state.themeId, this._material);
            if (optical && optical !== 'glass')
                this._ambient = opticalLayer(this._decoration, {preset: optical, colors});
            else if (optical === 'glass')
                glassHighlight(this._decoration, colors);
            textureLayer(this._decoration, {preset: profile.texture, ...textureInk(profile.texture, colors, scheme),
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
        }
        const veil = readingVeilOpacity(colors, this._material === 'opaque' ? 1 : profile.opacity[scheme],
            this._state.decorationsEnabled ? 1 : 0);
        if (veil > 0)
            this._readingVeil = readingVeil(this._decoration, {color: colors.bg, opacity: veil, radius});
        this._layout();
        // Rebuilding styles/children invalidates these zero-request layers even
        // when the cached popup viewport does not change. Reallocate that owned
        // viewport now; foreground measurement/allocation stays entirely native.
        for (const actor of [this._background, this._decoration]) {
            const box = actor.get_allocation_box();
            if (!actor.has_allocation() && [box.x1, box.x2, box.y1, box.y2].every(Number.isFinite) &&
                box.x2 > box.x1 && box.y2 > box.y1) {
                actor.get_preferred_width(-1);
                actor.get_preferred_height(-1);
                actor.allocate(box);
            }
        }
    }

    _queueLayout() {
        if (this._destroyed || !this._opened || !this._active || this._layoutSource)
            return;
        const generation = this._generation;
        // BinLayout is still allocating later siblings when this signal fires.
        // Changing decorative requests there invalidates the foreground inside
        // that same native allocation/paint pass. Resize outside the pass.
        this._layoutSource = GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
            this._layoutSource = 0;
            if (!this._destroyed && this._opened && generation === this._generation)
                this._layout();
            return GLib.SOURCE_REMOVE;
        });
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
        // Read foreground allocations before changing decorative size requests:
        // those requests invalidate the decorative allocation during this pass.
        const bounds = {...this._readingVeilBounds};
        if (this._readingVeil && this._readingActors.length && this._decoration.has_allocation()) {
            const [, originY] = this._decoration.get_transformed_position();
            const [, transformedHeight] = this._decoration.get_transformed_size();
            const scale = transformedHeight > 0 ? height / transformedHeight : 1;
            this._readingActors.forEach((actor, index) => {
                if (!actor.visible || !actor.has_allocation())
                    return;
                const [, y] = actor.get_transformed_position();
                const [, actorHeight] = actor.get_transformed_size();
                const edge = index === 0 ? (y + actorHeight - originY) * scale : (y - originY) * scale;
                if (Number.isFinite(edge))
                    bounds[index === 0 ? 'topEnd' : 'bottomStart'] = Math.round(Math.max(0, Math.min(height, edge)));
            });
        }
        this._readingVeilBounds = bounds;
        this._readingVeil?.setLayout({width, height, bounds});
        for (const actor of this._decoration.get_children()) {
            if (actor._isReadingVeil || this._particles.some(particle => particle.actor === actor))
                continue;
            // Compare requests, not allocated (pixel-rounded) sizes: setting an
            // unchanged fractional request from allocation notify queues layout again.
            const [, requestedWidth] = actor.get_preferred_width(-1);
            const [, requestedHeight] = actor.get_preferred_height(-1);
            if (Math.abs(requestedWidth - width) > 1 / 64 || Math.abs(requestedHeight - height) > 1 / 64)
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
            sources: (this._source ? 1 : 0) + (this._layoutSource ? 1 : 0), pendingLayoutSources: this._layoutSource ? 1 : 0,
            particles: this._particles.length, blurEffects: this._blur ? 1 : 0,
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
        this._readingActors = [];
        this._destroyed = true;
    }
}
