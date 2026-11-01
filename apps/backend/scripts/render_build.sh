#!/usr/bin/env bash
# Render's Build Command: `bash scripts/render_build.sh`, from apps/backend (security plan, stage
# 3A, part 3, step 3). CI runs it too, in a fresh environment like Render's, before any change
# reaches Render. Every file is checked against its hash in the lock. pip's cache is not used, so
# a package built from source (sgmllib3k) is always built here, with only the locked build tools.
set -euo pipefail
cd "$(dirname "$0")/.."

# The lock is for exactly this Python; stop before downloading anything if it differs.
wanted="$(tr -d '[:space:]' < .python-version)"
running="$(python -c 'import platform; print(platform.python_version())')"
if [ "$running" != "$wanted" ]; then
  echo "Python $running is not the locked $wanted (.python-version)" >&2
  exit 1
fi

python -m pip install --no-cache-dir --require-hashes -r build-tools.txt
python -m pip install --no-cache-dir --require-hashes --build-constraint build-tools.txt -r requirements.txt

# Until playwright is removed from requirements.in (stage 3A, part 3, step 3, pull request B).
if [ "${AIDJOBS_SKIP_BROWSER_DOWNLOAD:-}" != "1" ]; then
  python -m playwright install chromium
fi

python -m pip --version
python - <<'EOF'
# The environment must run the locked Python and hold every locked package at its locked version,
# as Python resolves it. Packages left from an earlier build in a reused environment are listed.
import importlib.metadata as metadata
import platform
import re
import sys
from collections import Counter

def normalise(name):
    return re.sub(r"[-_.]+", "-", name).lower()

print("python", sys.executable, platform.python_version())

locked = {}
for path in ("build-tools.txt", "requirements.txt"):
    for line in open(path, encoding="utf-8"):
        match = re.match(r"^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?==([^\s\\;]+)", line)
        if match:
            locked[normalise(match.group(1))] = match.group(3)

def resolved(name):
    try:
        return metadata.version(name)
    except metadata.PackageNotFoundError:
        return None

print("setuptools", resolved("setuptools") or "not installed")
names = [normalise(d.metadata["Name"]) for d in metadata.distributions() if d.metadata["Name"]]
duplicates = sorted(name for name, count in Counter(names).items() if count > 1)
if duplicates:
    print("More than one copy visible, the first on sys.path is used:", ", ".join(duplicates))
extra = sorted(set(names) - set(locked) - {"wheel"})
if extra:
    print("Installed but not in the lock (left from an earlier build):", ", ".join(extra))
wrong = {name: (version, resolved(name)) for name, version in locked.items() if resolved(name) != version}
if wrong:
    for name, (want, have) in sorted(wrong.items()):
        print(f"Not as locked: {name} locked {want}, installed {have}", file=sys.stderr)
    sys.exit(1)
print(f"All {len(locked)} locked packages installed at their locked versions.")
EOF
