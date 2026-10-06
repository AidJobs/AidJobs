"""Plan an organisation backfill. This module does not touch a database.

Identical trimmed source names become one organisation. Other spellings stay
separate. Stored source and job names are not rewritten.
"""
import re
import uuid

_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://aidjobs.local/organisation")


def plan_backfill(sources, jobs) -> dict:
    """Return organisation rows and the ids to copy onto sources and jobs."""
    grouped: dict[str, dict] = {}
    unmapped_source_ids = []
    for source in sources:
        name = _trimmed(source.get("org_name"))
        if name is None:
            unmapped_source_ids.append(source.get("id"))
            continue
        group = grouped.setdefault(name, {"types": set(), "source_ids": []})
        org_type = _trimmed(source.get("org_type"))
        if org_type is not None:
            group["types"].add(org_type)
        group["source_ids"].append(source.get("id"))

    slug_counts: dict[str, int] = {}
    organisations = []
    organisation_id_by_name = {}
    for name in sorted(grouped):
        group = grouped[name]
        base = _slug_base(name)
        slug_counts[base] = slug_counts.get(base, 0) + 1
        suffix = slug_counts[base]
        slug = base if suffix == 1 else f"{base}-{suffix}"
        org_type = next(iter(group["types"])) if len(group["types"]) == 1 else None
        organisation_id = str(uuid.uuid5(_NAMESPACE, name))
        organisations.append(
            {
                "id": organisation_id,
                "name": name,
                "slug": slug,
                "type": org_type,
                "website_url": None,
                "status": "active",
            }
        )
        organisation_id_by_name[name] = organisation_id

    source_organisation_id = {
        source_id: None for source_id in unmapped_source_ids
    }
    for name, group in grouped.items():
        for source_id in group["source_ids"]:
            source_organisation_id[source_id] = organisation_id_by_name[name]

    sources_by_id = {source.get("id"): source for source in sources}
    job_organisation_id = {}
    mismatches = []
    unmapped_job_ids = []
    for job in jobs:
        source_id = job.get("source_id")
        organisation_id = None
        if source_id is not None:
            organisation_id = source_organisation_id.get(source_id)
        job_organisation_id[job.get("id")] = organisation_id
        if organisation_id is None:
            unmapped_job_ids.append(job.get("id"))
            continue
        source = sources_by_id.get(source_id)
        if source is not None and job.get("org_name") != source.get("org_name"):
            mismatches.append(job.get("id"))

    return {
        "organisations": organisations,
        "source_organisation_id": source_organisation_id,
        "job_organisation_id": job_organisation_id,
        "mismatches": mismatches,
        "counts": {
            "organisations": len(organisations),
            "mapped_sources": sum(
                1 for value in source_organisation_id.values() if value is not None
            ),
            "unmapped_sources": len(unmapped_source_ids),
            "mapped_jobs": sum(
                1 for value in job_organisation_id.values() if value is not None
            ),
            "unmapped_jobs": len(unmapped_job_ids),
            "name_mismatches": len(mismatches),
        },
    }


def _trimmed(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _slug_base(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "org"
