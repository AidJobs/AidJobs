# Handover: W-54 Phase 5 wave-1a — revision 5 + blind round 5

> **Closed on 27 November 2026 (revision 10, not re-scored).** Do not continue the rev5–rev9 revise loop and do not run the US$5 model comparison below (it required 12/12 both, which this wave did not meet).
>
> - Rounds 6–9 ran on branch `w54/phase5-validation` (revisions 6–9; PM17/ML17 swaps; template-org rule). Round 9 scored 8/12 both and 11/12 rubric with one model family (Grok).
> - An independent technical-director review (Claude Opus 5.5 via OpenRouter, `docs/architecture/role-survey/phase5/independent-td-review.md`) returned **Fix-before-PR**: the packets showed the pass mark and item kinds, FN-B2 named the employer in its apply URL, CA-B2 carried an unsupported "Full-time", FN-B1 raised a finance-leadership bar the source lowered, FN-B3 conflated bid and opinion deadlines, CA-B3 swapped close/post dates, and all 12 carried an unattributed no-fees/safeguarding footer.
> - **Round 9's 8/12 and 11/12 figures must not be cited as the result.**
> - **Revision 10** (`rev10-change-list.md`) corrects those six factual items only and has **not** been re-scored. `CA-B1` stays structurally blocked on decision facts.
> - **Do not commit** `tools/survey/raw/ai-test-set/phase5-blind/` or `phase5-source/`: the scored packets on disk still hold the revision 9 wording (including the old FN-B2 URL) and full third-party advert text.
> - **OpenRouter key:** revoke `AIDJOBS_OPENROUTER_PHASE5_KEY` (~US$2.75 of the US$5 limit used for the independent review; ~US$2.25 left; no further paid calls needed for this wave).
> - **Next when resumed:** either a clean, truly blind confirmation round (neutral item IDs, no thresholds in packet headers, second scorer family) or a hiring-manager test after marking drafter-proposed lines.

Paste this whole file as the opening message of a **new** chat. Same stage (not a new stage); this chat grew too long and scorers stalled on Shell measuring scripts.

## Recommendation

Work in a **new chat**. Keep this worktree. Do not start a second Phase 5 worktree.

## Step 0 — start state (do first)

Worktree: `C:\Users\DELL\Documents\AidJobs App\AidJobsGit-survey`  
Branch: `w54/phase5-validation` (tracks `origin/main`; uncommitted Phase 5 paths below).

1. Check worktree and main folder are not mid-merge; do **not** touch forever-dirt `tests/test_link_heuristics.py` or `apps/backend/scripts/diagnose_enrichment_bias.py`.
2. Tip already matched `origin/main` at `1ac7226` when this handover was checked (23 Nov 2026). Re-check; fetch/ff only if safe and does not clobber local Phase 5 files.
3. Confirm seals / `library.py check` still 0 problems if you touch library; prefer **not** changing library phrasing until assemblies prove the fail modes.
4. Never print secrets / `.env`. Phase 5 OpenRouter key is **later** (vault stop) — not this chat unless all 12 pass.
5. Do not crawl production or write jobs DB.

## What is done

