# AidJobs — employer side: plan and demo

**Status:** agreed with the user on 3 November 2026, in chat, after three rounds of questions. This file is the plan for a **design demo only** (W-51), built the way UX-00 was built: its own branch (`demo/employer`), never merged, sample data only, no backend, approved by the user on their phone. Nothing here approves building the employer side in production. Each production step later needs its own investigation, plan, and merge approval, and the contract changes listed in section 2.

The demo is separate from the order of work in `growth-and-seo-plan.md` (section 7). It does not move the launch work, but it uses the same working hours (estimate in section 12).

**Independent review, 3 November 2026** (read-only agent, before the build): approve with changes. Its corrections are applied below. The user then decided its two open points the same day: this plan is recorded on `main` in one docs-only pull request, an exception to folding records into code pull requests, because the demo's code is never merged; and the demo does not count toward the ledger's limit of two code streams, because it is never merged, changes no production code, and has its own working copy.

## 1. What the employer side is

Organisations sign in, write a job description with a chat-based generator, optionally send it for review and approval, choose Standard (free) or Premium (paid), distribute it through AidJobs Reach, and publish it on AidJobs. Then they manage it with a few high-value actions and automatic lifecycle steps. AidJobs stays a discovery site: the apply button always goes to the employer's own application page or address (contract §2).

## 2. Decisions, and the rules they change

| # | Topic | Decision (user, 3 November 2026) | Rule it changes for production |
| --- | --- | --- | --- |
| E1 | Scope | Employer accounts, employer publishing, the JD generator, email distribution, and payments are designed in the demo | Contract §2: "Users do not submit career sources", and user accounts and payments are out of scope. A recorded scope decision before any production build |
| E2 | Advertising | "No ads" means no display advertising. Paid sponsored listings (Premium) for jobs employers publish are allowed, always labelled | Growth plan decision 12, and UX-08 item 8 ("no ads or payments at launch") |
| E3 | Free option | 3 generated drafts a month; up to 2 Standard jobs live at a time, free | None beyond E1 |
| E4 | Pricing for the MVP | Free; Premium per job; credit packs of Premium jobs. Organisation plans later. Prices are placeholders until a check of comparable job boards | None beyond E1 |
| E5 | Premium includes | Featured section, highlighted card, placement on landing pages, a Reach email allowance, longer visibility, unlimited generator use for that job. No statistics in the MVP | The public Recommended order stays the same for every visitor; Premium is a separate, labelled section (UX-08 item 2D) |
| E6 | Payments | Paddle, as merchant of record: it charges, handles sales tax and VAT, and sends the invoice and receipt. The MVP accepts payment and provides an invoice; refunds, tax details, and the rest are decided later | Vercel Hobby is non-commercial only: Vercel Pro before any live payment (UX-08 item 8) |
| E7 | Generator | Chat only: no form, no role picker, no template picker. AI or template-based is decided later; the demo shows simulated output | UX-08 item 2E keeps AI features out of scope (the crawler's no-AI rule, contract §10, is not touched); a chat generator effectively needs AI, so production needs an AI decision (provider, cost, data sent) |
| E8 | Roles | Optional. A single user does everything. When someone is invited: Owner, Member (create, edit, publish), Reviewer (comment, approve) | Contract §2 (accounts); rule 9 ("never introduce a second production authentication system") and §14 ("one administrative actor … do not build a role system"): employer sign-in and roles need their own design next to the admin's |
| E9 | Review and approval | Optional, per organisation setting; can always be skipped by someone allowed to publish unless the organisation requires it | None beyond E1 |
| E10 | Reach | The user's brief "AidJobs Reach" (candidate invitations, team notifications, community sharing), as the last step before publishing; no notifications to AidJobs job seekers | Email sending is new infrastructure: provider, sender domain, outbox, consent rules (section 9) |

Other rules the employer side would change in production, found by the review (each a decision before any production build):

- **How jobs are written:** a "direct" source per organisation bypasses fetching and the crawl-run record (contract §3 and §5, where a source is a monitored address); it must still use the one admission step and writer (§8). Gate 8 (organisations) is a dependency.
- **Apply by email:** the contract rejects `mailto:` application addresses (§10) and rule 18 forbids inventing an application address; small employers often take applications by email. The demo uses an application web address.
- **Contact details:** recruiters' emails and phone numbers are never stored (growth plan 4.6); employer accounts, job descriptions, and Reach recipients all carry emails, so storage, retention, and deletion need a decision.
- **Lifecycle:** Close now, Withdraw, Position filled, and Hire again are new lifecycle transitions beside the expiry rules (contract §6, growth plan 4.3). "Removal" means the public page is removed; the record stays.
- **Identity:** a changed title is a new job row with a new address (contract §7, growth plan decision 7), so "Updated" on an edited live job applies to edits that keep the identity; a title change needs its own rule.
- **Moderation:** decision 12 says submissions are "moderated, for organisations without a recruitment system"; this plan covers all organisations, so AidJobs' moderation (a queue, or verification first) is part of the production design.
- **Advertising and hosting:** the contract §2 amendment of 30 October 2026 says "no advertising", and growth plan section 8 ties Vercel Hobby to having no ads; both are updated with E2 and E6.
- **The public site's specification:** the approved public demo is the specification (UX plan, revision of 21 October 2026, item 7); a Premium section and highlighted card on the public site are a new recorded difference.
- **Payments endpoint:** Paddle's webhook is a new public backend endpoint, a security boundary with its own review.

Also decided by the user in the same conversation, for `main`'s records (they are not employer-side decisions): the launch comes at **about 2,000 open jobs**, with thousands as the goal after launch (amends growth plan decision 6; server-side search, UX-11, still comes before launch, because 2,000 is above UX-08 item 10's 1,500 threshold).

