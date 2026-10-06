-- Gate 8 foreign keys. Unapplied.
-- Apply only after the organisation backfill counts have been checked.
-- The application must not execute this file.

ALTER TABLE sources
    ADD CONSTRAINT sources_organisation_id_fkey
    FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE RESTRICT;

ALTER TABLE jobs
    ADD CONSTRAINT jobs_organisation_id_fkey
    FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE RESTRICT;
