#!/usr/bin/env bash
# Prepares the backend dependency audit (security plan, stage 3A, part 3). Run from apps/backend
# after the packages are installed. Writes audit/: the exact installed set, what requirements.txt
# alone resolves to (Render installs only that file; used to label findings "runtime" or
# "CI only"), and installs pip-audit in its own environment so it is not part of the audited set.
set -euo pipefail

mkdir -p audit
date -u +%Y-%m-%dT%H:%M:%SZ > audit/audited-at.txt
python --version >> audit/audited-at.txt
pip freeze --all > audit/installed-packages.txt

if ! pip install --quiet --dry-run --ignore-installed --report audit/runtime-report.json -r requirements.txt; then
  rm -f audit/runtime-report.json
  echo "::warning::requirements.txt could not be resolved; findings will not be labelled runtime or CI only"
fi

python -m venv /tmp/audit-tool
for wait in 15 45 0; do
  if /tmp/audit-tool/bin/pip install --quiet pip-audit==2.10.1; then
    exit 0
  fi
  if [ "$wait" = 0 ]; then
    echo "::error::pip-audit could not be installed after 3 attempts"
    exit 1
  fi
  sleep "$wait"
done