## 3. Pricing (placeholders)

- **Free:** 3 new drafts a month (a draft is one new job conversation; rewrites inside it do not count, up to a fair-use cap); up to 2 Standard jobs live at a time; Reach community sharing only.
- **Premium job, per job:** everything in E5, and a Reach email allowance (for example 50 emails).
- **Credit packs:** for example 5 or 10 Premium jobs at a discount, valid 12 months. Per-job payment with an invoice suits NGO finance teams.
- **Later:** organisation plans (monthly or annual) with unlimited drafts, roles, approvals, and monthly credits.

The demo shows placeholder prices, labelled as such.

## 4. The generator: chat first

- A chat on one side and the job description as a live document on the other; on a phone the chat fills the screen and the document is a sheet that slides up.
- The box shows **ghost text** suggesting what to write; a suggested completion appears as the user types, accepted with the → key at the end of the text or the "Use suggestion" button, never Tab (Tab keeps moving focus). The document and the fact strip can always be edited directly, so nothing depends on the chat alone; changes are announced to screen readers.
- **Section tags:** as soon as a role is recognised, the tags it needs are suggested ("Recommended for this role"); the user taps to add or remove; at least 3. Groups: Core (responsibilities, qualifications, competencies), UN style (organisational setting, assessment, no-fee notice), Sector (safeguarding, security context, donor compliance), Legal (the organisation's fixed text, which can be locked).
- **Fact strip:** the structured facts job pages, filters, and Google's job listings need (title, location, contract, grade, deadline, salary, languages) are read from the conversation and shown above the document; a tap corrects one. A missing required fact is asked for in the chat with quick replies.
- **Styles replace templates:** a style is a saved set of tags and a tone. "UN style" is AidJobs' own; an organisation's custom styles come from its brand settings. One tap applies a style.
- **Editing** by chat ("shorten the responsibilities", "add French as required") or in the text; changes highlighted; every version kept and comparable.
- **Quality checks inline:** missing salary or deadline, wording that excludes people, length, readability, "ready for Google's job listings", and a near-duplicate of a job already live.
- **Template content** is written by AidJobs. Section structure may be learned from the jobs AidJobs collects from employers' own sites (once W-37 stores descriptions); text is never copied from other job boards.

## 5. Home: a briefing, not a table

- The home screen is the chat box and a short **briefing** of what needs this person today, each item a one-tap action ("Amina approved the Finance Officer: publish now?", "The WASH PM closes in 3 days: extend or let it close?").
- A **decision inbox** replaces a notification bell: approvals, comments, deadlines, automatic removals, and receipts, each actionable where it appears; the same in a daily email.
- Each job is a **lifeline**: one line from draft to review, live, closing, and closed, with a pulse where it needs attention.
- A **10-day deadline strip**, as on the public site.
- **Ask to act:** the chat also manages jobs ("extend all Nairobi jobs by a week"); every action shows a confirmation card first.
- No charts: statistics are out of the MVP.

## 6. Managing jobs

- **Automatic by default, one tap to override:** auto-close at the deadline; three days before, "Extend, or let it close?"; automatic removal announced in advance, with a copy to download (closed page first, then removal; the description dropped 90 days after closing, growth plan decision 5).
- **Few actions, by state:** live — Extend, Close now, Edit, Re-share; closed — Hire again (reopens the role with fresh dates); any time — Position filled (closes early, and optionally tells the people it was shared with).
- **Same role, another place:** variants for other duty stations.
- **Organisation memory:** published jobs feed the organisation's own role library; next year "WASH PM" suggests last year's version.
- **Smart warnings:** a deadline too short for the role, or on a weekend or public holiday at the duty station.
- **Editing a live job** shows what changed, and the public page shows "Updated".
- **Phone:** swipe right to extend, left to close, always with visible buttons for the same actions; every action can be undone from a notice that stays until dismissed or replaced (no short time limit).
- Drafts can be deleted; live jobs are closed or withdrawn, not deleted, so links already shared keep working.

## 7. Optional review and approval

- Organisation setting: approval **off** (default), **required for all jobs**, or **required for some** (for example senior grades).
- Reviewers: team members (signed in) or outside people through a private link for one person that expires (for example after 7 days), without an account.
- A reviewer comments on a section, suggests an edit (shown like tracked changes), or edits directly if allowed, and finishes with **Approve** or **Request changes**.
- The author receives each response by email, in the decision inbox, and as the job's status ("2 of 3 approved · due Friday"); a review panel lists comments and suggestions on their sections, to accept, reject, or resolve; every round is a version; a new request highlights only changed sections.
- Rules: any one or all approvers (organisation setting); a review deadline with reminders; an owner override, logged with a reason; an approval covers one version, and a later content change resets it unless marked minor.
- The demo has a **"View as reviewer"** switch, so one person can play both sides on one phone.

## 8. Premium, payment, and publishing

- Before publishing: **Standard** or **Premium** (or a credit from a pack). Premium opens Paddle's checkout.
- **Demo:** Paddle's **sandbox** (no real money), its real checkout window with test cards, and its emailed receipt, when the sandbox settings are present (`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, a client-side token designed to be public, and the sandbox price IDs). Without them, a simulated checkout, labelled. Unlocking Premium after checkout is simulated in the page, because the demo has no backend. Safeguards:
  - the settings are set in Vercel for **Preview, branch `demo/employer` only**, never Production, and never in a tracked file;
  - the code fixes the sandbox environment and refuses to start Paddle unless the token begins with `test_`;
  - Paddle's script (`cdn.paddle.com/paddle/v2/paddle.js`) loads only on the checkout screen, with no npm package;
  - nobody signs in to the admin on the demo preview, because an outside script runs on the same origin as the admin proxies;
  - sample data uses `example.org` addresses and nothing shaped like a key, so the secret scan stays clean.
- **Production, later:** the backend receives Paddle's webhooks, checks their signatures, and records what each organisation has paid for; Paddle approves the business and the live site first (expected to need `aidjobs.app`, a pricing page, terms, a refund policy, and a privacy page); job listings confirmed as an accepted product during Paddle's onboarding; Vercel Pro.
- Publishing: now or scheduled. The success screen keeps "published" separate from "emails queued"; an email failure never unpublishes a job.

## 9. AidJobs Reach

The user's brief, with its three channels, as the last step before publishing: **invite people to apply** (candidate invitations), **activate your team** (team notifications), **share with your community** (copy link, copy message, WhatsApp, LinkedIn, the phone's share menu). Recipients as chips with validation and a count; both email templates previewed as real emails; an editable introduction; channels chosen freely or skipped ("Skip & Publish").

