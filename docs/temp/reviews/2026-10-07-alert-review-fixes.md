# Alert review fixes

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

P2 fixes: restart normalization preserves customized critical when optional warning invalid, disabling only warning without prior state; valid previous rule still wins live. v2 cached signatures require canonical critical1..100/warning1..99/boolean and valid order when enabled; missing/malformed/impossible signatures force quiet fresh baseline. UI sync computes initial/external invalid-pair error, while a rejected local edit retains an error after resync.

Regression RED34pass2fail, GREEN36core tests; entire alert subset59pass0fail (/tmp/gaq-alert-review-green.log). Isolated mutations reintroduced restartcriticaldefault and removed v2baseline guard; both killed, baseline36/0 (/tmp/gaq-alert-review-mutants-g9j_aonw/results.json). Targeted ESLint passes. Root service stop({flush:false}) retained. Store fixture preserves root gate:null and now awaits newly async save. Whole suite ran338pass3fail before fixture fix: two unrelated concurrent OAuth async-config tests and store save race; not claimed whole-green.

No rendering/productgraphics edits; native UI error visibility test pending a11y integration. Root owns final integration verification.

Persistence follow-up: validated last-valid rules now persist under root-added alert-valid-rules key (canonical four quota types, <=2048 bytes, exact booleans/integers/ranges/order). Service loads backup before reading raw settings, updates/saves immediately on changes without waiting for snapshots or debounce, and ignores its own backup signals. RED12/1 service test; GREEN62alert subset. Six-restart and atomic60/90→80/75 retention tested; two isolated mutations (drop startup backup/drop immediate update) killed with16-service-test baseline. Results /tmp/gaq-alert-backup-mutants-1qx_w8jl/results.json. Root integration/new tests continue concurrently; no whole-green claim here.
