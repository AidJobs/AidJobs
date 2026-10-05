"""Lifecycle observations. This module does not touch the database."""


def jobs_not_rediscovered(known_ids, seen_ids, *, trustworthy: bool) -> list:
    """IDs from known_ids that were not seen.

    The caller supplies trustworthy. An untrusted crawl identifies no absences.
    """
    if not trustworthy:
        return []
    seen = set(seen_ids)
    return [job_id for job_id in known_ids if job_id not in seen]
