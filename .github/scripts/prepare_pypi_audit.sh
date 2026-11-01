#!/usr/bin/env bash
# Prepares the backend dependency audit (security plan, stage 3A, part 3). Run from apps/backend
# after the packages are installed. Writes audit/ with the exact installed set, and installs
# pip-audit from the locked audit-tools.txt into its own environment, so it is not part of the
# audited set. Findings are labelled from the locked requirements.txt that Render installs.
set -euo pipefail

mkdir -p audit
date -u +%Y-%m-%dT%H:%M:%SZ > audit/audited-at.txt
python --version >> audit/audited-at.txt
pip freeze --all > audit/installed-packages.txt

python -m venv /tmp/audit-tool
for wait in 15 45 0; do
  if /tmp/audit-tool/bin/python -m pip install --quiet --require-hashes -r audit-tools.txt; then
    exit 0
  fi
  if [ "$wait" = 0 ]; then
    echo "::error::pip-audit could not be installed after 3 attempts"
    exit 1
  fi
  sleep "$wait"
done
