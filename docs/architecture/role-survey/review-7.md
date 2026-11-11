# W-54: second re-review of the fixes to review 6 (12 November 2026)

Reviewer: a separate read-only agent in an isolated clone of `w54/role-survey-r1-r5` at `f4d00d2`, about 30 minutes, no network request. Tests: 71 pass (the fixes note says 75), ruff clean on the four files. The network path was checked end to end with the real `confirm.Fetcher` and the real `fetch_url`, with only the policy's lowest network step (`_hop`) replaced by a fake that counts each request.

## Verdict: changes needed

The redirect cap is real and correctly wired, and the archive reader is sound. But the live batch size is still not a hard limit: an error after a redirect loses the hop count, and the fetch policy's own robots.txt reads follow up to 5 redirects each, uncounted. Chrome removal now keeps board menu lines, a regression from fix G. The contract-length skip is too wide.

## Review 6's findings

- A (live batch size, redirects): partly. Resolved: the cap of 2 redirects reaches the policy (the partial replaces the instance attribute `Fetcher.get` calls; `fetch_url` takes `max_redirects`); a third redirect raises "redirect limit" after 3 page requests. Also resolved: the worst case is reserved, and a page ending off its site is not kept and blocks its host. Not resolved: the two must-fixes below, and an off-site host is still contacted (robots.txt and page) before the page is dropped.
- B (form check on real ids): resolved.
- C (restrictions): partly; the listed cases are fixed, with new misses below.
- D (archive redirects, streaks on disk): resolved.
- E (years skip list, restarted search): resolved.
- F (held-out adverts through near-duplicates): resolved. Edge: two held adverts that copy each other still lose one. Untested in `measure` (see the mutations).
- G (chrome removal): resolved for standard sentences, but too broad (should-fix below).
- H (UN typing, held organisations): resolved. Minor: "UN Women UK" is typed as a UN agency.
- I (maîtrise, licence de conduire): resolved.
- J (test gaps): mostly resolved; 8 mutations survive (below).
- Point 4 (pay): mostly resolved. Minor: a bare figure from 1900 to 2099 after "salary" ("Salary: 2000 per month") is missed. Also minor: "allowances" followed by a section number reads as pay, and "pay … competitive" in an ordinary sentence reads as vague pay.
- Point 12 (facts): partly; the contract-length skip is too wide (should-fix below). Hours and duty station are resolved.
- Point 13 (score): resolved.
- Minor points: resolved where changed (the title cut for boards only, "(M/F/D)", the "About the …" headings). The points left unchanged on purpose are accepted.

## New findings

**Must-fix 1: an error after a redirect leaves its hops uncounted.** File: `tools/survey/adverts.py`, `LiveRun.get`, around line 562. On any `FetchError` except "redirect limit", `confirm.Fetcher.get` returns `redirects = 0`, so `hops` is 0. Examples are a timeout at the second hop, the next host's robots.txt forbidding the page, or a DNS failure there. Simulated: two redirects and then a timeout made 5 requests but logged 1. A redirect followed by a forbidding robots.txt made 2 but logged 1. Every such request lowers the logged count by up to 4, so later reservations start too low and the batch can pass its size. Fix: when the status is None and the error is not a pre-request robots refusal of the first host, log the full reserved worst case. Better is exact counting (see the fix after must-fix 2).

**Must-fix 2: the policy's own robots.txt reads follow up to 5 redirects each.** File: `apps/backend/contracts/outbound.py`, `ROBOTS_MAX_REDIRECTS = 5` and `_fetch_robots`. LiveRun counts each of these reads as 1 request. Simulated: a redirect to a new host whose robots.txt redirects 5 times made 8 requests; LiveRun logged 3 and had reserved 5. An unprimed host whose robots.txt redirects 5 times made 7 requests and logged 2. Fix for both must-fixes, without changing the backend: add `resolver=` to the partial. `_hop` calls the resolver once per request, including the policy's robots reads, and gives it the host before any connection. The wrapper would:

- write one log line before each request;
- refuse once the batch's size is reached;
- refuse any host off the starting site, which also stops off-site hosts being contacted at all.

A refusal from the wrapper surfaces as "DNS resolution failed", so LiveRun must tell it apart from a network failure. Count from that log alone, so nothing is counted twice with `requests.log`. Test with the real `Fetcher` and a fake `_hop` or resolver.

**Should-fix:**

