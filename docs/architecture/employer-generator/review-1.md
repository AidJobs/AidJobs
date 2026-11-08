# Independent review: draft plan "JD generator in production and a parallel employer stream" (8 November 2026)

Reviewer: independent read-only agent. About 35 minutes. Nothing was changed in any repository, and no production system or AI service was contacted. Sources read: the draft plan; the contract; the ledger (How to resume, Operating conventions, W-34, W-51, Decisions waiting); the growth plan (sections 4, 7, 8, decision 12); the security plan (stage list, stage 6, stage 8, safeguards); the employer plan (sections 1 to 17 on `demo/employer`, section 18 on the ideas branch); the demo code (`engine.ts`, `actions.ts`, `Settings.tsx`, `Structure.tsx`, `DocPane.tsx`, `translate.ts`, `FormatBuilder.tsx`, `types.ts`, `changes.ts`, `CreateEntry.tsx`); the style study (`style/group-a`, `group-b`, `group-c`); `style_rules.py`; `results/run-log-r3.txt`.

Line numbers for the plan refer to `PLAN-DRAFT-generator-and-parallel-employer-stream.md`. Other files are cited by section or line.

## Verdict: changes needed

Part 1 is accurate. Proposal A's design (four kinds of content with a recorded source, standard texts inserted through markers, a check after every write, a fallback, an evaluation set) is sound, and the round 3 evidence supports it. Three parts of A need changes before it is recorded: the length bands and the Draft mode that fills them (the style study argues against this), the missing safeguards against prompt injection and personal data in uploads, and the length check in Restructure mode.

Proposal B can't go ahead as written. Its central build step publishes employer jobs into the production jobs table through "the same admission step and writer". That collides with several contract rules the plan doesn't list. Jobs written there would be shown by today's public search, which contradicts "private beta". The work also overlaps with the crawler foundation in the same code: the writer, the schema, and the fetch policy. And no security stage yet exists for employer sign-in, tenancy, webhooks, or uploads. A "private beta" with real organisations is production under the contract, so the scope amendments must be merged first.

---

## Must fix

### M1. Publishing "through the same admission step and writer" is not a drop-in path, and it needs amendments the plan does not list
**Evidence.**
- The plan (L86) cites "contract section 8", but section 8 is the upsert. Admission is §17 Gate 11 (contract L697–701) plus crawler plan C3.
- The contract's target flow has one production path from Source through CrawlRun and Fetch (§3, L92–133). A source is "one monitored career URL" (§5, L171–177).
- `persist_candidate` accepts only rows with `admitted=True` (L700). Since security stage 2, a run writes only while it owns its source's crawl lock (security plan, PR B).
- Identity is `md5(title|apply_url)` or a normalised URL plus reference (§7, L283–303). Changing a title therefore creates a new row, and two "Same role, another place" variants that share an apply URL and title collapse into one row.
- Validation rejects `mailto:` addresses and root careers pages (§10, L424–426), and rule 18 forbids inventing an application address (L725).
- The lifecycle is ACTIVE or EXPIRED under approved rules only (§6). The employer plan's Close now, Withdraw, Reopen, "no longer listed", and deletion within 14 days are all new transitions (employer plan §2, L30–35; §17, "For production").

The employer plan itself calls the direct source a decision that "bypasses fetching and the crawl-run record" (§2, L30).

**Change.** List these as amendments the employer stream needs, each a user decision with an independent review (ledger L45): §3 and §5 (a direct source and how its writes are recorded without a crawl); run ownership for writes that come from no crawl; Gate 11 and C3 (admission evidence for employer jobs); §7 (title edits, and variants per place); §6 (the new lifecycle transitions); and §10 with rule 18 (applications by email). Until a design for the writer path is reviewed, remove "publishing into the jobs table" from "Buildable before launch".

