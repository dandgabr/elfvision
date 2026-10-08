# Restore defaults and nested configuration regression

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

The observed empty accounts were a data-source transition, not credential deletion: Restore reset demo to live, whose isolated keyring was empty. The nested helper also accepted `/dev/null` as readable input and copied it into an empty, invalid JSON configuration.

Changes: `data-source` moved from RESET_KEYS to KEPT_KEYS; confirmation, ADR0010 and README now explicitly preserve the data source. Existing accounts/tracking/terms preservation remains. The helper copies only readable regular files. No active nested helper/devkit process was present before that script edit. No real configuration or credentials were read.

TDD: restore regression failed with expected demo/actual live (2 pass, 1 fail), then all three restore tests passed. Isolated execution of the real config-copy block reproduced `/dev/null` copying before the fix; after it, `/dev/null` and missing paths copy nothing, while a private synthetic `{}` regular file copies with mode0600. No renderer or native preferences test was run.

Gettext extracted/merged/compiled; pt_BR placeholder check and whitespace checks pass. ESLint still reports the unrelated new tools/effects-cold-probe.js:19 console no-undef; owner was informed. Earlier full tools/check.sh similarly failed only this lint finding, with 370 unit tests and all six private cross-process/keyring gates green. Log: final-check.log.

New English string: “Appearance, theme, top bar, popup and notification settings go back to their defaults. Your accounts and data source are not changed, and providers you stopped tracking stay stopped.” Portuguese: “Aparência, tema, barra, popup e notificações voltam aos valores padrão. Suas contas e a fonte dos dados não são alteradas, e os provedores que você parou de acompanhar continuam parados.”