- **`carries_meaning` keeps board menu lines.** File: `adverts.py`, `carries_meaning` and `chrome_lines`. "Apply now", "Remote jobs", "Part-time jobs", "Full-time jobs", "Interview tips", "Closing soon", "Upload your CV" and "Personal data policy" all match a fact or standard pattern. They are therefore never removed as site furniture, so how to apply, remote, hours, closing date and selection steps are credited from menus on every board page. Fix: keep only known standard text, inclusion statements and restriction statements; for facts, keep only a "label: value" shape or a sentence of at least 4 words with a verb. Add a test with these menu lines across 3 pages.
- **The contract-length skip is too wide.** File: `adverts.py`, `facts_of`. It skips any "experience" within 50 characters after the match, across sentences and lines. "Contract duration: 12 months. Experience: 5 years" and the same over a line break lose contract length. Fix: require "experience" in the same sentence and directly after the duration (for example, the duration followed by an optional "of" and up to two words, then "experience").
- **Restrictions (C) still misfire:**
  - "for women only" after a programme, scholarship or cooperative is flagged. Better to require the post or applications as the subject than to list places.
  - "you must be able to work at height" and "reports must be presentable" are flagged. Exclude "at height(s)", and require the applicant as the subject of "presentable".
  - "Age: 25–35" within 40 characters after "women" is missed.
  - "regardless of nationality" within 40 characters before "Only X nationals may apply" hides the restriction. Use only the match's own sentence.
  - "Applicants (youth) must be aged 18–35 years" is missed: the word for people served sits inside an applicant match. Skip only when there is no applicant word.
  - "national recruitment" in duties is flagged as a national post.

**Minor:**

- When the final host on the same site refuses, the refusal goes to the first host and the final host is not blocked.
- A cached "redirected off" record does not block its host again (`state.json` does, unless interrupted between the two writes).
- `robots_known` is keyed by host while the policy caches by origin, so an `http://` next page on a board's host is a new robots.txt read.
- A robots.txt larger than the policy's limit is not shared with the policy, so it is read again uncounted.
- The test count is 71, not 75.

## Mutations (41 run, 33 caught, 8 survived)

Caught:

- reserved redirect worst case removed;
- "redirect limit" not counted as every hop;
- each hop counted once instead of twice;
- off-site check removed, comparing raw hosts, off-site host not blocked, off-site counted as a failure;
- the policy log not counted;
- a stopped batch resumed;
- the archive reader following redirects, not reloading either streak, not saving its state, or not stopping on a 403;
- the row check ignoring held organisations;
- near-duplicates ignoring held adverts;
- the people-served, nationality and service-place skips removed;
- the contract-length skip removed;
- the years search not restarted;
- pay not lifting a 0;
- travel and hours required;
- the `org_id` form without "/";
- the board hash without its letter;
- the salary-year check removed;
- the "outside working hours" check removed;
- "maîtrise" in any context;
- `UN_PREFIX` never matching;
- the UN foundations not excluded;
- live blocked hosts not reloaded.

Survived:

1. The robots.txt term dropped from the reservation.
2. The `max_redirects` partial removed (no test builds a real `Fetcher`).
3. `fetch-archive` running when only the held-organisations list is missing.
4. `measure` passing no held ids to the near-duplicate step.
5. `carries_meaning` always False.
6. The "years ago" check removed.
7. The board-only title cut applied to every source.
8. The live failure streak not reloaded.
9. Not counted in the 8 because it is harmless: `robots_known` not given the off-site final host.

## Fixes (12 November 2026)

All findings taken; 80 tests pass, ruff clean, the form check passes on the real output. The fixes change logic, so a further focused re-review follows.

- **Must-fix 1 and 2 (the live batch size):** as the reviewer proposed, a counting resolver (`CountingResolver`) is given to the fetch policy beside `max_redirects=2`. The policy asks it for an address once for every request it sends (each redirect hop and its own robots.txt reads, with their redirects, included), before connecting; it writes one line to the batch's `resolver.log`, which is the batch's only count, refuses once the size is reached (the run then stops), and refuses a host off the request's site, which is never contacted. The worst-case reservation and the separate policy log are gone. Tests run the real `confirm.Fetcher` and fetch policy with only the lowest network step faked: two redirects then a timeout (5 requests sent, 5 counted), a robots.txt that redirects past the size (stops at exactly the size), a redirect off the site (the other host never reached), and the cap of 2 redirects.
- **Chrome removal:** a short line is kept only if it is a sentence of five words or more carrying a known standard text, inclusion statement, restriction or fact, or a "label: value" line with a fact; menu items such as "Apply now", "Remote jobs" or "Personal data policy" are removed again, and a recognised section name is kept only when it is a heading.
- **Contract length:** skipped only when "experience" follows the duration directly, in the same line.
- **Restrictions:** "for women only" needs the post or applications as its subject; "at height" and "presentable" without the applicant as subject are not flagged; an "Age: N–M" heading is read whatever comes before it; a nationality exception counts only within its own sentence; words in brackets after "Applicants" do not hide an age restriction; "national recruitment" and "national consultant" are no longer national-post signals.
- **Pay:** a year-like figure counts when "per month", "a year" or a currency follows; allowances need a figure of three digits or more; "pay" as vague pay only in "pay: competitive" and similar.
- **Minor:** a refusal on the final host of a same-site redirect blocks both hosts; a saved off-site record blocks its host again on resume; "UN Women UK" and similar supporters are not UN agencies. The per-host robots.txt bookkeeping went away with the counting resolver, which counts every read whatever the scheme or size.
- **Mutation survivors:** each now has a test (the real `Fetcher` path, `fetch-archive` with one held list missing, `measure` keeping a held-out advert over its copy, menu lines, "years ago", the board-only title cut, the reloaded failure streak).

