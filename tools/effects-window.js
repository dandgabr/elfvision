// Synthetic detailed desktop window for private native-effect screenshots. No app or account data.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

const app = new Adw.Application({application_id: 'io.github.dandgabr.QuotaEffectsScene', flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    const drawing = new Gtk.DrawingArea({hexpand: true, vexpand: true});
    drawing.set_draw_func((_area, cr, width, height) => {
        const cell = 8;
        for (let y = 0; y < height; y += cell) {
            for (let x = 0; x < width; x += cell) {
                const pale = (x / cell + y / cell) % 2 === 0;
                cr.setSourceRGB(pale ? 0.96 : 0.08, pale ? 0.92 : 0.18, pale ? 0.68 : 0.62);
                cr.rectangle(x, y, cell, cell);
                cr.fill();
            }
        }
        cr.setSourceRGB(0.9, 0.25, 0.15);
        cr.rectangle(width / 2 - 18, 0, 36, height);
        cr.fill();
        cr.setSourceRGB(1, 1, 1);
        cr.selectFontFace('Sans', 0, 1);
        cr.setFontSize(24);
        cr.moveTo(30, height - 35);
        cr.showText('Synthetic desktop detail — outside the popup stays sharp');
    });
    const window = new Gtk.Window({application: app, title: 'Quota effects test scene',
        default_width: 1000, default_height: 700, decorated: false, child: drawing});
    window.present();
});
app.run([]);
