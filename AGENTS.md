# AidJobs — instructions for coding agents

Before any work, read `docs/architecture/progress-ledger.md`. It records what is done, what is open, the recommended order, and how this project is run.

The rules are in `docs/architecture/aidjobs-migration-contract.md` and `docs/architecture/crawler-completion-plan.md`. The ledger does not override them.

Key conventions, detailed in the ledger:

- Every step needs the user's explicit approval: investigate, plan, implement, merge.
- Work on a branch through a pull request. Do not push `main`. Merging to `main` deploys the backend on Render.
- Do not crawl production, write to the jobs database, or reindex search unless the user asks for that step.
- Never stage `apps/backend/scripts/diagnose_enrichment_bias.py` or `tests/test_link_heuristics.py`.
- Update the ledger when an item is finished.