Refinements: team emails limited to addresses on the organisation's own verified domain; candidate invitations can also be sent from the employer's own email app instead, to reduce the risk of unsolicited mail (EU and Canadian rules in particular); recipient limits per job; opted-out addresses suppressed; nothing about recipients is ever public. In the demo nothing is sent: queueing and delivery are simulated and labelled. Production needs an email provider, `aidjobs.app` with SPF, DKIM, and DMARC, and an outbox table worked through by the existing scheduler (no second process; growth plan decision 3).

## 10. Organisation, verification, and the public side

- **Set-up:** logo, type, headquarters, countries, sectors and SDGs (the same fixed lists as the title-facts module, W-42), an "about" text, brand style (from a careers-page link or a pasted sample), standard legal text (equal opportunity, safeguarding and PSEA, data protection, no-fee notice), and the approval setting.
- **Verification:** an email on the organisation's own domain, a charity register number, or an IATI ID; verified organisations carry a badge. Fake vacancies that charge candidates fees are a known problem in this sector.
- **Claiming:** an organisation AidJobs already crawls claims its existing page instead of creating a second one (one primary source per organisation, growth plan decision 11).
- **Public side in the demo:** the labelled Premium section above the list, the highlighted card, and the job on the organisation's page.
- Reading a careers page for brand style in production is a fetch of a user-supplied address: signed-in employers only, one page, through the shared fetch policy (contract §9; the removed Find & Earn fetch is not revived).

