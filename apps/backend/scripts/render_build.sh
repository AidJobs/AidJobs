#!/usr/bin/env bash
# Render's Build Command: `bash scripts/render_build.sh`, from apps/backend (security plan, stage
# 3A, part 3, step 3). CI runs it too, in a fresh environment like Render's, before any change
# reaches Render. Every file is checked against its hash in the lock; a package built from
# source (sgmllib3k) is built only with the locked build tools.
set -euo pipefail
cd "$(dirname "$0")/.."

python -m pip install --require-hashes -r build-tools.txt
python -m pip install --require-hashes --build-constraint build-tools.txt -r requirements.txt

# Until playwright is removed from requirements.in (stage 3A, part 3, step 3, pull request B).
if [ "${AIDJOBS_SKIP_BROWSER_DOWNLOAD:-}" != "1" ]; then
  python -m playwright install chromium
fi

python -m pip --version
python - <<'EOF'
# The environment must hold every locked package at its locked version. Packages left over from
# an earlier build in a reused environment are listed, not removed.
import importlib.metadata as metadata
import re
import sys

def normalise(name):
    return re.sub(r"[-_.]+", "-", name).lower()

locked = {}
for path in ("build-tools.txt", "requirements.txt"):
    for line in open(path, encoding="utf-8"):
        match = re.match(r"^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?==([^\s\\;]+)", line)
        if match:
            locked[normalise(match.group(1))] = match.group(3)

installed = {normalise(d.metadata["Name"]): d.version for d in metadata.distributions()}
print("setuptools", installed.get("setuptools", "not installed"))
wrong = {name: (version, installed.get(name)) for name, version in locked.items() if installed.get(name) != version}
extra = sorted(set(installed) - set(locked) - {"wheel"})
if extra:
    print("Installed but not in the lock (left from an earlier build):", ", ".join(extra))
if wrong:
    for name, (want, have) in sorted(wrong.items()):
        print(f"Not as locked: {name} locked {want}, installed {have}", file=sys.stderr)
    sys.exit(1)
print(f"All {len(locked)} locked packages installed at their locked versions.")
EOF