- Wave-1a four families; pass rule: unweighted total ≥ family Option A p75 **and** no dim below family median **and** forced-choice top half (rank ≤3 of 6).
- Guide: `docs/architecture/role-survey/scoring-guide.md` v1.1.
- Scorers/rankers: **Grok** (not Composer — Composer is the hand writer).
- Briefs + sources (gitignored): `tools/survey/raw/ai-test-set/phase5-briefs/`, `phase5-source/`.
- Assemblies revision **4** on disk (untracked under the eventual commit path): `docs/architecture/role-survey/phase5/hand-assemblies/*.md`. Round 4 used these; `blind-packet.md` index still said revision 3 — bump the index when rebuilding for rev 5.
- Blind packets (local): `tools/survey/raw/ai-test-set/phase5-blind/*-packet.md` (+ `.json`).
- Round 4 results: `validation-round4.csv`, `forced-choice-round4.md`, answers under `phase5-blind/answers/*round4*`.
- Round 4 outcome: **1/12 both** — only `template:ML-B1` PASS. Score-pass but FC fail: FN-B3, PM-B3, ML-B3. FC pass but score fail: PM-B2.
- Dominant round-4 fails: findability (7), FC (10), readability (5), decision_facts (4).
- Helpers (local, not CI): `phase5-briefs/assemble_rev3.py`, `assemble_rev4.py`.
- AI test-set stubs: `docs/architecture/role-survey/ai-test-set/{schema.json,results.csv,README.md}` — briefs.sha256 and hold-out briefs **not** done yet.
- Ledger **Next** still names the vault-key / US$5 stop; that is after 12/12 both — do not skip the revise loop.
- Parallel stream: main folder may hold docs/records work (e.g. open PR #194 on `docs/w193-merged-records`). Do **not** hijack the main folder or other branches; keep Phase 5 in this worktree.

### Honesty note (keep)

Round 4 scores/FC are Grok agent outputs. Composer wrote only the PM+MEAL **summary** from JSONL after a stall, and merged CA+FN files. Scorers were barred from Shell measuring scripts after multi-hour hangs. For the eventual “Phase 5 passed” claim, require one clean blind round that finishes without Composer filling gaps.

## Progress in the chat that started rev5 (23 Nov 2026)

- Handover wording fixes applied; survey worktree fast-forwarded to `66db353` (PR #194 docs only).
- Briefs updated from sources where facts existed (FN-B2 closing; FN-B1 place; ML-B1 close time/tz; ML-B3 posting; PM-B2 staff contract/position; CA-B3 apply wording).
- `assemble_rev5.py` run; assemblies + packets at revision **5**; `blind-packet.md` + `structural-findability-gaps.md` written.
- Round 5 scored (Grok, four family scorers + FC). Result: **2/12 both** (ML-B1, PM-B3). CSV: `validation-round5.csv`. Next: rev6 for fixable fails; structural findability briefs need swap or a contract call (see `structural-findability-gaps.md`).

## What to do in this new chat (in order)

### 1. Revision 5 assemblies (11 fails; keep ML-B1 unless a tiny consistency tweak)

Source-grounded facts only — **do not invent** pay, place, org name, closing time, etc. Org stays **type only** (decision 15 / brief rule).

Aim for every failing template:

1. **Findability G ≥ 5** with clear title: need five of {title, description, posting date, closing date, organisation, place, employment type, salary}. Organisation name is usually absent by design → make the other seven as complete as the brief/source allows (posting date, close, employment type, pay, place, body ≥8 words).
2. **Decision facts ≥ family median (usually 1):** pay and/or ≥⅓ of applicable facts; prefer how-to-apply as URL/email/form, selection steps, contract type+length, languages, place — only if in brief/source. Closing for DF needs day+time+tz together; if incomplete, still help findability’s weaker close.
3. **Readability ≥ 2:** duty sentences median 13–20 words; expand acronyms at first use (MEL, DRC, …); no empty `[slots]` except `[email]`/`[phone]` redactions; no “Still to confirm” residue in the published text.
4. **Forced-choice:** concrete outputs, counterparts, scope so a hiring manager can decide apply/not — beat thin reals into rank ≤3.
5. Keep `Type:` line for scoring-guide rows (local or national NGO / INGO / UN…); keep Job-posting data block.
6. Rebuild packets from existing `*-packet.json` (keep the same real comparators; replace template texts only). Bump revision to **5**.
7. Update `phase5/blind-packet.md` index.

Write `assemble_rev5.py` (or extend rev4) under `phase5-briefs/` (gitignored is fine). Output assemblies to `phase5/hand-assemblies/`.

### 2. Blind round 5 (new Grok agents only)

Launch **four** small agents (split packets — do **not** combine CA+FN into one hung agent):

- PM packet scorer  
- MEAL packet scorer  
- CA packet scorer  
- FN packet scorer  
- Plus one forced-choice ranker over all four packets  

Hard rules for scorers:

- Model: `grok-4.7-high-fast` (or current Grok equivalent).
- Read guide + one packet only.
- **Do not use Shell** for measuring; apply the guide directly.
- Write JSONL immediately (`key: id`); then a short summary.
- If idle >20 minutes with no answer file → abort and restart that agent only; do not resume stalled measuring runs.

Pass rule unchanged. Write `validation-round5.csv` + `forced-choice-round5.md`.

### 3. On fail

Revise again (rev6…) until all 12 pass both measures, **or** stop with a blocked-family evidence report and a clear recommendation (prefer continue until pass unless a structural brief gap makes DF/findability impossible without inventing facts — then report that family).

### 4. Only after 12/12 both

1. AI test-set hold-out briefs (local gitignored) + committed `briefs.sha256`.
2. **Vault-key stop** for user: `AIDJOBS_OPENROUTER_PHASE5_KEY` via `with-secret.ps1` (leave W-51 key alone).
3. US$5 OpenRouter model round (Claude Sonnet 5.5 + GPT-6.1 Terra; ZDR; AidJobs-owned text only).
4. Records §19.25 + ledger tip/Done + PR (named-head merge later, user approval).

## Paths cheat sheet

| What | Path |
| --- | --- |
| Worktree | `C:\Users\DELL\Documents\AidJobs App\AidJobsGit-survey` |
| Assemblies | `docs/architecture/role-survey/phase5/hand-assemblies/` |
| Briefs/sources | `tools/survey/raw/ai-test-set/phase5-briefs/`, `phase5-source/` |
| Packets/answers | `tools/survey/raw/ai-test-set/phase5-blind/` |
| Round 4 CSV | `docs/architecture/role-survey/phase5/validation-round4.csv` |
| Guide | `docs/architecture/role-survey/scoring-guide.md` |
| Ledger | `docs/architecture/progress-ledger.md` |

## Approvals already given

- Plan approved; blind scoring loop approved; continue revise-on-fail approved (user, this stage).
- User asked to start rev5 in a **new chat** (23 Nov 2026).

Do **not** wait for re-approval of investigate/plan for rev5; execute. Ask the user only for vault-key placement when you reach that stop.
