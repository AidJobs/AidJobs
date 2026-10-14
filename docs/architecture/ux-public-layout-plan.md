# AidJobs — Public layout plan

**Status:** U0 isolation is established. U1 and U2 are committed and pushed on `ux/public-layout`. They are not merged into `main`. UX implementation is paused, not cancelled. U3 is a known colour defect and stays unapproved until the crawler work reaches a stable stopping point. This file is the UX scope. It is not a crawler gate and it does not amend `docs/architecture/crawler-completion-plan.md`. This file stays untracked until a commit of it is separately approved.
**Recorded:** 12 October 2026, from the crawler checkout at `1e196ba`. Progress amended 14 October 2026.

A later session follows this file. It does not rely on a previous chat. If this file and the repository disagree about git state, re-check git and stop before editing.

## How to use this plan

1. Re-check the crawler checkout. Do not switch its branch. Do not commit, reset, stash, clean, or stage anything there.
2. Do the UX work only in the worktree named below.
3. One phase at a time. Stop at each approval gate.
4. A layout finding is not permission to change search requests, tokens, or the crawler. A crawler gate is not permission to change these screens.
5. U1 and U2 are finished. Do not reopen them. Do not start U3, merge this branch into `main`, or rebase it onto crawler `main` unless that step is separately approved.

## Worktrees

| Checkout | Path | Branch | Role |
| --- | --- | --- | --- |
| Crawler | `C:/Users/DELL/Documents/AidJobs App/AidJobsGit` | `main` | Leave it. Crawler repairs stay here. |
| UX | `C:/Users/DELL/Documents/AidJobs App/AidJobsGit-ux` | `ux/public-layout` | The only place this plan is edited or implemented. |

`ux/public-layout` was created from `1e196bac018abaefcb02b61af0d5a2d0245ffb23`. Do not create a second UX branch. Do not check `ux/public-layout` out in the crawler checkout.

## Git snapshot to re-check

Recorded when this worktree was created. Treat it as a fact to verify, not as a permanent base if `main` has moved.

- Crawler branch: `main`, then ahead of `origin/main`. The count was 13 local commits at recording, including the commits below. Re-count before relying on it.
- Crawler HEAD at recording: `1e196bac018abaefcb02b61af0d5a2d0245ffb23`, message `docs: record the B3 identity reading and the narrowed C3 contract`.
- That HEAD differs from `56d863a` by one docs commit, `docs/architecture/crawler-completion-plan.md` only. No frontend files.
- C1 is committed and clean: `cd6d63c`, message `fix: decode outbound responses up to the existing size cap`. Files: `apps/backend/contracts/outbound.py`, `apps/backend/requirements.txt`, `apps/backend/tests/test_outbound_fetch.py`. There is no uncommitted C1 diff.
- Unstaged in the crawler checkout only, and only Pyright ignore comments: `apps/backend/scripts/diagnose_enrichment_bias.py`, `tests/test_link_heuristics.py`. They are not in this worktree. Do not stage, commit, revert, or edit them from either checkout.
- Existing stash, left untouched: `stash@{0}` on `fix/integrate-storage-proper-20250105-190000`. Do not apply or drop it.

If crawler HEAD has moved, read the new commits. If they change frontend files or the two dirty files, stop and report. If they are crawler or docs commits only, keep the UX branch based on the commit already checked out here. Do not rebase or reset this branch onto the new `main` unless that rebase is separately approved.

On 14 October 2026 the crawler checkout was re-checked and left untouched. Its `main` was `69b7db0`, four commits after `1e196ba`: docs commits, `99f4d2a` (`admission.py`, `test_link_admission.py`), and `69b7db0` (`detail_reader.py`, `test_detail_reader.py`, `.github/workflows/ci.yml`). No frontend files. It was ahead 17 and behind 3 relative to `origin/main`. `diagnose_enrichment_bias.py` and `test_link_heuristics.py` were still dirty. Re-check again before relying on this paragraph.

## Product limit

AidJobs V1 is admin-curated job discovery. The public product helps people find jobs and open the employer’s application URL. This plan repairs the public finder so the navigation and the content width agree. It does not reskin the product, add search features, or consolidate admin.

The migration contract still applies. Rule 15 forbids a public rewrite without a product reason. The product reason for U1 is the fixed rail: expanded, collapsed, and narrow widths do not agree. A palette change is not that reason.

## U1 — Responsive layout only

Done. Commit `34a64cc`, message `fix(frontend): make public layout responsive`, pushed to `origin/ux/public-layout`. The record below is what that commit was allowed to change. Do not repeat it.

### Files

- `apps/frontend/components/CollectionsNav.tsx`
- `apps/frontend/app/saved/page.tsx`
- `apps/frontend/app/collections/[slug]/CollectionClient.tsx`
- `apps/frontend/app/HomeClient.tsx`, wrapper and offset only
- `apps/frontend/app/page.tsx`, the Suspense fallback offset only
- `apps/frontend/app/collections/[slug]/page.tsx`, the Suspense fallback offset only

No other files. The two `page.tsx` fallbacks are in scope because they hardcode `pl-56` while the rail is not mounted.

### Behaviour

From the `md` breakpoint up:

- Expanded rail: a normal `w-56` column beside the content, in the page flow.
- Collapsed rail: out of the flow. Only the existing menu button remains. The content has no leftover inset.

Below `md`:

