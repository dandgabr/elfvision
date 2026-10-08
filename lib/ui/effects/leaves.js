// Eight reused leaf sprites; one packaged icon is cached by St.TextureCache.
import Atk from 'gi://Atk';
import Gio from 'gi://Gio';
import St from 'gi://St';

export function createParticles(actor, {extensionPath, count, kind}) {
    const icon = Gio.FileIcon.new(Gio.File.new_for_path(`${extensionPath}/icons/theme-effects/leaves.svg`));
    return Array.from({length: count}, (_, i) => {
        const size = kind === 'leaves' ? 14 + i % 3 * 4 : 3 + i % 2;
        const sprite = kind === 'leaves'
            ? new St.Icon({gicon: icon, icon_size: 18, reactive: false, can_focus: false})
            : new St.Widget({reactive: false, can_focus: false, style: 'background-color: rgba(197, 213, 232, 0.6); border-radius: 99px;'});
        sprite.set_size(kind === 'leaves' ? 18 : size, kind === 'leaves' ? 18 : size);
        if (kind === 'leaves') {
            sprite.scale_x = size / 18;
            sprite.scale_y = size / 18;
        }
        sprite.set_pivot_point(0.5, 0.5);
        sprite.opacity = kind === 'leaves' ? 140 : 100;
        sprite.accessible_role = Atk.Role.REDUNDANT_OBJECT;
        actor.add_child(sprite);
        return {actor: sprite, size, phase: i / count, speed: 12 + i % 4 * 3};
    });
}

export function positionParticles(particles, actor, elapsed) {
    const box = actor.get_allocation_box();
    const width = box.x2 - box.x1;
    const height = box.y2 - box.y1;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        return;
    particles.forEach((particle, i) => {
        const maxX = Math.max(0, width - particle.size);
        const maxY = Math.max(0, height - particle.size);
        const drift = Math.sin(elapsed * 0.35 + i * 1.7) * Math.min(4, maxX * 0.01);
        // Two exposed gutters keep sprites visible behind, rather than above, reading zones.
        const lane = i % 2 ? maxX : 0;
        const x = Math.max(0, Math.min(maxX, lane + drift));
        const y = maxY ? (particle.phase * maxY + elapsed * particle.speed) % maxY : 0;
        particle.actor.translation_x = x;
        particle.actor.translation_y = y;
        // Rotate only decorative sprites; values and hit geometry stay stationary.
        particle.actor.rotation_angle_z = Math.sin(elapsed * 0.24 + i) * 18;
    });
}

