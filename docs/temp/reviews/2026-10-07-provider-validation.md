# Provider validation and owner-assisted acceptance

Reviewed on 2026-10-07. Synthetic tests and public policy review are separate from successful authentication with a real account. The owner offered to participate; no real credential values have been inspected or copied by an agent.

## Current official policy evidence

- Claude: the [official authentication and credential-use section](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) limits subscription OAuth to native Anthropic applications and explicitly disallows third-party applications offering Claude.ai sign-in or collecting/storing session tokens. The existing experimental integration is unofficial; user acknowledgement does not grant provider permission. Its consent text now states this restriction directly.
- Antigravity: [additional terms, clause 6](https://antigravity.google/terms) explicitly prohibit third-party tools accessing the service and identify suspension or termination of Antigravity/Gemini CLI accounts as potential consequences. This review does not establish permission for the experimental OAuth integration.
- Codex: [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/) restrict automated extraction and circumvention of service limits. An open-source client's implementation does not establish authorization for this extension's unofficial quota endpoint. No approval from the provider is claimed.
- Command Code: [official Provider API documentation](https://commandcode.ai/docs/provider) documents API-key authentication for the supported service. Its [terms](https://commandcode.ai/terms), dated September 20, 2026 when reviewed, govern account/API use and changing credit/subscription conditions. Documentation of the Provider API alone does not certify the extension's quota endpoint or a real account round-trip.

No OAuth sign-in or remote revocation is automatically started by this validation. Synthetic tests remain the automated acceptance path; an unofficial provider's successful request cannot close its permission question.

## Owner-assisted checklist

Run `tools/nested-shell.sh prefs` from the reviewed worktree with an isolated runtime/keyring. To inspect visuals without an account, use `DATA_SOURCE=demo`. Never paste credentials into a terminal, bug report, screenshot or agent message. The helper's keyring is disposable, so closing the session removes the test credentials.

Record only provider ID, pass/fail, fixed error category and timestamps. Do not capture account display names, HTTP bodies or credential values.

| Check | Expected observation | Status |
|---|---|---|
| Complete keyboard traversal | Tab/Shift-Tab reach controls in visible order; Enter/Space activate; Cancel receives default dialog focus; Escape cancels; first Shell Escape hides the legend and second closes the popup | Awaiting owner's observation |
| Orca | Provider/action names, switches, progress and errors are announced; decorative layers are absent from navigation | Awaiting owner's observation |
| Motion/contrast | Disabling system animation immediately stops ambient motion; large text and RTL remain readable; opaque fallback works on light, dark and detailed wallpapers | Automated matrix plus owner observation |
| Supported account login | Owner confirms the appropriate notice and authenticates in the browser; only fixed connection status reaches the UI | Not performed with a real account |
| Refresh/rotation | A normal allowed refresh retains connection; restart continues from the refreshed stored pair | Synthetic coverage; real account not performed |
| Expiry/rejection/reconnection | A rejected session stops polling; reconnect is explicit and restores only that account | Synthetic coverage; real account not performed |
| Locked/unavailable keyring | Fixed unavailable/locked status; no automatic destructive deletion and no false absent-account claim | Synthetic/private keyring coverage; real account not performed |
| Disconnect consent and scope | Opening/Cancel/Escape deletes nothing; explicit confirmation deletes only this extension's credentials and live caches; partial denial reports failure and offers retry | Automated/private acceptance; owner observation pending |

The physical/human observations remain participation requirements until the owner records them. They cannot be marked passed because an automated harness ran successfully.
