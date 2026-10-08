// Keep tabular figures separate from the attributes St replaces on style changes.
import GLib from 'gi://GLib';

export function tabularNumbers(label) {
    let applying = false;
    const apply = () => {
        if (applying)
            return;
        applying = true;
        try {
            // Clutter keeps markup attributes independently and merges them with
            // St's foreground attributes when it builds the effective layout.
            // Escaping preserves the label's literal plain-text API.
            const text = GLib.markup_escape_text(label.get_text(), -1);
            label.clutter_text.set_markup(`<span font_features="tnum=1">${text}</span>`);
        } finally {
            applying = false;
        }
    };
    // St.Label installs plain text (clearing markup) before this notification.
    // Restoring the span synchronously keeps updates independent of idle timing.
    label.connectObject('notify::text', apply, label);
    apply();
    return label;
}
