-- Gate 8 organisation rows. Unapplied.
-- Do not run until a read-only check has verified the production schema.
-- The application must not execute this file.
-- Group by the trimmed source name only. Do not fold case or merge spellings.
-- sources.org_name and jobs.org_name stay.

CREATE TABLE IF NOT EXISTS organisations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    type TEXT,
    website_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS organisation_id UUID;

ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS organisation_id UUID;

WITH grouped AS (
    SELECT
        btrim(org_name) AS name,
        CASE
            WHEN count(DISTINCT btrim(org_type)) FILTER (
                WHERE org_type IS NOT NULL AND btrim(org_type) <> ''
            ) = 1
            THEN min(btrim(org_type)) FILTER (
                WHERE org_type IS NOT NULL AND btrim(org_type) <> ''
            )
            ELSE NULL
        END AS type
    FROM sources
    WHERE btrim(coalesce(org_name, '')) <> ''
    GROUP BY btrim(org_name)
),
slugged AS (
    SELECT
        name,
        type,
        coalesce(
            nullif(
                trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))),
                ''
            ),
            'org'
        ) AS base_slug
    FROM grouped
),
ranked AS (
    SELECT
        name,
        type,
        base_slug,
        row_number() OVER (PARTITION BY base_slug ORDER BY name) AS slug_rank
    FROM slugged
)
INSERT INTO organisations (id, name, slug, type, website_url, status)
SELECT
    gen_random_uuid(),
    name,
    CASE
        WHEN slug_rank = 1 THEN base_slug
        ELSE base_slug || '-' || slug_rank::text
    END,
    type,
    NULL,
    'active'
FROM ranked
ON CONFLICT (name) DO NOTHING;

UPDATE sources AS source_row
SET organisation_id = organisation.id
FROM organisations AS organisation
WHERE btrim(source_row.org_name) = organisation.name
  AND source_row.organisation_id IS DISTINCT FROM organisation.id;

UPDATE jobs AS job_row
SET organisation_id = source_row.organisation_id
FROM sources AS source_row
WHERE job_row.source_id = source_row.id
  AND source_row.organisation_id IS NOT NULL
  AND job_row.organisation_id IS DISTINCT FROM source_row.organisation_id;
