// Pango implements tabular figures; unsupported CSS font-feature declarations are not used.
import Pango from 'gi://Pango';

export function tabularNumbers(label) {
    const apply = () => {
        // St replaces attributes when it applies theme foreground/style. Preserve those attributes,
        // then add the numeric feature after that update rather than losing it on first mapping.
        const attrs = label.clutter_text.get_attributes()?.copy() ?? new Pango.AttrList();
        attrs.change(Pango.attr_font_features_new('tnum=1'));
        label.clutter_text.set_attributes(attrs);
    };
    label.connect_after('style-changed', apply);
    label.clutter_text.connectObject('notify::text', apply, label);
    apply();
    return label;
}
