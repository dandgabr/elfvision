// Pango implements tabular figures; unsupported CSS font-feature declarations are not used.
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

export function tabularNumbers(label) {
    let destroyed = false;
    label._tabularNumbersSource = 0;
    const apply = () => {
        if (destroyed)
            return;
        const current = label.clutter_text.get_attributes();
        const features = current?.get_iterator().get(Pango.AttrType.FONT_FEATURES)
            ?.as_font_features().features ?? '';
        if (/(?:^|[,\s])tnum\s*=\s*1(?:$|[,\s])/.test(features))
            return;
        // Preserve the foreground and any other attributes supplied by St.
        const attrs = current?.copy() ?? new Pango.AttrList();
        attrs.change(Pango.attr_font_features_new(features ? `${features},tnum=1` : 'tnum=1'));
        label.clutter_text.set_attributes(attrs);
    };
    const schedule = () => {
        if (destroyed || label._tabularNumbersSource)
            return;
        // St can ensure style lazily while painting. Changing Pango attributes
        // there invalidates its text allocation inside that same paint pass.
        // Apply before the next native layout instead, coalescing style/text edits.
        label._tabularNumbersSource = GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
            label._tabularNumbersSource = 0;
            apply();
            return GLib.SOURCE_REMOVE;
        });
    };
    label.connect_after('style-changed', schedule);
    label.clutter_text.connectObject('notify::text', schedule, label);
    label.connect('destroy', () => {
        destroyed = true;
        if (label._tabularNumbersSource) {
            GLib.source_remove(label._tabularNumbersSource);
            label._tabularNumbersSource = 0;
        }
    });
    schedule();
    return label;
}
