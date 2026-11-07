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

**Visual revisions after the user's first look at phases 1 to 4 (4 November 2026, evening):** the closed right-hand rail is narrow (44 px, vertical labels) and disappears while a panel is open; the panel's header carries the switch between the JD outline and the chat; the chat box grows as you type, with the text above a slim row and a small, light Send button; Publish is smaller and light green rather than black, and so is the selected side-menu item; the active chat box has the same plain green border as the first screen.

**Order fix (4 November 2026, night):** the job description and the published job page always follow the JD outline's order. A section added from the outline or the chat goes at the end of its own group, not at the bottom; moving a section in the outline moves it in the document; jobs saved in the browser are put back in that order when the demo loads. No JD format's order changed.

**Review of the two pages (5 November 2026):** an independent review of the first screen and the workspace found eight problems, all fixed, and two short re-reviews of the fixes found more, also fixed (demo commits `e2efdfa` to `52addf1`):
- Undo never brings back old copies over later work.
- Any real change to the text, outline, facts, JD format, commitments, How to apply, or closing date withdraws approvals and sends the job back to review; changes that change nothing keep them.
- Reviewers cannot change a job by any route, but can open the outline and jump to sections.
- "Edit it" on the base JD format offer does not bring the offer back.
- Dialogs and menus manage focus.
- The chat reads whole messages: tone, length, undo, and section requests are understood from their phrasing; thanks and requests it cannot act on change nothing; content sentences are added.
- Also: a typed place gets its own country, "an Education Specialist", larger title target on phones, no delete on scheduled jobs, Enter in the place search.

Checked in the browser at 1366, 412, 390, and 360 px, in light and dark mode, including the phone sheets and dragging sections.

This section was copied to `main` on 5 November 2026 with the shared tooltip fix (Item 2, A). The side menu's footer slot stays on the demo branch until the employer side is built.

## 16. Round 4: publishing, paying, Reach, and review (agreed with the user in chat, 5 November 2026)

Agreed item by item with the user. It supersedes sections 8 and 9, and section 15's item F, where they differ. All prices are placeholders; the demo uses sample data and simulated AI.

### The idea

