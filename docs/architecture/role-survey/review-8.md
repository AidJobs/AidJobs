# W-54: third re-review (the counting resolver and refinements), 12 November 2026

Reviewer: a separate read-only agent in a clone of `w54/role-survey-r1-r5` at `2f1fc17`, about 25 minutes, no network request. The 80 tests passed and ruff was clean. The live path was tested with only the policy's network step faked, and a second time with the real `_hop` and `_resolve` and only the connection pool replaced, so nothing connected.

## Verdict: approve with changes

The counting resolver does what review 7 asked: every request the policy can send is logged once before it connects, so a batch's size is a hard limit (probes: size 4 sent exactly 4; size 1 took the policy's robots read and stopped without the page), and an off-site host is never contacted, neither its robots.txt nor its pages (a chain that leaves the site and comes back is refused at the first off-site hop). The pool has no retries and `confirm.Fetcher` none; a robots fetch shared between tasks is counted once. A `SurveyRefusal` on a page hop leaves `fetch_url` as the error "SurveyRefusal"; on the policy's own robots read it becomes a cached "unreachable" answer (600 seconds); `LiveRun.get` classifies by the resolver's own record, so both routes are right (size stops the run; off-site blocks the host and is neither refusal nor failure; a real DNS failure on a page is a failure). Using the private `_default_resolver` is acceptable and correctly awaited; the policy's 5-second spacing and its 5 MB and 500 KB caps hold. `site_host` drops only a leading "www", so a redirect from `jobs.x.org` to `x.org` counts as off-site: stricter than "same site", and safe.

Review 7's findings: both must-fixes resolved; off-site contact resolved; menu lines resolved (minor side effect below); the contract-length skip resolved but with a new miss; restrictions resolved ("Age: 25–35" on the same line after "women" still missed: the pattern needs the start of a line); the final-host and cached "redirected off" minors resolved but untested; pay partly (a bare "Salary: 2000" and "Salary: 2000 monthly" still missed; "competitive" before "pay" in an ordinary sentence still vague pay); UN supporters resolved.

## Should-fix

1. **In a resumed run, an off-site refusal can block a legitimate host.** A page redirects to host B off its site; the policy's robots read of B is refused and cached as "unreachable" for 10 minutes; if B is in the same batch and its robots.txt record is already on disk, `LiveRun.robots` answers from disk without a request, the policy's cache is not refreshed, B's pages fail with "robots.txt unreachable" and B is blocked and saved. Fix: remove the policy's cached answer for the refused host, or hand the stored answer to the policy when answering from disk; test a resumed run.
2. **"5 years' experience" counts as a contract length:** the narrower skip cannot pass an apostrophe after "years". Fix: allow an optional apostrophe; test both forms.
3. **Test gaps (8 of 23 mutations survived):** the refusal flag not reset per request (a stale off-site refusal would drop the next normal page); the lookup not awaited (the fake step ignores the address); the final host named and blocked; a cached "redirected off" record blocking its host; the branch blocking a host on a robots.txt error.

## Minor

1. A known standard line under 5 words ("Equal opportunity employer") is no longer protected from chrome removal; "label: value" menu lines ("Jobs: Remote") are kept (rare).
2. A host whose own robots.txt redirects off the site is labelled "redirected off the site, not followed" though the page never redirected; label it as a robots.txt case.
3. "The role supports a project for women only" is flagged as a sex restriction.
4. "Salary review 2025/26" reads as pay (the "/" after a year exempts it); a bare "Salary: 2000" is still missed.
5. Review 7's Fixes section was empty in the commit.
6. The R5 test checks `requests_sent` rather than `live_requests_sent`.
7. Confirm no live batch was started under the old `policy-requests.log` count.

## Mutations (23 run, 15 caught, 8 survived)

Caught: the off-site check removed; raw hosts compared; ">" for ">="; the size check removed; nothing logged; the off-site reason not recorded; the resolver or `max_redirects` not passed; the size pre-check removed; the site not set per request; a size refusal not stopping; an off-site page not blocking its host or counted as a failure; the off-site branch keyed on error text. Survived: the refusal flag not reset; the lookup not awaited; the refusal naming the first host; the final host not blocked; a cached "redirected off" record not blocking; the robots error branch removed; the log line after the lookup (harmless); the off-site check after the size check (harmless); the off-site body kept (equivalent).

## Fixes (12 November 2026)

- **1:** when `LiveRun.robots` answers from disk, it hands the stored answer to the fetch policy (`outbound._remember_robots`), so a cached "unreachable" from an off-site refusal is replaced; and an off-site refusal removes the policy's cached answer for the refused host. Test: a resumed run where a page redirects to another batch host whose robots.txt is already on disk.
- **2:** the skip allows an apostrophe after "years" (straight or curly); tests for both.
- **3:** tests for an off-site page followed by a normal page, the fake network step checking the address it receives, the final host refusing, a cached "redirected off" record reloaded, and "robots.txt forbids this address".
- **Minor 1:** a short line with an equal-opportunity, no-fee or zero-tolerance statement is protected at any length; "Personal data policy" and other links stay furniture. **2:** not changed: the policy reads the next host's robots.txt before it follows a page's redirect, so a page redirected off the site and a host whose own robots.txt redirects off it end the same way; one label ("redirected off the site, not followed") covers both, as the code now notes. **3:** "for women only" needs the post as its subject with "is" or "are" ("This position is for women only"). **4:** a year followed by "/" counts as pay only before a month or year word; a bare "Salary: 2000" stays a known miss (a year and an amount cannot be told apart without a currency). **5:** review 7's Fixes section committed. **6:** the R5 test uses `live_requests_sent`. **7:** confirmed: no live batch (R3, R4, R5) had started; their folders did not exist.
- No further re-review: the verdict was approve with changes, and the changes stay inside the approved design.
