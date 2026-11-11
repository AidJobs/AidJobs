"""Role-content survey (W-54): group the duty lines of the adverts read, by sentence similarity.

Runs only in its own environment on the user's machine, never in CI or the backend (role-survey.md,
19.9 item 4): a free, open-source sentence-similarity model, run locally; nothing is sent anywhere.

  <similarity-venv>/Scripts/python tools/survey/duty_groups.py FAMILY [FAMILY ...]

For each role family (as in broad-adverts.csv), the duty lines of its measured adverts (held-out
adverts left out) are embedded, grouped by agglomerative clustering on cosine distance, and ranked
within each group by specificity (adverts.specificity). Groups, with their lines, are written to the
local work folder only; the agent reviews groups, not adverts, and names each. Prints counts only.
"""
from __future__ import annotations

import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import adverts

MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"   # English and French, Apache 2.0
DISTANCE = 0.45          # cosine distance within which lines join one group (average linkage)
MIN_GROUP = 3            # a group needs lines from at least this many adverts to be reported


def main(families: list[str]) -> int:
    from sentence_transformers import SentenceTransformer
    from sklearn.cluster import AgglomerativeClustering

    rows = {r["advert_id"]: r for r in csv.DictReader((adverts.ROLES_DIR / "broad-adverts.csv").open(encoding="utf-8"))}
    by_id = {a["id"]: a for a in adverts.load_adverts()}
    model = SentenceTransformer(MODEL, device="cpu")
    out_dir = adverts.WORK / "duty-groups"
    out_dir.mkdir(parents=True, exist_ok=True)
    for family in families:
        lines, owners = [], []
        for aid, r in rows.items():
            if r["family_id"] == family and r["held_out"] == "false" and aid in by_id:
                for t in dict.fromkeys(adverts.duty_lines(by_id[aid])):
                    lines.append(t)
                    owners.append((aid, r["org_id"]))
        if len(lines) < 10:
            print(f"{family}: {len(lines)} duty lines, too few to group")
            continue
        emb = model.encode(lines, batch_size=64, normalize_embeddings=True, show_progress_bar=False)
        labels = AgglomerativeClustering(n_clusters=None, distance_threshold=DISTANCE, metric="cosine",
                                         linkage="average").fit_predict(emb)
        groups = defaultdict(list)
        for i, g in enumerate(labels):
            groups[int(g)].append(i)
        report, kept = [], 0
        for g, idx in sorted(groups.items(), key=lambda kv: -len(kv[1])):
            ads = {owners[i][0] for i in idx}
            if len(ads) < MIN_GROUP:
                continue
            kept += len(idx)
            ranked = sorted(idx, key=lambda i: -adverts.specificity(lines[i])[0])
            report.append({"group": g, "lines": len(idx), "adverts": len(ads),
                           "organisations": len({owners[i][1] for i in idx}),
                           "specificity": dict(Counter(adverts.specificity(lines[i])[0] for i in idx)),
                           "examples": [lines[i] for i in ranked[:8]]})
        (out_dir / f"{family}.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        n_ads = len({o[0] for o in owners})
        print(f"{family}: {len(lines)} duty lines from {n_ads} adverts; {len(groups)} groups, "
              f"{len(report)} shared by {MIN_GROUP}+ adverts covering {kept} lines ({100 * kept / len(lines):.0f}%); "
              f"largest {[r['adverts'] for r in report[:8]]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