- The rail overlays. It does not reserve a desktop inset.
- The first paint starts collapsed, so a 224px drawer does not cover the list. That state stays inside `CollectionsNav`.

`HomeClient.tsx` cannot do this by changing only the `pl-56` class. Collapse state is private to `CollectionsNav`, and the rail is `fixed`, so a responsive padding class still leaves the desktop collapsed inset wrong. The allowed edit in `HomeClient.tsx` is the wrapper around `CollectionsNav` and `<main>`, and removal of `pl-56`. The same pattern applies to `ml-56` in `saved/page.tsx` and `pl-56` in `CollectionClient.tsx`. The search function in `HomeClient.tsx` stays untouched.

Preserve routes, query parameters, search behaviour, filters, sorting, saved-job actions, job data, and employer application URLs. Do not change “Loading jobs...” or other empty-state copy. Do not change colours, tokens, or component APIs beyond what the layout requires.

### Forbidden in U1 and in every later phase unless this plan is amended

- `apps/backend`, `contracts`, crawler modules, identity, fetch, persistence, and search projection
- Admin pages, Sources, crawl controls, reindex, and delete actions
- API route behaviour
- Palette migration, token correction, a component library, or a public reskin
- Further search-request changes, a second request path, enrichment filters, empty-state copy, and error-handling changes. The completed U2 commit is the exception already made.
- The two dirty Pyright files and `stash@{0}`
- Any edit in the crawler checkout

### After the edit

Run the relevant frontend tests and the frontend build from this worktree. Check expanded, collapsed, desktop, and narrow widths on All Jobs, a collection, and Saved, including the Suspense fallbacks. Report the exact diff, the file list, what was tested, and what was not. Those checks were completed before the U1 commit.

## U2 — Search behaviour

Done. Commit `6b63e5b`, message `fix(frontend): simplify home search behaviour`, pushed to `origin/ux/public-layout`. Not merged into `main`.

Accepted scope:

- Home search has one request path. Trinity is removed from the home page. `TrinitySearchBar.tsx` remains in the tree.
- The text field updates the committed query after 250ms, or immediately on submit. Unmount clears a pending timer.
- Country, level, international eligibility, mission tags, and sort stay. Enrichment parameters are not sent.
- A failed follow-up keeps the jobs and the total already shown. A stale response does not replace them.
- The collection change is only the unfiltered finished-empty string, from “Loading jobs...” to “No jobs found”.
- Tests are in `apps/frontend/app/__tests__/home-search-states.test.tsx`. The frontend suite was 46 passing, and the production build passed.
- The address is still read on first load. Search does not write it back.
- `/api/search/query` returned 404 without a backend. That live check remains the gate before merge. It is not a reason to change these screens, and it must not be done from the dirty crawler checkout.

Do not add URL synchronisation, navigation work, or another search change under this phase.

## Checkpoint — 14 October 2026

UX implementation is paused. The branch stays at `6b63e5b` until the crawler checkout reaches a stable stopping point. Do not merge. Do not rebase. Do not add features or polish. Do not investigate admin-session behaviour in the crawler checkout, and do not edit its uncommitted files.

When that stopping point is reached, re-check both worktrees, then resume only in this order:

1. The one-file token correction below, after a fresh approval.
2. Check the All Jobs heading, the body background, and the pending admin screen. Run the frontend tests and the production build.
3. Verify `/api/search/query` against a functioning backend. A colour fix does not satisfy this gate.
4. Review the branch and decide whether it is ready to merge.

## U3 — Design tokens

Known defect. Implementation is not approved.

`apps/frontend/app/globals.css` stores RGB channels. `--bg` is `255 255 255` (white). `--fg` is `29 29 31` (`#1D1D1F`). `apps/frontend/tailwind.config.js` reads them with `hsl(var(--…))`. On 14 October 2026, in the UX dev server, `body` computed to background `rgb(255, 255, 0)` and text `rgb(102, 78, 56)`. The All Jobs heading has no colour class, so it inherits that brown. A probe of `rgb(var(--fg))` computed to `rgb(29, 29, 31)`, and `rgb(var(--bg))` computed to white.

The later correction, once approved, is only in `apps/frontend/tailwind.config.js`: replace those `hsl(var(--…))` expressions with `rgb(var(--…))`. Do not change `globals.css`, page components, or navigation. The public app does not load `packages/ui/tokens/tailwind-theme.css`.

These are related observations, not the same defect:

- The admin “Checking session” screen in `AdminLayoutClient` has no background class, so the yellow body background can show through. Its text is `text-[#86868B]`. The screen stays up until `/api/admin/session` settles. On the UX branch that route has no timeout. A refused connection redirects to login. A screen that remains there means the request did not settle. That wait was not reproduced, and it is not caused by the colour token. The crawler checkout has its own uncommitted admin-session edits. Leave them alone.
- Other browser tabs turning yellow is not explained by this CSS. The UX frontend has no service worker and no `theme-color`. Do not attribute that report to the token defect without new evidence.
- `/api/search/query` returned 404 without a backend. That remains the merge gate.

## Still outside this plan

Sources redesign, organisation editing, admin consolidation, enrichment, taxonomy, analytics, and Find & Earn removal. They belong to the migration contract’s later gates, not to this worktree. Admin-session delay is outside this pause as well.

## Stop

Stop before editing if this worktree is missing, if `ux/public-layout` is checked out in the crawler directory, if the two dirty files appear in this worktree, or if a proposed diff touches a forbidden path.
