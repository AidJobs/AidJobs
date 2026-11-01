#!/usr/bin/env bash
# Compiles the backend's locked requirement files with hashes (security plan, stage 3A, part 3,
# step 3) for Render's platform: Linux x86_64 and the Python in .python-version. Needs uv 0.13.6
# on PATH. CI runs this script and fails if the committed files differ from its output.
set -euo pipefail
cd "$(dirname "$0")/.."

python_version="$(tr -d '[:space:]' < .python-version)"
# Files published after this moment are ignored, so a recompile gives the same result. Moving a
# package forward means editing its .in file and moving this date, in the same pull request.
exclude_newer="2026-10-30T20:55:00Z"

common=(
  --python-version "$python_version"
  --python-platform x86_64-manylinux_2_28
  --generate-hashes
  --exclude-newer "$exclude_newer"
  --custom-compile-command "bash scripts/lock.sh"
  --quiet
)

uv pip compile "${common[@]}" build-tools.in -o build-tools.txt
uv pip compile "${common[@]}" requirements.in -o requirements.txt
uv pip compile "${common[@]}" -c requirements.txt requirements-test.in -o requirements-test.txt
uv pip compile "${common[@]}" lock-tools.in -o lock-tools.txt
uv pip compile "${common[@]}" audit-tools.in -o audit-tools.txt
