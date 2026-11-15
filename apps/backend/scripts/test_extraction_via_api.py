"""Obsolete: /api/admin/crawl/diagnostics/unesco and /undp were removed (W-33 / W-35 3a).

Use the admin Sources page → Simulate, or:
  POST /api/admin/sources/{source_id}/simulate_extract
"""
from __future__ import annotations

import sys


def main() -> int:
    print(
        "The UNESCO/UNDP diagnostics routes are gone (W-33).\n"
        "Use Sources → Simulate, or POST /api/admin/sources/{id}/simulate_extract."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
