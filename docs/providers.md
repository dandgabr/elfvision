# Provider data and permissions

Verified against the linked official documentation on **2026-10-08**. No live
account credentials or authenticated billing requests were used for this research.
Subscription quotas, organization costs, key allowances and prepaid balances are
separate values; they are never combined or inferred from token counts.

## Subscription connectors

Command Code uses an API key. Codex, Claude and Antigravity use browser OAuth 2
with PKCE and public client configuration imported by the user-run helper. Their
quota integrations are unofficial; read the consent notices and the
[README access conditions](../README.md#provider-access-and-consent).

## API reporting connectors

| Connector | Credential | Fixed endpoint | Meaning |
|---|---|---|---|
| OpenAI API | Organization Admin API key, Bearer | `GET https://api.openai.com/v1/organization/costs` | UTC calendar-month organization costs in USD |
| OpenAI API, optional limit | Same | `GET https://api.openai.com/v1/organization/spend_limit` | Configured monthly threshold, returned in cents; not prepaid balance |
| Anthropic API | Organization Admin API key, `x-api-key` | `GET https://api.anthropic.com/v1/organizations/cost_report` | UTC calendar-month reported costs; decimal cent strings converted to USD |
| Cursor | Team Admin API key, HTTP Basic username with empty password | `POST https://api.cursor.com/teams/spend` | Aggregate team `overallSpendCents`, including included and additional usage; not just overage |
| OpenRouter | API key, Bearer | `GET https://openrouter.ai/api/v1/key` | Remaining allowance of this key; a reset period is shown only when provided |
| OpenRouter management key | Management API key, Bearer | `GET https://openrouter.ai/api/v1/credits` | Purchased account credits minus reported usage; management keys have broader privileges |

Organization administrative keys have broader permissions than ordinary inference
keys. OpenAI/Anthropic project inference keys cannot substitute for administrative
reporting credentials. Cursor personal-account quotas are not exposed by the
implemented team reporting endpoint. Cursor is polled no more than hourly. Its
POST is a read-only report query, never a generation or billing mutation.

OpenAI's optional limit endpoint can return 404 when no limit is available. Costs
then display without a limit. An unknown limit never creates a percentage, meter,
remaining balance, or quota threshold notification. Anthropic reporting can omit
cost categories such as Priority Tier; the card reports the available API data,
not a certified full invoice. OpenRouter unlimited keys show spending without a
fabricated cap; limited keys show allowance, not account balance.

Pages and response sizes are bounded. Incomplete or inconsistent pagination is
rejected rather than shown as a complete total. These totals and their time
windows remain separate for each connector, including multiple accounts from the
same provider. Cache records retain normalized display metrics, not raw responses
or member identities. Credentials remain in the desktop keyring.

Primary sources:

- [OpenAI organization costs](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs), [spending limit](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/spend_limit/methods/retrieve), [Admin API guide](https://developers.openai.com/api/docs/guides/admin-apis).
- [Anthropic usage and cost API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api), [Admin API](https://platform.claude.com/docs/en/manage-claude/admin-api).
- [Cursor Team Admin API](https://cursor.com/docs/account/teams/admin-api).
- [OpenRouter key information](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key), [credits](https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits), [limits](https://openrouter.ai/docs/api_reference/limits).

## Gemini API and Z.ai: explicit limitations

Both are excluded from this version at the user’s explicit request, pending
further investigation for future versions. No published quota/balance endpoint
accessible with an ordinary key was verified. This records the accepted scope
change from the original request; neither is offered in the provider selector.

Gemini's ordinary key authenticates inference, while Cloud quota and monitoring
require a separate Google OAuth/IAM/project integration. That flow is not
implemented here. Z.ai's documented inference API and Coding Plan subscription are
separate services. Undocumented quota endpoints, browser cookies and copied
subscription tokens are not used.

Sources: [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[Gemini billing](https://ai.google.dev/gemini-api/docs/billing),
[Google Cloud quota metrics](https://docs.cloud.google.com/service-usage/docs/reference/rest/v1beta1/services.consumerQuotaMetrics/list),
[Z.ai Coding Plan FAQ](https://docs.z.ai/devpack/faq),
[Z.ai documentation index](https://docs.z.ai/llms.txt).

## Demo and deletion

Demo has its own persistent connector registry, initially including Example
Credits. New reporting providers have synthetic fixtures; no provider requests,
browser authentication, or live keyring reads occur in Demo. Removing all demo
connectors leaves an empty list, including after restart. General's Restore
configuration preserves registries and credentials. Accounts' Delete all
connectors removes only the currently selected Live or Demo source.

Live deletion keeps durable safety fences until credentials, cached quota/alert
data and metadata have been removed successfully. The expanded provider registry
upgrades old deletion journals without dropping epochs, leases or blocks. An older
process with a smaller registry fails closed on expanded journal data; its leases
can require restart/boot recovery rather than silently becoming writable.
