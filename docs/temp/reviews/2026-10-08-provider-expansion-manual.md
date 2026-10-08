# Manual checks: provider expansion

Use a fresh isolated Demo session (`tools/nested-shell.sh prefs`) with a nonexistent
`LOCAL_CONFIG_FILE`, never `/dev/null` (which is invalid JSON). Native automated
checks use fictional accounts; production admin credentials are optional human
validation and are never required to reproduce layout or deletion.

1. Accounts: confirm Example Credits appears, rename/track/remove it, then delete
   all demo connectors. Cancel must do nothing; confirmation leaves no monetary
   ghost in the bar or popup. Restart or change the demo scenario: still empty.
2. General: change appearance, restore configuration, confirm default settings
   return while existing connectors remain. Accounts has deletion instead of a
   second appearance reset.
3. Add two connectors for the same provider. Renaming or removing one must preserve
   the other. Confirm API-key and OAuth 2 informational icons are understandable
   with keyboard navigation and Orca.
4. Add simulated OpenAI API, Anthropic API, Cursor and OpenRouter connectors.
   OpenAI shows month spend, Anthropic/Cursor spend without an invented limit or
   percent, and OpenRouter remaining key allowance. Gemini and Z.ai are absent.
5. Theme picker: check transparency/effects tooltips and names announced by Orca.
   Selection and checkmark must work as before; icons add no keyboard stop.
6. General → About: check Gnome AI Quota, Daniel G. Araujo and the GitHub link.
   Report a bug opens the public form; Report a vulnerability opens the private
   security form. Review without submitting. Customized GitHub forms become
   available after the changes are merged into the default branch.
7. Optional real-account validation: use a separate connector and the required
   organization/team Admin API key. Compare displayed period/amount with the
   provider report; never paste a key, callback URL or response into an issue.

Existing numeric jitter and materials/transparency were accepted by the user;
regress them briefly without changing theme styling. Physical monitor/GPU, actual
lock/suspend and human screen-reader observations remain distinct from private
automated compositor checks.
