# Secret Session Recovery Implementation Plan

**Goal:** Recover automatically from stale Secret Service sessions without restarting GNOME Shell or exposing credentials.

**Architecture:** Reproduce stale-session failure in an isolated D-Bus service, then apply the smallest bounded recovery. Preserve genuine locked and unavailable states and test concurrent calls. The existing uncommitted work in the main checkout is reference material and must not be overwritten.

**Constraints:** Never print secrets; never unlock or modify the user's vault during tests. Preserve existing user changes. Do not assert that the installed file is loaded into the current Shell.

## Steps

1. Verify PR #42 branch, existing changes, and installed-versus-loaded evidence. Compare the existing isolated session regression test to the branch implementation.
2. Run the regression against the unchanged branch and confirm that it fails for stale-session recovery. Add coverage for concurrent recovery and genuinely locked/unavailable service where feasible.
3. Implement bounded reconnection and accurate error classification; avoid global session resets on every screen unlock unless tests demonstrate necessity. Verify focused tests and the project test suite.
4. Review the diff, commit only scoped files, push the existing PR branch, and verify PR status.
5. Build and install the tested extension using the project's supported packaging method. Verify installed files and report separately whether the running Shell loaded them.