A paid job is not a listing but a hiring campaign that AidJobs writes, checks against the market, translates, and spreads, with the employer approving each step. It draws on what ordinary job boards lack: AidJobs sees the aid job market (the crawled jobs), knows the sector (formats, grades, duty stations, holidays), and reaches people (job seekers, the organisation's team and community). AI is used on the employer's text and its distribution, never to judge candidates (no CV scoring or ranking; the EU AI Act lists recruitment as high-risk). Every market figure comes from AidJobs' own data, with its count shown; where data is thin the feature says so or stays quiet. AI appears as suggestions with one-tap actions inside the flow, not as another chat.

### Decisions

1. **Free:** 2 jobs per calendar month, in the organisation's time zone (from its headquarters); counted at first use (published, sent for review, or downloaded); per organisation, not per person; no carry-over; listed 60 days; standard placement. The terms are shown on the Free choice itself, with a one-time "I understand" the first time an organisation publishes a free job, and on the Billing page. Replaces "2 free jobs live at a time" and "3 job descriptions a month". Scheduling a job for the 1st of next month uses that month's allowance, and is offered when the month's two are used.
2. **Free or paid, nothing in between:** no paid Standard job, no credit packs. Beyond the two free jobs, every job is paid.
3. **The paid offer:** US$28.40 per job; listed 100 days; featured placement; Reach emails; the market check, the full advert check, language versions, and the field-post notice. Working name **Amplify** ("Publish free", "Amplify and publish"); the user may still rename it. "Reach" stays the name of the outreach feature inside it.
4. **Public badge: "Actively hiring".** A paid job tells candidates the employer is looking now, the job comes straight from a verified organisation, and its details are checked. The paid placement is still disclosed, consistently: the badge's hover text reads "Promoted by the employer · posted directly by a verified organisation · details checked by AidJobs".
5. **Packages (placeholders):**

   | Package | Rule | Price | Per job |
   |---|---|---|---|
   | One job | paid when it is published | US$28.40 | 28.40 |
   | 3 jobs | used within 2 months | US$66 | 22.00 |
   | 5 jobs | used within 3 months | US$100 | 20.00 |
   | "Always hiring" subscription | 3 jobs each month; unused ones lapse; extra jobs US$18; cancel any time | US$54 a month | 18.00 |

   Unused package jobs lapse, after reminders 2 weeks and 3 days before the end. A package job can upgrade a live free job. A free job once used is never given back, whether the job is later paid for or upgraded; the free jobs come back each month (the user, 5 November 2026, after phase 1). Prices are the same for every type of organisation.
6. **Before publishing:** free jobs get the writer and the basic advert check (clarity and inclusion); paid jobs add the **market check** ("How does your job compare?": similar open jobs, their closing windows, languages asked, clashing deadlines, each point with a one-tap fix), the **full advert check** (unrealistic requirements and missing pay information, compared with similar jobs), **language versions** (French, Arabic, Spanish, Portuguese; reviewed by the employer; each a version of the public job page), and a **field-post notice** (a printable one-page flyer with a QR code, in the chosen language).
7. **Reach is prepared before publishing and sent at go-live:** for a paid job, an optional row in the publish panel ("Reach: invite people when it goes live · 0 people") opens the AI-written invitation and team email, edited inside their preview, with the people to send to. The main button states the whole outcome ("Amplify and publish · invite 12 people when live"). The job publishes first and the emails go as soon as it is live, so the link works; a scheduled job sends on its date. Afterwards the job's page shows what was sent, and simple reminders for each job (a few days after publishing, halfway, 5 days before closing, after an extension) invite more, in the home briefing and on the job's page, with an off switch per job.
8. **Free jobs share the link only:** after publishing, the job's public link with "Copy link", and a quiet "Amplify to invite people directly". Sharing to WhatsApp, LinkedIn, and the rest happens from the public job page, for everyone. "Send from my own email" is removed.
9. **Approval override:** only where approval is required; only the owner or an admin; a quiet "Publish without approval" link opens a small dialog asking for a reason; logged in the job's history (never public); the reviewers asked are told. An organisation setting, "Nobody can skip approval", removes the override.
10. **Ask to pay:** for a person who publishes but does not pay (finance or the director holds the card). It sends that person a request ("Grace asks you to pay US$28.40 to publish Finance Officer – Juba"); they pay from a link; the job publishes once paid. It carries a tooltip, because it is otherwise confusing.
11. **Payment:** a labelled simulated checkout now; Paddle's test checkout plugs in later without changing the screens. A failed or closed payment leaves the job a draft, with "Try again" or "Publish free instead".
12. **Refunds:** a published refund policy that offers no refunds (beyond what the law requires).

### Build phases (tick when pushed)

- [x] **Phase 1, the publish panel and pricing** (done 5 November 2026; Standard, Premium, the 5-credit pack, and the Paddle sandbox wiring are removed, the checkout is simulated and labelled, with a "declined card" button to show the failure path; the free allowance runs by the calendar month at the organisation's headquarters, taken from its country, Nairobi in the demo; a free job once used stays used when the job is later paid for or upgraded (corrected by the user the same day); only the owner can skip approval, because the demo has no admin role yet; the package reminders appear in the home briefing from 2 weeks before the end; the old Reach step is gone until phase 3; saved demo data starts afresh, under a new storage key): one page instead of four steps: the preview (job page, Google result, share cards) beside the choices, Free (with its terms) or Amplify, "Hiring more? Plan ahead and pay less per job" opening the packages, and one main button whose words say what happens; the simulated checkout and its failure path; upgrading a live free job; the approval block with the quiet override and the "Nobody can skip approval" setting; a Billing page (the month's free count and reset date, the package or subscription balance and end date, receipts).
- [x] **Phase 2, before publishing** (done 5 November 2026; a "Before you publish" panel above the preview, with four rows: the advert check for every job, and the rest marked "With Amplify" until it is chosen. The market check and the full advert check use a labelled sample of similar open jobs, the same every time for a role and a place, kept thin for communications and climate roles to show "too few to compare"; each point has a one-tap fix with Undo, and a fix on an approved job sends it back to review. Language versions: the demo has no AI, so headings, the demo writer's standard sentences, the sample organisation's "About us", dates, and country names are translated; other lines stay in English, marked, in a line-by-line review; commitments stay as the organisation wrote them; Arabic reads right to left; only reviewed versions that match the current English appear, and only on amplified jobs. The field-post notice is an A4 page with a QR code, printed or saved as a PDF from the browser, in English or a reviewed language; the QR code uses `qrcode-generator` 2.0.4 (MIT, no dependencies, pinned), the runtime audit clean. Also: the article rule for acronyms said as words, "a MEAL Coordinator"): the market check from a labelled sample of similar open jobs; the advert check; language versions; the field-post notice.
- [x] **Phase 3, Reach** (done 6 November 2026; for Amplify, an optional row on the publish page opens the people to invite and the two emails, the user's brief wording as the first draft, edited where they appear in their preview; the main button adds "invite N people when live"; the emails go when the job goes live, on its date for a scheduled job, and nothing goes for a free job; team emails only to the organisation's domain, an unsubscribed sample address and people already invited are skipped, and 50 Reach emails a job (a placeholder) cover every round; the job's page shows what was sent round by round, "Invite more", and reminders after an extension, 5 days before closing, halfway, and a few days in, also in the home briefing, with "Not now" and an off switch per job; free jobs end with the link and "Amplify to invite people directly"; the share buttons moved to the public job page, for every visitor, and "Share" in Manage jobs gives the link; saved demo data starts afresh again): the Reach row in the publish panel, messages edited in place, sent at go-live; the free link-only success; what was sent on the job's page; the simple reminders.
- [x] **Phase 4, review and Ask to pay** (done 6 November 2026; Review is a third view beside the JD outline and Chat, on the rail with a badge and as a sheet on phones, and reviewers see it in Chat's place; it holds the status, the rule and due date, "Remind" for reviewers who have not answered, the sections changed since the last round (also marked on the sections), every comment and suggestion with its section, accepted, rejected, or resolved by the author, and the reviewer's own comment box and decision; the review cards above the job description moved into it. Ask to pay: a quiet link under the main button, with a tooltip, sends a colleague or any address the request; the job waits, shown on the publish page, in its status line, and in the home briefing, with "Remind" and "Cancel"; the demo opens the payer's page from the link; once they pay, the receipt goes to them and the job publishes, or a live free job is amplified, with its Reach invitations; not while approval is still needed; paying yourself closes the request): review in the workspace's right-hand panel, a third view beside the JD outline and Chat, for the author and the reviewer; Ask to pay.

Then one independent review of the round, its fixes, and the user's look on the preview.

**Independent review of round 4 (6 November 2026):** "changes needed": 3 must-fix, 6 should-fix, 7 minor findings, all fixed with a regression test each (shown failing on the old code). A reviewer's late answer no longer takes a published job off the site; review happens only before publishing; a publishing date must be from tomorrow and before the closing date; skipping approval is recorded as "Approval skipped" and becomes "Published without approval" only once the job is published; closing a job closes its payment request; undo never "unsends" Reach emails; a cancelled subscription is resumed rather than bought again; an address in both Reach lists gets one email; Amplify needs a verified organisation by every route; radio groups take the arrow keys, and lines still in English on a language version are marked as English. A request for changes after an approval (decided by the user, 6 November 2026, on the agent's suggestion): under "any one reviewer", the approval stands and whoever publishes decides. The publish page, the status line, the home briefing, and Review show the situation ("Amina approved this version. Daniel then asked for changes: …") with "Look at the request" and "Publish anyway"; publishing anyway asks once, takes an optional reason, writes it to the job's history (never public), and tells the reviewer. An organisation setting, "Any request for changes pauses publishing" (off by default, shown with "any one reviewer"), makes such a request withdraw the approval until it is dealt with. Under "every reviewer", a request for changes withdraws the approval. The re-review of the fixes (same day) approved with changes: 15 of 17 fully fixed, and four new points, also fixed with tests: a reviewer's answer after the owner skipped approval replaces the skip; a late answer on a published job leaves no "changes requested" item waiting; a live free job cannot be amplified by an unverified organisation by any route; a payment made after its scheduled date publishes the job at once. Left for later: roving focus in the radio groups (they take the arrow keys).

### For after launch (recorded, not built now)

- Reach as a full campaign: a tracked link per channel and results by channel; campaign moments driven by data ("below similar jobs"); one-tap fixes explained by data (extend, translate, re-share, adjust the title); a weekly campaign summary email per organisation.
- Hiring memory ("You hire a Finance Officer in Juba about every 6 months; draft the next one?") and the organisation's own data on what works.
- A campaign promise (a free extension and Reach round when a paid job is clearly below similar jobs after 14 days), only once there is sizeable traffic from employers and candidates.
- Paid jobs sent to AidJobs job seekers whose job alerts match, once job seekers can opt in to alerts (changes E10).
- A refund policy beyond "none", and prices by type of organisation.
- Production needs: the AI decision (E7); Paddle products, packages, and subscriptions; market data from the crawler (counts and dates, within each source's reuse terms); per-channel link tracking; the email set-up (section 9); contract changes, each with its own plan.

## 18. To discuss: a usage allowance, and showing the plans (raised by the user, 7 November 2026; not agreed)

Recorded for a later discussion and plan. Nothing here changes section 16 or the demo until the user agrees it. Section 17 is round 5 (Manage jobs), agreed with the user on 6 and 7 November 2026 and kept on `demo/employer` until it is copied here.

**When (the user, 7 November 2026):** the demo round for this section is **round 6, after round 5**, in its own chat, once the points under "To settle in the discussion" are settled. Production follows the employer side's own order: after launch (section 12), with the AI decision (E7), the contract changes in section 2, Paddle, and the email set-up.

### The user's ideas

1. **Measure the free plan in tokens.** Estimate the average tokens one job uses, chat included, and give each organisation enough for about 2 free jobs a month; the allowance renews each month. Everything else stays as it is (JD formats, styles, and the rest).
2. **Stop and offer the plans when the allowance runs out,** as Cursor, ChatGPT, and Claude do: in the chat, or at key places such as publishing, Reach, and Amplify.
3. **"Upgrade" always visible:** on the main chat window, and in the side menu on the left.
4. **How paid use is counted after the free allowance:** the existing plans (per job, packs, the subscription), tokens, or a mix.

Why: counting "2 free jobs" has many variables (drafts, chat, uploads, edits), while token use is easy to measure. And the publish page is today the only place an organisation learns what the paid plan does; a new organisation cannot easily tell that it is on a free plan, what the free plan gives, what else exists, or how to get it. The whole design must be minimal and effective, never feel aggressive, and let organisations feel the value of AidJobs, free and more so paid.

### The agent's first view (for the discussion)

- **Count tokens, show outcomes.** Tokens are the right internal measure of AI cost, but they mean nothing to an NGO recruiter and a visible meter makes people ration. Show the allowance as jobs or a simple share ("Free this month: about 1 job's writing help left", or a thin bar), never raw tokens. This keeps section 15's "never a meter" and section 15 F's "one currency".
- **Two resources, not one.** AI writing costs money; a free listing costs almost nothing but is the value of the free plan. A job pasted or uploaded without the chat uses few tokens, so a token-only limit would allow unlimited free listings. Proposed: the token allowance limits AI help, and the free listings keep their own count (2 a month, section 16 decision 1), or one of the two is chosen deliberately.
- **A soft stop, never a lost draft.** A notice near 80%; a job already in progress can finish (a small reserve), so nobody is cut off mid-sentence; hand edits, copying, and downloading always stay free; the plans are offered at that moment, with Ask to pay for those who do not hold the card.
- **Paid use stays per job.** Each paid job carries a generous fair-use AI budget, and the subscription a monthly pool; no token packs for sale unless real use shows a need.
- **Showing the plans without pushing:** a quiet plan line at the bottom of the side menu ("Free plan · 1 of 2 jobs left · See plans"), opening a plain plans page (Free, Amplify, the packages, the subscription) that also holds the Billing page; one dismissible welcome card on first sign-in stating what the free plan includes and what Amplify adds; Amplify's features shown where they would help, with the organisation's own data ("3 similar jobs close the same week · see the market check"), never as pop-ups or banners.
- **Possible, against section 16 decision 2 ("free or paid, nothing in between"):** a new organisation's first job amplified free once, so it sees the market check, language versions, and Reach on its own job before deciding. Agreed in principle by the user, below.

### Follow-up, 7 November 2026

**The user's question:** if one job uses the whole month's tokens, the promise of two free jobs is broken. How is that managed?

**The agent's answer:** the promise stays "2 free jobs a month", and the tokens are a fair-use limit **per job**, not one pool for the month, so a heavy first job cannot use up the second.
- Each free job carries its own AI budget, set at about twice the measured average so almost nobody reaches it. A job's budget starts with its first AI use and stays with that job.
- A job that reaches its budget is never stuck: the checks and the facts keep working, editing by hand, copying, downloading, and publishing free stay open, and the message offers Amplify for that job ("This job has used its free writing help. Keep editing by hand and publish free, or Amplify it for unlimited help").
- The second free job still has its full budget.
- Drafts never published, sent for review, or downloaded use AI without using a free job, so a quiet monthly ceiling for the organisation (about four average jobs' worth) and the existing limit of about 10 open drafts stop misuse; normal use never meets them.
- This is section 15 F's "fair-use token budget per job description", measured from real use once the AI provider is chosen (E7).

**First job amplified free, once: agreed in principle by the user (7 November 2026),** on the condition that the communication is clear that it happens once and that Amplify afterwards comes with a paid plan. It amends section 16 decision 2 for an organisation's first job only, once the details are agreed. Where it is said:
- the welcome card ("Your first job is amplified free, once, so you can see what Amplify does");
- the publish page, on the Amplify choice ("Free for your first job · after this, US$28.40 a job or part of a package");
- the job's page afterwards, naming what Amplify added (market check, language versions, Reach, featured placement, 100 days);
- the Billing and plans page ("First job amplified free: used").

The details, as the agent suggested them; the user agreed three the same day:
- **Free count:** it uses one of that month's two free jobs (agreed).
- **What it includes:** the same as a paid Amplify job, with the same Reach email allowance (agreed).
- **Timing:** it is offered on the organisation's first job only; it cannot be saved for later (agreed).
- **Who:** once per organisation, not per person (open, with verification below).

**Verification, the user's question: how is an organisation verified?** Section 10 lists the ways; the demo already requires it for Amplify (section 16, review of round 4). Verification matters for Amplify because the public badge says "posted directly by a verified organisation", Reach sends email from AidJobs' domain (a spam and reputation risk), fake vacancies that charge candidates fees are a known problem in this sector, and without it one organisation could open several accounts for several free Amplify jobs. The ways, fastest first:
1. **Email on the organisation's own domain:** a code sent to an address at the organisation's website domain; automatic and instant for most established organisations.
2. **Claiming a page AidJobs already crawls:** the same domain as the careers site AidJobs knows.
3. **A registration number** checked against a public register (for example the UK Charity Commission, the US IRS list of tax-exempt organisations, India's NGO Darpan, Kenya's NGO Board), some automatic, others by hand; or an **IATI publisher ID**.
4. **By hand:** for small NGOs on Gmail or similar, a registration certificate reviewed by AidJobs, slower.

**The user's concern and proposal (7 November 2026):** many smaller NGOs have no domain of their own and use Gmail, and in India and many African countries public records may not be available to check. They need another way: **a referral from someone AidJobs can verify**, explained in the email that asks them to verify.

**The agent's view: vouching, as a fifth way.** It suits the sector: small local NGOs usually work with someone verifiable, as an implementing partner of an INGO or UN agency, a grantee of a donor, or a member of a national NGO network.
- **How:** the organisation names a person at a verified organisation, by that person's work email. AidJobs emails that person: "[Organisation] says it works with you. Is it a real organisation that hires staff? Yes · No · I don't know". One "Yes" verifies it. The request can be resent or sent to someone else.
- **Who can vouch:** a person writing from the domain of an organisation verified by email, by a crawled careers site, or by a register (the first three ways), never from Gmail or similar. Organisations verified by vouching cannot vouch for others at first, so chains of vouching cannot grow from one false account.
- **Limits and accountability:** each organisation vouches for a limited number a year (for example 10). Every vouch is recorded, never public unless the voucher agrees. If a vouched organisation is found to be fraudulent (for example charging candidates fees), its verification is removed, its live Amplify jobs come off, and the voucher's organisation is asked to look again before vouching again.
- **National networks later:** NGO forums and coordination bodies (for example national NGO councils and humanitarian NGO forums in a country) can be invited as trusted vouchers, with a higher limit.
- **The note in the email:** the email that asks an organisation to verify lists the ways in plain words, vouching included: "No email at your organisation's own website? Ask a partner organisation you work with to vouch for you; it takes them one click."
- **The badge:** the same "Verified organisation" whatever the way; the record of how stays internal.
- **Data:** the voucher's email is a contact detail (growth plan 4.6), so its storage, retention, and deletion are part of the same decision as other employer emails (section 2).

The agent's suggestion: free publishing needs no verification (moderation applies, section 2). For an unverified organisation, the free first Amplify starts at once with the private tools (the market check, the advert check, language versions, the field-post notice), and its public parts (featured placement, the badge) and the Reach emails start when verification completes, which for most is the same minute. The amplification stays reserved until then.

### Local languages (raised by the user, 7 November 2026)

**The user's idea:** add Hindi and a limited number of other major local languages in which jobs are published, for the countries with the most development and NGO work, because local NGOs work with people in local languages, field staff especially. The user asked whether this needs a language menu in the main window and in the chat, whether that is too much, and whether AI can handle it.

**The agent's view.** "Language" means three separate things, and only one needs a control:
1. **The chat:** no menu. The organisation types in Hindi and AidJobs answers in Hindi, the language detected from what they type.
2. **The job itself:** one choice per job, "Language: English", as a pill in the workspace's top row with the other facts, changed at any time. The job is written in that language from the start, not translated from English, with its headings, the JD formats' wording, and the commitments in that language; the organisation's own commitment text stays as written unless it adds its own version.
3. **The interface** (menus and buttons): stays in English at first. Translating it is a large, ongoing piece of work; Hindi first, later, if organisations ask.

Other languages for the same job stay where they are: language versions on the publish page (section 16 decision 6), and the field-post notice and the short WhatsApp version (section 14) in the local language, which is where field staff will read it.

**Can AI handle it:** the leading models write Hindi, Bengali, Urdu, Swahili, and the four existing languages well, and Nepali, Amharic, and Hausa reasonably; quality falls for smaller languages, so each language is tested on real job descriptions before it is offered. Points to design for:
- the right register: plain words for field roles, not formal or literary Hindi, with common sector terms (PSEA, safeguarding) kept as the sector uses them;
- the employer reviews every job before publishing, as for language versions now; nothing is published unreviewed;
- the checks (inclusive language, readability), predictive completion, and fact recognition (dates, places, grades) are built for English first; in other languages they are offered only where tested, and otherwise say so;
- scripts and direction: fonts for Devanagari, Bengali, and Ge'ez; right to left for Arabic, Urdu, Pashto, and Dari;
- cost: these scripts use two to three times more tokens than English for the same text, so the per-job budget is set per language and no language is penalised;
- the public side: each language a version of the job page, marked for search engines (growth plan section 4.5), and the public site able to show it.

**Which languages:** chosen from data, not guessed: where AidJobs' crawled jobs and ReliefWeb's postings concentrate, and the countries with the largest humanitarian and development programmes. Likely candidates beyond French, Arabic, Spanish, and Portuguese: Hindi, Bengali, Urdu, and Swahili first; then Nepali, Amharic, Hausa, Indonesian, Burmese, and Ukrainian; India's regional languages (Marathi, Tamil, Telugu, Odia) later, if organisations ask.

**Free or paid:** writing a job in its own one language is free, because local NGOs are most of the free plan; extra language versions stay part of Amplify.

**For later:** a spoken version of the short WhatsApp text, for candidates who read little.

**The user's decisions on the three (7 November 2026):** the chat follows the language typed, and each job has its own language pill, both on the condition that organisations are told plainly that this works; the interface is not translated for now.

**Making it known, the agent's suggestion** (quiet and shown where it is used, as with the plans):
- **The empty chat box:** a short line under it, "Write in English, Hindi, Swahili or another language; AidJobs answers in the same language", naming the languages of the countries the organisation works in (its profile); and the rotating example placeholders (section 15, item 1.9) include one in such a language.
- **The first message in another language:** one line in the chat links the two: "You're writing in Hindi. Write this job in Hindi too? · Yes · Keep it in English". The chat's language and the job's language are separate, so it is asked once per job, never assumed.
- **The language pill:** its hover text says "This job is written in this language from the start, not translated. Add other languages when you publish." For an organisation working in countries with a supported local language, the pill suggests it once ("Your organisation works in India: Hindi is available").
- **Set-up and the welcome card:** the organisation chooses its usual job languages during set-up (they become the default for new jobs), and the welcome card says in one line that jobs and the chat work in those languages.
- **The publish page:** language versions explain the difference: "Your job is in Hindi. Add English or another language as a version."

### AI providers: desk research (7 November 2026, approved by the user; no key, nothing sent to any provider)

Prices and token counts from public pages read on 7 November 2026 (third-party price lists that cite the providers' own pages; Not verified against each provider's page). US dollars per million tokens, input / output:

| Tier | Examples | Price |
| --- | --- | --- |
| Small | GPT-6 Luna, Claude Haiku 5.5 | 0.10 / 0.50 |
| Fast | Gemini 3.8 Flash (introductory until 31 December 2026, then 1.50 / 7.50) | 0.75 / 3.75 |
| Mid | GPT-6.1 Sol, Claude Sonnet 5.5, Gemini 4 Argon (introductory until 30 November 2026, then 4 / 20) | 2 / 10 |
| India-focused | Sarvam 105B (10 Indian languages and English; ₹15 / ₹60) | about 0.17 / 0.68 |

- **Cost of one job (the agent's estimate):** about 15 chat turns, the job description sent with each, plus the checks: roughly 120,000 input and 15,000 output tokens. About US$0.02 on a small model, US$0.15 on a fast one, and US$0.25 to 0.40 on a mid-tier one (less with prompt caching). A free organisation's two jobs cost cents a month against US$28.40 for one Amplify job, so the per-job budget (above) protects against misuse rather than everyday cost, and can be generous (three to four times the average).
- **Languages cost more tokens:** for the same text, Hindi takes about 1.4 to 1.65 times English with OpenAI's tokenizer, 1.2 to 1.4 with Gemini's, and about 2.3 with Claude's; Bengali and Urdu are similar (Claude 2.6 to 2.9); Swahili about 1.7 (OpenAI) to 2.0 (Gemini). Gemini is the most efficient for Indian languages, Claude the least. The per-language budget above follows from this.
- **Quality:** published benchmarks put the leading models' Hindi and Bengali close to their English, with Swahili, Amharic, and other African and South Asian languages clearly weaker (MuBench and GaoYao, ACL 2026; Artificial Analysis' multilingual index). General benchmarks do not measure job descriptions, so a hands-on test with native readers decides each language.
- **Data:** OpenAI, Anthropic, and Google do not train on paid API data by default. Each keeps prompts up to about 30 days for abuse monitoring; zero data retention is available on approval (OpenAI, Anthropic) or through Google's Vertex AI. Free tiers are not used. Sarvam's data terms are not yet read.

**Open models (asked by the user, 7 November 2026):** models whose weights anyone may download. Sources are model cards and secondary reviews (Not verified one by one).
- **How to use them:** through a hosting service paid per token (OpenRouter, Sarvam's Token Factory, and others), with no infrastructure of our own; or on our own GPU server, which gives full control of the data but costs hundreds of dollars a month to keep running and is not justified at AidJobs' volume. Hosted, then; self-hosting only if volume or a data rule later demands it.
- **Worth testing:**
  - **Gemma 4** (Google; Apache 2.0; pre-trained on over 140 languages): its tokenizer is among the most efficient for Indian languages (Hindi about 1.4 times English, Bengali 1.1); hosted for example by Sarvam at about US$0.40 / 1.00.
  - **Qwen 3.5 and 3.6** (Alibaba; Apache 2.0; 201 languages claimed): the broadest coverage, but Qwen 3's tokenizer took over 5 times English for Hindi, so its token cost is measured first.
  - **Sarvam 105B** (already shortlisted; Apache 2.0; built for India's 22 scheduled languages, though with little independent benchmarking yet).
- **Not suited:** Aya Expanse (strong in 23 languages including Hindi, but its weights are non-commercial; usable commercially only through Cohere's API, about US$0.50 / 1.50); DeepSeek V4 (cheap at about US$0.15 / 0.60, but trained mainly on English and Chinese, with Hindi about 3 times English's tokens); Llama 4 (Hindi but not Swahili among its 12 supported languages, and its own licence's conditions); the small African-language models (InkubaLM, AfroLLM), still behind the leading models.
- **A translation-only model:** IndicTrans2 (AI4Bharat; MIT; about 1 billion parameters, 22 Indian languages) translates rather than writes. It could make language versions cheaply later, even self-hosted; a general model writes and translates in one, so it is kept as an option.
- **Licences and data:** each model's licence is checked for commercial use before production (Apache 2.0 and MIT allow it); through a hosting service, the host's own data terms apply, so the hosts are limited to those that keep no prompts (to check per host).

**AWS and NVIDIA (asked by the user, 7 November 2026, who noted that writing a job description is a modest task, so cheaper models may do):** public pages read the same day, Not verified one by one.
- **Amazon Bedrock (AWS):** one AWS account gives Amazon's own Nova models and others' (Anthropic's Claude, Meta, Mistral, Cohere, and more). Nova claims over 200 languages. Prices per million tokens, input / output: Nova Micro 0.035 / 0.14, Nova Lite 0.06 / 0.24, Nova 2 Lite 0.30 / 2.50, Nova Pro 0.80 / 3.20. One job would cost under a cent on Nova Micro or Lite and about US$0.07 on Nova 2 Lite. Bedrock's data terms and an Indian region are to be checked.
- **AWS Activate credits:** cover Bedrock, other companies' models included. The Founders tier gives US$1,000 to a self-funded company under 10 years old with a working website; the Portfolio tier, up to US$100,000 to 200,000, needs an Activate provider's organisation ID.
- **NVIDIA:** `build.nvidia.com` gives free API access to over 160 open models (Nemotron, Llama, Qwen, Gemma, and others), rate-limited, for testing only: its terms prohibit production use, and free-tier prompts may be used by NVIDIA. Production through NVIDIA means its enterprise licence (from US$4,500 per GPU a year) on our own GPUs, or a partner's paid endpoint: not suited to AidJobs. NVIDIA Inception (free, for incorporated companies under 10 years old with a website) offers cloud credits and is an AWS Activate provider; applicants report 2 to 3 month waits.
- **The agent's view:** cheaper models go into the test as equals, and the test decides, because invented facts or stiff wording would cost organisations' trust more than the cents saved. NVIDIA's free tier tests the open models at no cost, with sample data only. Bedrock is the strongest production candidate: cheap Nova models and Claude under one account and one set of data terms, possibly paid for by Activate credits for the first year or more. Activate and Inception need a working company website (`aidjobs.app`, already a decision waiting) and, for Inception, an incorporated company.

**The user's AWS credits (7 November 2026):** the user holds AWS credits that cover Amazon's models (Nova, and the older Titan) and the Bedrock models that need no extra access approval, but not Claude, GPT, or the other leading models. The test therefore starts on Bedrock at no cost: the Nova models first (Titan is the older generation, kept only as a fallback), then the open models in the user's Bedrock catalog that need no approval. The leading closed models are tested later and only if Nova falls short, with a small paid budget the user approves. Before it runs: the user lists the models the catalog shows (names only); a separate AWS sign-in limited to calling Bedrock models, never the main account's keys, its key kept only in the local vault; an AWS budget alert, so nothing is charged to the card when the credits end; a region where Nova is available, Mumbai if it is offered there.

**The user's AWS account, read by the agent on 7 November 2026** (in the user's browser, at their request; pages read only, nothing changed):
- **Credits:** about US$1,137 left: AWS Activate Founders US$1,000 (unused, until 31 October 2028), AWS Free Tier US$100 (US$97.18 left, until 2 October 2027), and two US$20 "Explore AWS" credits (until 2 October 2027). The Activate credit lists Amazon Bedrock and Bedrock foundation models among its services, and no model sold through AWS Marketplace.
- **Models:** 112 serverless text, image, and embedding models in N. Virginia (us-east-1), 85 in Mumbai (ap-south-1). Amazon's text models are Nova Micro, Lite, and Pro and Nova 2 Lite, in both regions; Titan remains only as embedding models, which do not write text. Claude asks for use case details first (the "extra approval"); Nova, gpt-oss, Gemma 3, Qwen 3, Llama 4, GLM, and Kimi open straight into the playground. Whether a given model's charges come off the credits is confirmed by a first small run and the next day's billing, before the full test.
- **Budget:** one monthly cost budget of US$100 exists, with nothing spent against it; it emails the user on a real charge (confirmed by the user).
- **Test models, narrowed from published reviews at the user's request:** three, all offered in Mumbai.
  - **Kimi K3.1** (Moonshot AI), the main writer: the highest-ranked model on Bedrock without extra approval in an English writing leaderboard (Kimi K3.1 Pro third of over 100, behind GPT-6.1 Sol and Claude Opus 5.5; GLM 5.3 eleventh). Its Hindi is not benchmarked.
  - **gpt-oss-120b** (OpenAI's open model), for Hindi and the other languages: the best of the open models in a Hindi benchmark suite (MT-Bench-Hi 8.7 of 10, ahead of Gemma 3 27B at 8.3 and Qwen 3 235B at 8.1), and cheap.
  - **Nova 2 Lite** (Amazon), for the quick tasks: Amazon's best-rated model by a wide margin over Nova Micro, Lite, and Pro, and surely covered by the credits.
  - Left out: Nova Micro, Lite, and Pro (lower rated); Gemma 3 and Qwen 3 (behind gpt-oss in Hindi and far behind in English writing); Mistral Large 3 and Llama 4 (lower rated); GLM 5.3 kept as the reserve writer.
- **Region:** the test runs in Mumbai, where all three are offered. In production the AI is called by the backend, so Bedrock's region follows the Render backend's region (to check), which matters more than the visitor's; the delay between regions (a fraction of a second) is small next to the seconds a model takes to write. Models marked "cross-region inference" may be processed in other regions of the same area, so a data-location promise needs checking per model.

**The hands-on test, next (needs the user's decisions):** a shortlist (for example GPT-6.1 Sol, Gemini 3.8 Flash and 4 Argon, Claude Sonnet 5.5, Amazon Nova Micro, Lite, and 2 Lite, and the open models Gemma 4, Qwen 3.5, and Sarvam 105B, the open ones through NVIDIA's free test access where available); about 10 sample job descriptions written by the agent (no real employer or person's data) in English, Hindi, Bengali, Urdu, and Swahili; measured tokens and cost per job, with judged quality (the user for Hindi, native readers for the others). Decisions: which providers; one key or several (one prepaid OpenRouter account gives one key and a hard spending limit, W-14); the spending limit (for example US$10); keys only in the local vault, never in a file or the repository (W-01, W-30); the test script outside the repository or git-ignored.

### To settle in the discussion

- Local languages: the first set and how it is chosen; a job's own language free and versions paid; the wording that tells organisations the chat and the jobs work in their languages.
- The per-job budget, the monthly ceiling, and the wording when a job reaches its budget.
- Verification: which ways at launch (which registers, whether by hand, vouching and its limits), and whether an unverified organisation gets the private tools of the free first Amplify at once; then the exact wording at each place.
- Tokens only, listings only, or both; and what counts if a job uses no AI.
- The average tokens per job, measured once the AI provider is chosen (E7).
- How the allowance is shown, and when the notice appears.
- Where the plan line and "See plans" sit in the chat window and the side menu, and what the welcome card says.
- Then a demo round on `demo/employer`, with its own plan and approval.
