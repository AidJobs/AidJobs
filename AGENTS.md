# AidJobs — instructions for coding agents

Before any work, read `docs/architecture/progress-ledger.md`. It records what is done, what is open, the recommended order, and how this project is run.

**Current order (chosen by the agent at the user's request on 30 October 2026, approved by the user with PR #67): `docs/architecture/growth-and-seo-plan.md`, section 7.** Take the first step there that is not done and whose dependencies are met. In short: finish `docs/architecture/security-hardening-plan.md` as approved (stage 3A, dependency security, first; then the rest of stage 3, stages 4, 5, and 7, and the stage 6 plan), following its approval rules and safeguards; its stage 8, the employer survey (ledger W-31, read-only, widened); the crawler foundation; the admin's add-source flow and crawl review; gradual source growth; then the public site from `docs/architecture/ux-build-plan.md` (its revisions of 21 and 30 October 2026, and the working method at the top of that file) up to the launch with thousands of jobs; then the work after launch. The growth plan's design rules (sections 4.1 to 4.6) apply to every step, so search-engine needs are built in from the start. The approved design demo is the git tag `ux-demo-approved-2026-10-21`; it is a reference and is never merged, and the differences from it approved on 30 October 2026 are listed in the UX plan.

The rules are in `docs/architecture/aidjobs-migration-contract.md` and `docs/architecture/crawler-completion-plan.md`. The ledger, the UX plan, and the growth plan do not override them; their amendments of 30 October 2026 are recorded in those two documents. A UX step marked "Contract decision" is not approved for implementation until the user records that decision.

Key conventions, detailed in the ledger:

- Every step needs the user's explicit approval: to investigate, the plan (which covers building it, the review and its fixes), and the merge (which names the head commit and covers deleting the merged branch). Details in the ledger.
- Start each stage in a new chat; the ledger is the handover.
- Work on a branch through a pull request. Do not push `main`. Merging to `main` publishes the frontend on Vercel and deploys the backend on Render.
- Do not crawl production, write to the jobs database, or reindex search unless the user asks for that step.
- On admin pages, use the read-only browser guard described in the UX plan; never trigger a destructive control during verification.
- Never stage `apps/backend/scripts/diagnose_enrichment_bias.py` or `tests/test_link_heuristics.py`.
- Never print a secret or the contents of an `.env` file. To check a setting, run `node scripts/env_check.mjs NAME` (it shows only whether it is set, its length, and a URL's shape). The project's secret guard (`.cursor/hooks.json`) refuses the usual ways of printing one; do not look for another way round it.
- Update the ledger, and the UX plan for UX steps, when a step is finished.
