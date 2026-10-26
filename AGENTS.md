# AidJobs — instructions for coding agents

Before any work, read `docs/architecture/progress-ledger.md`. It records what is done, what is open, the recommended order, and how this project is run.

**Current priority (set by the user, 26 October 2026): security hardening.** Work from `docs/architecture/security-hardening-plan.md`: take the first stage in its order table that is not done, and follow its approval rules and safeguards. Its stage 8 is the employer survey (ledger W-31, read-only), set by the user on 26 October 2026; UX-11 resumes as that plan's last stage.

**Then (set by the user, 20 October 2026): user experience.** Work from `docs/architecture/ux-build-plan.md`: follow the order table in its "Revision of 21 October 2026", take the first step that is not Done and whose dependencies are met, and follow the working method at the top of that file. The approved design demo is the git tag `ux-demo-approved-2026-10-21`; it is a reference and is never merged. Crawler work resumes in ledger order after Stage C of that plan, or when the user changes the priority.

The rules are in `docs/architecture/aidjobs-migration-contract.md` and `docs/architecture/crawler-completion-plan.md`. The ledger and the UX plan do not override them. A UX step marked "Contract decision" is not approved for implementation until the user records that decision.

Key conventions, detailed in the ledger:

- Every step needs the user's explicit approval: investigate, plan, implement, merge.
- Work on a branch through a pull request. Do not push `main`. Merging to `main` publishes the frontend on Vercel and deploys the backend on Render.
- Do not crawl production, write to the jobs database, or reindex search unless the user asks for that step.
- On admin pages, use the read-only browser guard described in the UX plan; never trigger a destructive control during verification.
- Never stage `apps/backend/scripts/diagnose_enrichment_bias.py` or `tests/test_link_heuristics.py`.
- Update the ledger, and the UX plan for UX steps, when a step is finished.