### M2. "Private beta" and "writes into the jobs table" contradict each other
**Evidence.** Plan L86 says the beta is "noindex, behind sign-in" but publishes "into the jobs table". L87 says public visibility waits. Today's public search (`HomeClient`, `/v2`, `app/search.py`) shows every active, unsuppressed row in `jobs`. The only existing hiding mechanism is administrative suppression (`deleted_at`, §6), which must not be repurposed. Separately, the ledger says not to write to the jobs database unless the user asks for that step (L55).

**Change.** Choose one of two options and record it:
- (a) Before launch, employer jobs stay in the employer's own draft and publish store and never reach `jobs`. The beta shows them only to the signed-in organisation.
- (b) Add an explicit eligibility rule, approved as a contract change (§13 and Gate 7's "which jobs are public"), that public search and the future public view honour.

Option (a) is simpler and keeps the crawler foundation's writer untouched.

### M3. The two streams don't work in separate areas
**Evidence.** The ledger allows at most two code streams, and only "in separate areas" (L40). The crawler foundation (stream one) is about to change:
- the writer: W-36's observation path in `contracts/persist.py`;
- the schema: W-37's new columns and migrations;
- the fetch policy: W-34's `robots.txt` handling, and the Workday POST amendment;
- organisations: Gate 8, which the employer plan names as a dependency (§2, L30).

The plan's employer build touches the same four areas: publishing through the writer, a database design with "organisations" and "jobs", fetching links through the shared policy, and sign-in. The growth plan also rejected building in parallel because it "would mix two streams of approvals" (section 7, L288). The draft doesn't answer that objection.

**Change.** Sequence the employer stream so that, until W-36, W-37, and Gate 8 have merged, it touches none of these: the writer, the `jobs` schema, the organisation model, or the fetch policy. Its first build steps would then be self-contained: employer sign-in, the employer's own tables, and the generator service. State that stream one has priority for approvals and merges, and that production takes one merge at a time (ledger L40). In the docs pull request, add a sentence explaining why the 30 October objection no longer holds.

### M4. A pre-launch beta with real organisations is production, so scope amendments must merge before any build plan
**Evidence.** Contract §2: "Employer submissions, alerts, and user accounts stay out of scope until their own decisions" (L88). Rule 9 bars a second production authentication system (L716), and §14 says "one administrative actor … do not build a role system" (L520). Growth plan decision 12 makes each of these "a §2 decision" (L134). The plan's first steps (L91) put "contract amendment drafts" third and suggest that build steps follow, but it never says the amendments must be approved and merged first.

**Change.** State the gate plainly: no employer build plan is approved until the §2 scope amendment, the rule 9 and §14 amendment, and the other relevant amendments have been reviewed independently and merged. The user makes these decisions; they can't be delegated, since decision 12 was the user's. Also list the amendments the plan omits:
- UX-08 item 2E (AI features out of scope) and item 8 ("no ads or payments at launch");
- the "no advertising" wording in the contract's §2 amendment of 30 October, because of sponsored placement;
- decision 12's "moderated, for organisations without a recruitment system", because this plan covers all organisations;
- growth plan section 8 on Vercel Hobby (L304);
- §4 and §10 on "another job table" and "promotable shadow row" (see M6);
- §9 (see M5).

Update `AGENTS.md`, which states the current order, together with the ledger and growth plan section 7.

### M5. Importing a job description from a link is an arbitrary-URL fetch for anyone who signs up, so it needs a §9 decision
**Evidence.** Contract §9: the public Find & Earn fetch "is not retained as a public fetcher behind extra checks" (L362). Anyone can create an employer account, so "signed-in" alone is close to public. The employer plan already treats this as a decision (§10, L115). The draft lists the link input under intake (L49) and lists no §9 amendment (L85).

**Change.** Add a §9 amendment covering four limits: only verified organisations (or a per-account cap plus a global cap), one page per job, HTML and text only, and the existing size and time limits. Treat it as a security-boundary pull request of its own (ledger L42). Or drop link import from the first beta.

### M6. "The database design (organisations, employer users, jobs, versions…)" is listed as safe, but two of those tables conflict with the contract
**Evidence.** The organisation model is the contract's first-class Organisation (§5, L157–169; Gate 8, not yet built). A second organisations table would break that. An employer "jobs" table runs into "do not create … another job table … or any shadow catalogue" (§4, L138). §10 adds "Do not insert a side catalogue … A rejected record must not later be promoted by a second writer" (L430).

**Change.** Drafting the design is safe as a document, but it must:
- use the single Organisation from Gate 8, extended for employers and not duplicated;
- call the employer store "drafts and versions", never read by public search, never a catalogue;
- have an explicit contract amendment that permits it.

Reword L85 to match.

### M7. Proposal A has no prompt-injection or personal-data safeguards for uploads and links
**Evidence.** A9 (L68–69) covers training, retention, and the EU AI Act, but not injection or personal data. Uploaded documents and fetched pages are untrusted text that goes into the writer's prompt. The output is published under the organisation's name, and the style study names fee-charging scams as a known abuse (group C, recommendation 5; "asking for a phone or WhatsApp number … copies scam patterns", L299). Real job descriptions also carry names, emails, and phone numbers of hiring managers and referees. Growth plan 4.6 says recruiters' emails and phones are never stored (L220).

**Change.** Add a safeguards item covering:
- uploaded and fetched text marked as data, with the writer told never to follow instructions inside it;
- no tools for the model, and structured output only;
- the verify step refusing any link, email, phone number, or payment request in the output that didn't come from the organisation's profile or the user's typed facts;
- output rendered as escaped text or sanitised Markdown, never raw HTML (see S6 on stored XSS);
- contact details found in uploads removed or replaced with a placeholder before they are sent to the model or stored, with the user told;
- a cap on upload size;
- files parsed in the browser as the demo does (`mammoth`, `unpdf`), so only text reaches the server and no server-side document parser is exposed.

Add seeded injection and personal-data cases to the evaluation set (A10 and A9).

### M8. The length bands and "fill to the band" in Draft mode contradict the style study, and the check penalises Restructure
**Evidence.**
- The style study's core finding is that value comes from facts, not length. It says "Making adverts longer to look 'proper' … backfires" (group C, L291), and that very long adverts underperform, with a sensible target of about 150 to 450 words, key facts first (group C, L164). `style_rules.py` repeats it: "Value comes from the facts … not from length" (L4).
- The draft's bands describe real adverts as they are, padding included. They are not the study's recommendations. INGO role profile job content is set at 900–1,600 (L36), while `style_rules.py`, which the tests used, aims for 650–1,150 (L45, L53) and group B says "enforce brevity". INGO purpose-led is 700–1,200 in the draft against 550–1,000 in the rules (L58, L66). Domestic charity is "400–700 / about 500–900" against an observed body of 230–450 words (group C, L116–117). Local NGO officer roles are 250–550 against the study's suggested 350–600 (group C, L302–309).
- Round 3 found that the models "restructure without padding, so … the length follows what the organisation gives" (employer plan §18, round 3).
- The draft's verify step checks "length band" every time and repairs failures (L52). Applied to Restructure mode, that would push a faithful but shorter restructure towards padding.

**Change.**
- Make the bands ceilings and guidance, not targets, and take them from the study's recommended ranges in `style_rules.py`. Keep the "total with standard texts" figures as descriptions of real adverts only.
- In Draft mode, write the minimum useful advert: the fact block, 4 to 7 concrete duties, and 3 to 5 must-haves. Ask questions instead of padding with suggested content.
- Check length only in Draft mode, as advice, never as something that triggers a repair, and never in Restructure or Improve.
- Recalibrate the bands after the next model test (A10). Mark them "to test, not settled", as the study does (L311).

---

## Should fix

### S1. No security stage exists for the employer side
**Evidence.** The security plan's stages end at stage 8 (the survey). None covers employer sign-in, tenancy, roles, reviewer links, uploads, webhooks, or employer personal data. Stage 6's grants and its personal-data exclusion for `aidjobs_readonly` (L1750) list today's tables only.

**Change.** Before the first build plan, write a security stage for the employer side. It should cover:
- sign-in: a session cookie separate from the admin's, with its own secret and scope; password hashing or passwordless links; rate limits; no account enumeration; server-side revocation, since admin tokens already have the 8-hour stateless gap;
- tenancy: every query scoped to the organisation, with tests that one organisation can't read another's data;
- roles: Owner, Member, and Reviewer checks;
- reviewer links: one person, expiring, single purpose;
- Paddle webhooks: signature verification, replay protection, idempotent handling (employer plan §2, L38);
- new tables in `02_grants.sql`, with personal-data tables excluded from the read-only role;
- retention and deletion periods.

Under ledger L45, each of these is reviewed independently.

### S2. Sign-in itself depends on email and the domain, not just Reach
**Evidence.** The plan lists the domain with SPF, DKIM, and DMARC as a dependency only for Reach emails (L87), and sign-in as buildable before (L86). But sign-in needs transactional email: verification, password reset or magic links, and invitations. Verifying an organisation by its own-domain email also sends mail (employer plan §18). `aidjobs.app` is currently expired (ledger W-34, L575).

**Change.** Make the domain and a transactional email provider hard dependencies of employer sign-in. Record that third-party sign-in (for example Google) would be another authentication decision under rule 9.

### S3. Hosting limits aren't addressed: Render's free instance, Vercel proxy time limits, and AI work in the crawler's process
**Evidence.**
- Round 3 calls took 9 to 26 seconds each (`run-log-r3.txt`, for example L14 at 26.4 seconds). The pipeline adds extraction, verification, and possibly a repair pass.
- Browser calls go through the Next.js proxies on Vercel, and `lib/backendProxy.ts` has no time limit (ledger, stage 7 follow-ups). Hobby functions also have a short default duration.
- The free Render instance sleeps.
- The crawler and scheduler share the one backend process, and database work already blocks the event loop on some routes (ledger, stage 7 follow-ups). Contract §12 forbids a second service unless it is shown to be needed.

**Change.** Add a hosting section:
- the paid Render instance from the first real beta user, not "once real employers use it", since that is the same moment;
- a streaming path that the proxies support, with explicit time limits;
- AI calls made fully asynchronously, with a cap on how many run at once, so a crawl is never starved;
- a load check before the beta.

### S4. Secrets, spending caps, and the production AWS route aren't specified
**Evidence.** A9 says "mantle route now" (L69). The tests ran as a test user with mantle-only permission, its key kept in the local vault (employer plan §18). AWS budgets send alerts but don't stop spending. The data terms for mantle, compared with `bedrock-runtime`, haven't been read, and Gemma 4 isn't offered in Mumbai.

**Change.** Specify:
- a separate production IAM user, limited to the mantle inference permission, with its key only in Render and never on the development machine (security stage 6's principle);
- a global daily spending cap and a kill switch inside the application, beyond the AWS alert;
- confirmation that mantle carries the same no-storage and no-training terms as Bedrock and is supported for production;
- the region decision, following Render's region, and what that means for EU organisations (AWS data-processing terms and transfers).

### S5. Abuse of the generator isn't covered beyond the per-job token budget
**Evidence.** A5 makes the chat a general intent reader (L56). Section 18 sets per-job and monthly budgets, but nothing stops off-topic use, many accounts made for free tokens, or flooding before verification.

**Change.** Add:
- refusal of anything that isn't about the job (the chat edits this job and answers questions about it);
- per-account and per-address rate limits;
- a smaller allowance until the account's email is confirmed;
- a cap on new organisations per domain or device signal;
- a global circuit breaker tied to S4's spending cap.

### S6. Employer content can reach the admin on the same origin, and so can Paddle's script
**Evidence.** The demo plan forbids admin sign-in on the demo preview "because an outside script runs on the same origin as the admin proxies" (employer plan §8, L97). In production, Paddle's checkout script and employer-written content would share the admin's origin. A moderation view would render employer text inside the admin, which is a stored cross-site-scripting route to the admin proxies.

**Change.** Put the employer application, or at least the checkout, on its own subdomain, or move the admin to its own origin. Sanitise all employer content wherever it is rendered, and add a Content Security Policy.

### S7. Rewording "given content" conflicts with the agreed "keeping your wording"
**Evidence.** A1 says given content "may be reworded and regrouped" (L25–26), and A3's Restructure "reorganises" (L44). The demo's agreed smart paste says "Read this as a job description, keeping your wording" (employer plan §15, item 1.8). The verify step checks numbers and facts but can't detect a changed meaning, such as "support" becoming "lead".

**Change.** By default, Restructure keeps the user's lines word for word and only regroups them and adds headings. Rewording is opt-in, per section, with a before-and-after view. Record "edited by AI from given" as its own source.

### S8. Model and language claims run ahead of the evidence
**Evidence.**
- A9 picks Kimi K2.5 to write and translate (L69). The user's blind Hindi rating and the native reviews for Bengali, Urdu, and Swahili are still pending (ledger decisions table; employer plan §18).
- A7 lists "tested" languages (L63), but each had one translation task and a few briefs.
- Kimi "still adds small details despite the rules" (round 2). Catching that depends on a semantic check whose accuracy has never been measured: the tests' `possibly_invented` check looks for numbers only.
- The automatic check marked Kimi's localised "3,1" as a lost number in five translations (`run-log-r3.txt` L21, L25, L27, L29, L31). A strict verify step would trigger needless repairs.
- "Cents per job" is supported for single calls (about US$0.004 for a full job description), but the chat, verify, and repair calls were never measured together.
- The "second writer as fallback" isn't named, and round 2 found invented facts from Qwen 3 and Mistral Large 3.

**Change.** Mark the model choice provisional until the Hindi rating. Offer only languages that pass native review, and call the rest "beta" or hold them back. Add to the next model test:
- the verify step's own accuracy, with seeded invented duties, statements, and contacts;
- comparison of localised numbers and dates;
- the cost of a whole job's session, chat included;
- the fallback writer, which must pass the same evaluation set.

### S9. The rule-engine fallback is English-only and invents generic duties
**Evidence.** The fallback is "today's rule engine" (L54). `engine.ts` writes duties from fixed English lists for 12 role families. Section 18 says that when a job reaches its budget, editing by hand stays free and Amplify is offered. It doesn't say a generic draft is substituted.

**Change.**
- Port only fact extraction and the outline to the server.
- Mark every fallback line as Suggested.
- Don't use the fallback for jobs in other languages: show "AI unavailable, try again or write by hand".
- Don't trigger it when a budget runs out; keep section 18's behaviour.

### S10. The EU AI Act and data-protection position is stated too briefly
**Evidence.** A9 says only that recruitment is high-risk and that AidJobs drafts adverts (L69). Annex III, point 4(a), also names systems that "place targeted job advertisements". Reach (invitations) and any future matching to job seekers' alerts (employer plan §16, "For after launch") come close to that.

**Change.** Write down the classification and its reasoning. Under it:
- AI never chooses recipients or targets an audience;
- the transparency duty for AI-generated text, and how human approval meets it;
- AidJobs' role as a processor of employers' content, with a data-processing agreement;
- employer terms and a privacy notice before the beta (needed whether or not anyone pays);
- the moderation queue and "Report this job" before any employer job is visible (decision 12).

### S11. No estimate of the employer stream's size or its effect on the launch
**Evidence.** L84 says only that the launch "comes later". The demo alone was estimated at 8 to 12 days (employer plan §12). Production covers sign-in, the schema, the generator, the writer path, moderation, email, and payments, each with its own review.

**Change.** Give a rough estimate per step, and a rule for what happens when the two streams compete for the user's approvals: stream one goes first.

---

## Minor

1. **Part 1 accuracy (small).** Chat (L16): "anything else is appended as a sentence" is no longer true. Messages that look like questions or requests the engine can't act on are refused, acknowledgements change nothing, and fact changes rebuild the sections that mention them (`engine.ts` L1111–1128). Start date (L15, L19) isn't wholly unused: it appears in "Changed since publishing" (`changes.ts` L16), though never in the drafted text. Sectors (L15) feed the first screen's role suggestions (`CreateEntry.tsx` L36), though not the drafted text.
2. **Wrong citation.** "Contract section 8" for admission (L86) should be §17 Gate 11 and crawler plan C3. The employer plan repeats the mistake (§2, L30; §13).
3. **Naming.** "Round 4" (A10, L71) collides with W-51's demo round 4. Call it "model test round 4".
4. **Facts "never suggested" (A1, L25) needs a qualifier.** The agreed design offers fact picks with a stated basis (salary from published scales, closing-date picks, organisation memory; employer plan §14 and §15). Say that facts may be offered as labelled picks but are never inserted without the user choosing one.
5. **Starter standard texts (A11 question 3).** They must never state an organisation's practices it hasn't confirmed. The demo already shows the Misconduct Disclosure Scheme text only to members; apply the same idea to background checks and counter-terrorism checks.
6. **"Details checked by AidJobs".** The badge text (employer plan §16, decision 4) would describe automated checks. Word it so it doesn't overstate human review.
7. **Locked standard texts.** The bug list is right: in a job, `toggleCommitment` ignores `locked` (`actions.ts` L440–443; `Structure.tsx` L136). The production fix belongs to A6's "locked enforced" (L60) and should name server-side enforcement too.
8. **Duplicates with crawled jobs.** When an organisation AidJobs already crawls also publishes directly, the same vacancy can appear twice. Decision 11 (one primary source) needs a rule before publishing is built.
9. **Model test spending.** Running the next test is "safe now" (L85), but it still needs the user's approval of its budget, sample data only, and the key in the vault (employer plan §18). Say so.

---

## Good, keep

- Part 1 is honest and specific. Spot-checks confirmed:
  - 12 role families and 10 formats, each format being headings, order, one tone word, and default commitments (`engine.ts` L60–247);
  - tone changes only the team and purpose sentences (`engine.ts` L803–866);
  - "shorter" keeps three bullets and "longer" adds library bullets (L1068–1081);
  - a language name anywhere in a message adds the language (L1089);
  - the "pauses publishing" checkbox is duplicated (`Settings.tsx` L220–245);
  - brand voice is never read by the engine (only `Settings.tsx` uses `org.voice`);
  - the format builder promises "The incumbent will…" (`FormatBuilder.tsx` L14), which the engine never writes;
  - the lookup tables mix French "vous", Spanish "tú", and formal Portuguese (`translate.ts` L157–193);
  - locked texts can be unticked (minor 7).
- The four kinds of content with a source on every line, and standard texts inserted word for word through markers that the AI never writes. Round 3 supports this directly: every duty and standard block kept.
- Verify after every write, with one repair pass and the rest shown as checks. Facts at 100% and invented content at 0 as thresholds for the evaluation set.
- Formality (vous or tu, Sie or du) as an organisation setting, not the model's choice. This follows the round 2 and 3 findings.
- Writing directly in the job's language, translation with line-by-line review and staleness tracking, and an English interface.
- Kimi K2.5 for writing and Gemma 4 for extraction and checks, as the current direction, subject to S8.
- Proposal B's list of hard dependencies (Paddle, Vercel Pro, the domain, email authentication) and its honesty that the launch will come later.
- The way it is made official: a docs pull request that amends section 7 and the ledger, with each build step keeping its own plan, approval, and review.
