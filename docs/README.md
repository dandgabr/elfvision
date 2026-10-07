# Documentation

Architecture decision records (ADRs) for gnome-ai-quota. Each record states the
context, the decision and its consequences. Records are numbered in the order the
decisions were made and are only superseded by a new record, never edited
silently.

| # | Decision |
|---|---|
| [0001](adr/0001-stack-and-repository-conventions.md) | Stack (GJS only) and repository conventions (English) |
| [0002](adr/0002-provider-modules-and-authentication.md) | Provider modules, own authentication, harness isolation |
| [0003](adr/0003-security-model.md) | Security model and terms-of-service risk |
| [0004](adr/0004-panel-bar.md) | Top-bar design (variation A) |
| [0005](adr/0005-popup.md) | Popup design and defaults |
| [0006](adr/0006-theming.md) | Theming: 20 themes, light and dark, tokens |
| [0007](adr/0007-internationalization.md) | Internationalization: English and pt-BR with gettext |
| [0008](adr/0008-mvp-roadmap.md) | MVP milestones and open items |

## Working on the code

See [`development.md`](development.md) for the layout, the tests, the headless shell
and the translation workflow.

## Design references

The interactive mockups that led to these decisions were published as private
artifacts and are not part of this repository. Their sources are reproducible
from the style gallery repository (`dandgabr/estilos-visuais`) with
[`tools/gen-themes.py`](../tools/gen-themes.py).
