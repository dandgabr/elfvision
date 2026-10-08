# Architecture decision records

Each record states the context, the decision and its consequences, and reads as the current decision.
When a decision changes, the record is rewritten and its status line says so. A decision that is
replaced gets a new record, and the old one is marked `superseded by NNNN` and kept.

| # | Decision | Status |
|---|---|---|
| [0001](0001-stack-and-repository-conventions.md) | GJS only, English everywhere, AGPL-3.0 | accepted |
| [0002](0002-provider-modules-and-authentication.md) | Provider modules, own authentication, data contract, scheduler and cache | accepted |
| [0003](0003-security-model.md) | Keyring storage, OAuth in preferences, terms-of-service risk | accepted |
| [0004](0004-panel-bar.md) | Top-bar items, states, selection and adaptive layout | accepted, partly implemented |
| [0005](0005-popup.md) | Popup structure, defaults and failure states | accepted, partly implemented |
| [0006](0006-theming.md) | 22 themes as data, light and dark, token compiler | accepted |
| [0007](0007-internationalization.md) | English and pt-BR with gettext, following the session language | accepted |
| [0008](0008-mvp-roadmap.md) | Milestones M0 to M4 and open items | accepted |
| [0009](0009-adding-providers.md) | How providers are added (M3) | accepted |
| [0010](0010-alerts-and-polish.md) | Alerts, notifications and polish (M4) | accepted |

The status column uses one of three values: `accepted`, `accepted, partly implemented` or
`superseded by NNNN`. What is not yet built is listed in the status line of the record itself.

## Writing a record

1. Number it with the next free `NNNN`, name the file `NNNN-short-topic.md` and add a row above.
2. Start with the title, then a `Status:` line, then these sections: **Context** (what forced the
   decision), **Decision** (what is decided, in the present tense) and **Consequences** or
   **Open points** (what follows, and what is pending).
3. Write it as the current decision. History belongs in the commit and pull request messages, and the
   milestones in [ADR 0008](0008-mvp-roadmap.md).
4. For a change to the interface or to security, hold a design review (UI, UX, frontend and security)
   before the code and record what it decided.
