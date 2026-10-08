# Independent font review

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

Read-only inputs: lib/core/fontManifest.js, lib/core/fontInstall.js, lib/services/fontInstaller.js, lib/prefs/suggestedFonts.js, prefs integration and relevant fontInstaller tests. No duplicate native/network tests during GPU diagnostics.

Spec and quality/security verdict: APPROVED current shipped path; no Critical/Important finding.

1. Consent is separate, Cancel default/close response; construction/theme choice never starts network or installation. Font/hash/size/revision/license/source details wrap with WORD_CHAR and scroll vertically. Controller generation guards close/cancel and late view updates. Immediately-before-rename check and synchronous same-filesystem no-overwrite commit prevent late publication after cancellation. Committed status is published before refresh; postcommit cancel preserves installed truth and terminates bounded child.
2. Transport uses fixed exact reviewed HTTPS addresses, explicit NO_REDIRECT, maximum3 validated redirects, expected Content-Length if supplied, counted decoded stream bytes, per-file/action bounds, exact SHA256 and TTF/OTF header. Filenames/IDs cannot come from theme JSON. Local licenses have exact hashes and nofollow regular-file/size checks. Private staging is cleaned and batch publication is atomic; existing conflicts/incomplete files and leaf symlinks reject rather than repair/overwrite.
3. Nonblocking API robustness: if injected committed callback or custom refresh rejects after atomic rename, install catch can report failure/cancelled despite an installed batch. Production changed callback and default refresh are guarded/catch failures and existing postcommit destroy test returns installed; future service callers should preserve committed truth even on callback failure. This is not a current product runtime blocker.
4. Boundary limitation: nofollow checks protect app-owned directory/batch leaves, not every ancestor or same-user filesystem replacement race. Existing user font parents are intentionally not chmod'ed. This is not theme-controlled input; stricter ancestor confinement needs a documented policy for legitimate user XDG/font symlinks rather than an inferred prohibition.

Review does not certify font raster safety, human accessibility or live downloads beyond author exact-revision evidence. No product edits or commits.

Final coordinator follow-up: item3 was subsequently corrected. The service sets
`published` before invoking the committed callback and returns installed with
restart guidance for any post-publication callback/refresh failure. The added
regression is included in the final font and whole-suite gates. The font
implementation review records its RED→GREEN evidence; this note distinguishes
the original independent snapshot from the final corrected source.