## 11. The demo

- **Where:** branch `demo/employer`, from `main`; route `/employer-demo` in the frontend; linked from nowhere; never merged. The draft pull request is titled "DO NOT MERGE".
- **Do not index, fixed in the code:** the demo's layout sets `robots: { index: false, follow: false }` itself, as `/v2` does, so no setting can make it indexable; it is not in the sitemap and not blocked in `robots.txt` (a blocked page's "do not index" is never read).
- **Real:** the screens, the interactions on phone and desktop, light and dark, and Paddle's sandbox checkout when configured.
- **Simulated and labelled:** sign-in, AI generation, suggestions, email sending and delivery, notifications, fulfilment after payment, the reviewer's side. Every screen carries a "Demo" mark; all data is sample data with an obviously fictional organisation marked "Sample" (job "Programme Manager – WASH", Nairobi, closing 30 November 2026), kept in the browser only under `aidjobs.employerDemo.*` keys, with a "Reset demo" control.
- **No call to the AidJobs backend, enforced:** demo code imports nothing that fetches (no API helpers, no shortlist, no `PublicSite` data loading); the public-side screen shows sample jobs only, so a sample Premium job never appears next to real employers; a test renders every demo screen with `fetch` set to fail. The only outside service is Paddle's sandbox, which emails a test receipt to the address the tester types.
- **Other safeguards:** no production data, no AidJobs email sent, no secret in the repository, no change outside the demo route, its components, and its test. The user opens the preview through the Vercel login; Deployment Protection stays on and no shareable link is made.
- **Screens:** sign-in; organisation set-up; home (briefing, chat, lifelines, deadline strip); a generator conversation; optional review (author and reviewer); preview (job page, Google result, share cards); Standard or Premium with checkout; Reach; publish and success; managing jobs; the public side.
- **Checks before showing the user:** type check, lint, the frontend tests (including the no-fetch test), and a production build; screens at 360, 390, 412, and 1366 px; light and dark; a keyboard-only pass and a screen-reader pass against WCAG AA. Then a Vercel preview, approved by the user on their phone, in rounds.

## 12. Estimate and what comes after

About 8 to 12 working days for the demo, in rounds. After approval, the demo is kept at a tag, as UX-00 was. Production work starts only after launch (growth plan, step 8: employer submissions first), with the contract changes in section 2, the AI decision (E7), the email set-up (section 9), the payment set-up (section 8), and a plan per step.

## 13. Open, for later decisions

- Real prices, the Reach email allowance, and the credit-pack sizes.
- The AI provider and its cost limits (E7).
- Refunds, tax details, and organisation plans (E6, E4).
- Whether Standard jobs are limited to verified organisations later.
- How employer jobs reach the jobs table in production: through a "direct" source per organisation and the same admission and writer as crawled jobs (contract §8; recommended), so employer jobs get the same fields, expiry, and job pages. When an organisation that AidJobs crawls claims its page, which source is primary (growth plan decision 11).
- Legal and product risks to settle before production:
  - **unsolicited email:** AidJobs sends candidate invitations, so CAN-SPAM, Canada's CASL, and the UK and EU e-privacy rules apply; Reach email only for verified organisations, because it is also an abuse route that can damage the sending domain;
  - **recipient data:** AidJobs processes recipients' emails for the employer: a data-processing agreement, a retention period, and deletion;
  - **paid placement:** one consistent "Sponsored" or "Premium" label, as consumer-protection rules expect (FTC, CMA, the EU's unfair-practices rules, and the Digital Services Act once AidJobs hosts employer content);
  - **AI:** the generator must not invent facts; what is sent to the provider; the EU AI Act, where recruitment is a listed high-risk area;
  - **reuse of crawled text:** learning section structure from crawled descriptions respects each source's reuse terms (growth plan decision 5);
  - **fraud:** moderation, "Report this job", and verification before Premium;
  - **sanctions:** Paddle cannot serve some countries where NGOs work.

## 14. Round 2: the Create a job page (agreed with the user, 3 November 2026)

Agreed in chat after research on about 50 organisations' real adverts (2026): UN Secretariat, UNICEF, UNDP; Save the Children, World Vision, Plan International, SOS Children's Villages, ChildFund; ActionAid, Oxfam, CARE, Christian Aid, Islamic Relief, Concern; MSF, IRC, NRC, DRC, Mercy Corps, Action Against Hunger, IFRC, ICRC, British Red Cross; GIZ, FCDO, the EU, the Global Fund, Gavi, the Gates Foundation, the Aga Khan Foundation, DAI, Chemonics, FHI 360, Palladium, Abt, Tetra Tech; BRAC, Amref, Kenya Red Cross, Pratham, and local NGOs in Nigeria, India, Uganda, and Syria; UK, US, and Australian charities. Also ReliefWeb's job fields, Google's job-posting fields (schema.org JobPosting), and research on candidates and recruiters (Indeed, SHRM, iHire, Textio, Gaucher, Friesen and Kay 2011). Canada and BRAC International were not covered.

- **Navigation:** sign-in lands on **Create a job**, first in the side menu (about 216 px wide, demo only); the old home becomes **Overview**, second.
- **First screen (revised with the user, 4 November 2026):** one screen with no page scrolling. No line under the heading. One "Describe the role" box with sector ghost text, holding three tools; a **click** opens each menu, below the box or above it depending on the room on screen; options are names only, without icons, and the details show in a tooltip on hover. **+**: Upload your format (one past advert pasted or uploaded, or the careers-page link read once; its past ReliefWeb adverts come later; with none, the closest real format for its organisation type), upload or paste a job description or terms of reference, a **link to a job description** online (read once like the careers page), and hire again (past jobs by title). **Select a format**: the format names by family, the pill then showing the chosen one; first, **Create your own format** (a name, blank or from any format, sections by group, headings edited and put in order by dragging, a tone; saved under "Your organisation" for reuse; also on the Styles page and in the Structure panel, as a link and at the top of its style list). Sections in the Structure panel are also reordered by dragging; the handle takes the arrow keys too. **Continue**: only when a draft or approval waits. Under the box, on one line, **Add:** pills offer up to five high-value sections the chosen format and the facts leave out (what we offer, selection process, first weeks, team, working relationships, practical needs), the full heading and purpose on hover, added with one click. The Add: pills are on this first screen only; in the workspace, sections are added from the Structure panel (the user, 4 November 2026). **Market context** from AidJobs data is one line (sample figures in the demo, labelled). The "What strong adverts include" checklist was dropped. No voice input, no generic chips. Focus rings are light and follow each control's rounded corners.
- **One screen, no page scrolling:** one top row of facts (six pills: place and work arrangement, type, grade or band on the organisation's own scale, closing date with time and zone, salary, and More: who can apply, safeguarding contact level, direct reports, start date, positions, donor and project); the left pane is the job description with the chat docked under it; the right pane, **Structure**, is open on a first visit, collapsible, and behind a draggable divider.
- **Type:** engagement (Job, Consultancy, Internship or fellowship, Volunteer; ReliefWeb's and the UN's categories) → contract (staff: fixed-term, temporary, continuing; non-staff: consultant, individual contractor; volunteer) and hours → **recruitment**: specific vacancy (with "subject to funding"), roster or talent pool, or proposal stage (contingent on award). Each choice changes the wording and the public label, and maps to Google's employment types.
- **Styles, named by format:** UN Secretariat; UN agency; INGO role profile; INGO purpose-led; "About you" narrative; humanitarian field profile; government donor; development contractor; local NGO concise; domestic charity, in four families. Each uses the real headings and order; the organisation's own format comes first; any section can be added to any style.
- **Five groups:** About the employer; The job (responsibilities may carry weights); The person (essential and desirable; practical requirements such as local language, licence, residence, travel); The offer and conditions (pay, benefits, field conditions, funding conditions); Applying. **Commitments** are one folded, lockable row, inserted word for word from the organisation's own text (safeguarding and PSEA, Misconduct Disclosure Scheme for members, background checks by country, counter-terrorism checks, no-fee and fraud notice, equal opportunity and inclusion, faith identity, charters, encouragement statements, data protection, right to work).
- **Salary:** a neutral pill; hover facts are positive only (Indeed: 3.8 times more applications with an employer-provided salary; SHRM 2023: 70% of organisations listing ranges saw more applicants); display defaults by organisation type; a suggestion only with a stated basis (own scale; official scales: ICSC and UN local scales, Australia's award rates, the UK Real Living Wage; public benchmarks; AidJobs data above a minimum count); pay-transparency laws shown as information, never a block.
- **How to apply builder:** method (system, email, form, form only), documents, email rules, and process (rolling, may close early, shortlisted only, interview dates, reply time, anonymised CVs).
- **Checks:** leftover placeholders, empty duties, duplicated bullets, heading typos, conflicting deadlines. **Inclusive language** is highlighted with hover text saying why and a possible alternative; nothing is replaced automatically and the decision stays with the user. Context-aware: years of experience are not flagged in UN formats, where grades set them; genuine requirements (female-only posts in some contexts, nationals only, local language) are accepted with a one-line reason.
- **Later, on the publishing page:** a short version for WhatsApp, LinkedIn, or flyers, and local-language versions.
## 15. Round 3: decisions of 4 November 2026 (agreed with the user in chat)

Agreed item by item with the user after their review of the round 2 preview; supersedes section 14 where they differ. Build in the phases at the end of this section and tick them off here as each lands on `demo/employer`, so this section is the handover if the chat is lost.

### Item 1: help while typing in the chat box

1. **"Use suggestion" is removed.** No sample facts are ever inserted (the old fixed hints "WASH Programme Manager", "Nairobi", "12-month", a date are gone, and with them the bug where the ghost text followed the user's own words: "hiring a We're hiring…").
2. **Predictive completion** continues the word or phrase being typed: the organisation's own jobs first, then AidJobs titles, duty stations, grades, and contract terms; it never invents facts. Accepted with Tab (only while a completion shows) or the right arrow; tap on phones.
3. **One "next most important fact" slot** in the box shows a single missing fact at a time ("+ Closing date") and opens a small picker (calendar, place search, contract list); it disappears when nothing important is missing.
4. **Continue (job drafts) moves into the + menu.** The bottom row is: + · JD format · fact slot · Send.
5. **Readiness ring on Send:** fills as role, place, closing date, and contract arrive; hover lists what is missing; sending is never blocked.
6. **Recognised facts** in the text get a faint underline (place, date, grade, contract); hover shows how AidJobs read them with any useful note (high-risk duty station, weekend closing date); a click corrects them.
7. **Drop a file on the box** to read a job description (no control until a drag).
8. **Smart paste:** a long pasted job description prompts "Read this as a job description, keeping your wording".
9. **Example placeholders** in the empty box rotate realistic examples from the organisation's own sectors and places.
10. **Organisation memory:** the fact slot can offer one-click defaults from the organisation's past jobs, labelled as such ("Same as your last Juba job: 12-month fixed-term, P3").

### Item 2: the job workspace

- **A. Tooltips:** fixed once in the shared tooltip for the whole site: the preferred side, else the opposite side, else the others; never covering what it describes (a left side is added). Browser `title` tooltips move to the shared tooltip; every tooltip on the site is checked.
- **B. Explicit terms**, one glossary checked across the demo and later the public site: **JD format** (the reusable template; "job description format" in full text), **JD outline** (a job's own sections), **job description** (never "the description"), **job drafts**, named labels in place of "More" ("More details"), and **Manage jobs** for the side-menu item, with full names on hover in the narrow side menu. The list of vague labels is shown to the user for approval before changing them.
- **C. Long job titles:** edited in place as the job description's heading (full width, wrapping); the top row shows a shortened label with the full title on hover, and a click jumps to the heading. No new rows.
- **D. Fewer header bars:** on the workspace the demo bar goes ("View as" and "Reset demo" move to the bottom of the side menu). The left column has one slim row (back, title label, fact pills); the right panel runs the full height: actions (Publish with a count of open checks, Send for review, Versions, a ⋯ menu), the status line ("Draft", "In review · 1 of 2 approved"), the tabs, then the JD format and the JD outline.
- **E. Conversation:** results show on the changed section ("Shortened · Undo · See in chat") with a brief highlight; a slim chat line under the job description grows only while typing, with AidJobs' current question in one line above it and quick answers; the right panel has tabs "JD outline | Chat" and switches to Chat while the user types; on phones, JD outline and Chat open as half-height sheets so the job description stays visible. Reviewers see "Comments" in place of Chat.
- **F. Live draft:** the job description builds as facts arrive, with clickable placeholders for missing facts ("[Closing date]"); no "Write the description" button; the empty-state card, the separate checks row (now a count on Publish plus highlights in the text), the "Conversation · N" toggle, and the Standard/Premium badge (now at the publish step) go.
- **F. Free job descriptions:** shown as outcomes, "Free: 3 job descriptions a month, with unlimited edits to each"; one counts at its first use (published, sent for review, or downloaded); exploring and editing are free. Inside, a quiet fair-use token budget per job description caps cost if AI is used (a plain message, never a meter); at most about 10 open drafts; paid packs stay outcome-based or fold into the existing credit packs (one currency). Replaces "3 drafts a month" in section 4; settle together with the AI decision.
- **G. Base JD format prompt:** "Your last 3 job descriptions share these headings. Use them as your base JD format?" with **Use it · Edit it · Not now**. Learned only from the organisation's own job descriptions in AidJobs (written, uploaded, or published) once two or three share most headings in the same order; never from links or careers pages, nothing read in the background. The base is the default start for new jobs; each job changes freely without changing it; "Update our base JD format from this job" is offered from ⋯, never automatic. "Not now" is respected (it returns only if the pattern grows); "Forget" on the Styles page. Organisations with no pattern (many local NGOs) never see it. Named formats sit beside the base. The demo shows it with sample history, labelled.
- **H. Delete:** "Delete job draft" in the workspace ⋯ menu with Undo; drafts in review get "Withdraw from review and delete" (reviewers are told); it also stays on Manage jobs.

### Item 3: uploading

1. **One "Upload a job description" window**: paste text, a file (.txt, Word .docx, PDF), or a link sent with the arrow button (like the chat box); short text with details in an (i) tooltip; plain notes when a file cannot be read (old .doc, scanned PDF). In the demo, files are read in the browser and links are simulated; nothing leaves the browser.
2. **"Save its headings as a JD format"**: a checkbox with a name field, unticked by default; several named formats per organisation.
3. **Links are per job only**: no organisation-level careers-page learning; the sample "learned from 4 adverts" format goes; the old "Upload your format" and "Use a job description from a link" windows merge into this one.
4. **The + menu**: Upload a job description · Hire again · Continue a job draft.
5. **The workspace layout and journey** as in Item 2, to be adjusted after the user sees the live preview.

### Already built on 3 and 4 November 2026 (kept)

Click-only menus with names only and details on hover; "Create your own format" first in the menu and in the panel; drag to reorder (handle, mouse or touch, arrow keys); one-line "Add:" pills on the first screen only; light, rounded focus rings; the suggestion alignment fix (last code commit `d8be0a3`).

### Revision after the user's review of phase 2 (4 November 2026, afternoon)

The chat is redesigned and built together with phase 3:

- **The chat is its own panel.** A labelled rail on the far right, always visible, has two buttons with an icon and a full-strength label, **JD outline** and **Chat**; each opens its own resizable panel, one at a time; the Chat button shows a badge when AidJobs has a question waiting. The whole chat, including the input box, lives in the Chat panel; the job description column has no chat box. The actions (Publish, review, versions, ⋯) and the status line sit at the top of the open panel, or in the left top row when no panel is open.
- **Pressing Enter on the first screen** opens the workspace with the Chat panel open and its input focused.
- **Answers inside the question:** a place search for "Where is the job based?", a calendar for the closing date, contract choices for the contract. Quick picks must be relevant, each with its reason on hover, and none when nothing relevant exists: for the place, what was typed, the countries the organisation works in (its profile), its past jobs, and where similar roles are posted on AidJobs (sample figures in the demo), with "Remote" only for roles that can plausibly be remote; for the closing date, how long similar roles stay open, moved to a working day in the duty-station country, plus 2 and 4 weeks; for the contract, by organisation type and role. Free text always works; "in Kashmir, India" or "based in …" is accepted even when the place is not in AidJobs' list, so a question is never repeated.
- **Spelling:** a gentle "Did you mean Education Specialist?" for job titles, in the chat and under the title; never changed automatically.
- **Phase 3 lands with it:** the live draft (no "Write the job description" button; clickable placeholders "[Duty station]" and "[Closing date]"), predictive completion in the chat inputs, the readiness ring on Send, and the checks count on Publish. The first screen's fact slot and the underlined recognised facts move to phase 4.

### Build phases (tick when pushed)

- [x] **Phase 1, quick fixes** (done 4 November 2026; the user approved the label list; Word and PDF are read in the browser with `mammoth` 1.13.0 and `unpdf` 2.1.0, the runtime audit clean; the old "learned from the careers site" prompt is removed and the sample base JD format is recast as confirmed from the organisation's own job descriptions; the shared tooltip fix in `components/site/Tip.tsx` reaches the public site only through its own pull request on `main`, still to do): the tooltip fix (A); the terms glossary (B), after the user approves the list of labels; "Delete job draft" in ⋯ (H); "Manage jobs" with hover labels; the + menu restructure and the one upload window with .docx and PDF (Item 3); "Use suggestion" removed (Item 1.1).
- [x] **Phase 2, workspace layout** (done 4 November 2026; on phones the top bar stays because it holds the menu button, and "Earlier versions" and "Send for review" sit in the ⋯ menu so the top row fits; reviewers see no Chat tab; "Comments" in its place is still open; the side menu's new footer slot in `components/site/SideMenu.tsx` is demo-only until a pull request on `main`): no demo bar; the full-height right panel with actions, status, and tabs; the title edited in the document; the slim chat line with change notes; phone sheets (C, D, E).
- [x] **Phase 3, live draft, with the chat redesign** (done 4 November 2026, after one independent review whose findings were fixed: unreadable answers are asked again instead of being added to the text; a missing title is asked for; questions stay open until answered; Undo restores facts; placeholders are counted as checks and filled in edited sections; reviewers cannot edit; the old write path is removed; free job descriptions count at first use; screens narrower than 1024 px use the phone layout, with the chat and the JD outline as sheets): the labelled rail, the Chat panel with its own box, answers inside the question, the live draft with placeholders, the readiness ring, predictive completion, the checks count on Publish, spelling suggestions (F; Item 1.2, 1.5; the phase 2 revision).
- [x] **Phase 4, the rest** (done 4 November 2026, after one independent review whose findings were fixed: underlines stay aligned when the text scrolls; Forget does not bring the prompt straight back; memory repeats only the past job's own facts; the slot has a place search and a calendar; the organisation's own grade scale is recognised): the first screen's fact slot and the underlined recognised facts (Item 1.3, 1.6); the base JD format prompt from the organisation's own job descriptions, shown in the demo by three sample jobs that add an Assessment section (G); smart paste; drop a file; example placeholders; organisation memory (Item 1.7 to 1.10).

Open: the copy of this plan on `main` needs its own docs pull request when the user asks.
