-- Structure of production's sources, crawl_locks, crawl_logs and jobs tables
-- (PostgreSQL 17.6), read without rows on 27 October 2026.
-- Only tests/test_crawl_ownership.py loads it, into a local *_test database.

DROP TABLE IF EXISTS public.jobs, public.crawl_logs, public.crawl_locks, public.sources CASCADE;
DROP FUNCTION IF EXISTS public.jobs_tsv_update() CASCADE;

CREATE TABLE public.sources (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "org_name" text,
    "careers_url" text NOT NULL,
    "source_type" text DEFAULT 'html'::text,
    "parser_hint" text,
    "status" text DEFAULT 'pending_validation'::text,
    "crawl_frequency_days" integer DEFAULT 3,
    "last_crawled_at" timestamp with time zone,
    "last_crawl_status" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "notes" text,
    "org_type" text,
    "time_window" text,
    "next_run_at" timestamp with time zone,
    "last_crawl_message" text,
    "consecutive_failures" integer DEFAULT 0,
    "consecutive_nochange" integer DEFAULT 0,
    "priority" integer DEFAULT 0,
    "last_success_at" timestamp with time zone,
    "total_crawls" integer DEFAULT 0,
    "total_jobs_found" integer DEFAULT 0,
    "avg_crawl_duration_ms" integer,
    "last_error" text,
    "retry_count" integer DEFAULT 0,
    "enabled_at" timestamp with time zone,
    "disabled_at" timestamp with time zone,
    "tags" text[],
    "metadata" jsonb,
    CONSTRAINT "sources_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX idx_sources_careers_url ON public.sources USING btree (careers_url);
CREATE INDEX idx_sources_next_run_at ON public.sources USING btree (next_run_at);
CREATE INDEX idx_sources_org_type ON public.sources USING btree (org_type);
CREATE INDEX idx_sources_status ON public.sources USING btree (status);

CREATE TABLE public.crawl_locks (
    "source_id" uuid NOT NULL,
    "locked_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "crawl_locks_pkey" PRIMARY KEY (source_id)
);

CREATE TABLE public.crawl_logs (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "source_id" uuid,
    "found" integer DEFAULT 0,
    "inserted" integer DEFAULT 0,
    "updated" integer DEFAULT 0,
    "skipped" integer DEFAULT 0,
    "status" text NOT NULL,
    "message" text,
    "ran_at" timestamp with time zone DEFAULT now(),
    "duration_ms" integer,
    "error_type" text,
    "http_status" integer,
    "content_size_bytes" integer,
    "retry_attempt" integer DEFAULT 0,
    "crawler_version" text,
    CONSTRAINT "crawl_logs_pkey" PRIMARY KEY (id),
    CONSTRAINT "crawl_logs_source_id_fkey" FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);
CREATE INDEX idx_crawl_logs_source_id ON public.crawl_logs USING btree (source_id, ran_at DESC);

CREATE TABLE public.jobs (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "source_id" uuid,
    "org_name" text,
    "title" text NOT NULL,
    "location_raw" text,
    "country" text,
    "country_iso" text,
    "city" text,
    "level_norm" text,
    "mission_tags" text[],
    "international_eligible" boolean,
    "deadline" date,
    "apply_url" text,
    "description_snippet" text,
    "canonical_hash" text NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT now(),
    "last_seen_at" timestamp with time zone DEFAULT now(),
    "status" text DEFAULT 'active'::text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "search_tsv" tsvector,
    "career_type" text,
    "contract_type" text,
    "work_modality" text,
    "country_name" text,
    "region_code" text,
    "functional_tags" text[],
    "benefits" text[],
    "policy_flags" text[],
    "donor_context" text[],
    "project_modality" text,
    "procurement_vehicle" text,
    "crisis_type" text[],
    "response_phase" text,
    "humanitarian_cluster" text[],
    "surge_required" boolean,
    "deployment_timeframe" text,
    "duty_station_hardship" text,
    "work_hours" text,
    "contract_duration_months" integer,
    "contract_urgency" text,
    "application_window" jsonb,
    "compensation_visible" boolean DEFAULT false,
    "compensation_type" text,
    "compensation_min_usd" numeric,
    "compensation_max_usd" numeric,
    "compensation_currency" text,
    "compensation_confidence" numeric,
    "data_provenance" text,
    "freshness_days" integer,
    "duplicate_of" uuid,
    "raw_metadata" jsonb,
    "org_type" text,
    "priority_score" numeric,
    "view_count" integer DEFAULT 0,
    "apply_count" integer DEFAULT 0,
    "bookmark_count" integer DEFAULT 0,
    "expired_at" timestamp with time zone,
    "featured" boolean DEFAULT false,
    "verified" boolean DEFAULT false,
    "salary_range_text" text,
    "remote_eligible" boolean,
    "visa_sponsorship" boolean,
    "language_requirements" text[],
    "education_level" text,
    "experience_years" integer,
    "source_priority" integer,
    "quality_score" numeric,
    "normalized_at" timestamp with time zone,
    "impact_domain" text[],
    "impact_confidences" jsonb,
    "functional_role" text[],
    "functional_confidences" jsonb,
    "experience_level" text,
    "estimated_experience_years" jsonb,
    "experience_confidence" numeric,
    "sdgs" integer[],
    "sdg_confidences" jsonb,
    "sdg_explanation" text,
    "matched_keywords" text[],
    "confidence_overall" numeric,
    "low_confidence" boolean DEFAULT false,
    "low_confidence_reason" text,
    "embedding_input" text,
    "enriched_at" timestamp with time zone,
    "enrichment_version" integer DEFAULT 1,
    "deleted_at" timestamp with time zone,
    "deleted_by" text,
    "deletion_reason" text,
    "data_quality_score" integer,
    "data_quality_issues" jsonb,
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "geocoded_at" timestamp with time zone,
    "geocoding_source" text,
    "is_remote" boolean DEFAULT false,
    "quality_grade" text,
    "quality_factors" jsonb,
    "quality_issues" text[],
    "needs_review" boolean DEFAULT false,
    "quality_scored_at" timestamp with time zone,
    -- Added by infra/migrations/w37_captured_fields.sql (W-37).
    "description" text,
    "posted_on" date,
    "locations" text[],
    "advert_language" text,
    CONSTRAINT "jobs_canonical_hash_key" UNIQUE (canonical_hash),
    CONSTRAINT "jobs_pkey" PRIMARY KEY (id),
    CONSTRAINT "jobs_source_id_fkey" FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
);
CREATE INDEX idx_jobs_career_type ON public.jobs USING btree (career_type);
CREATE INDEX idx_jobs_city ON public.jobs USING btree (city) WHERE (city IS NOT NULL);
CREATE INDEX idx_jobs_country ON public.jobs USING btree (country);
CREATE INDEX idx_jobs_country_iso ON public.jobs USING btree (country_iso);
CREATE INDEX idx_jobs_deleted_at ON public.jobs USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_jobs_enriched_at ON public.jobs USING btree (enriched_at);
CREATE INDEX idx_jobs_experience_level ON public.jobs USING btree (experience_level);
CREATE INDEX idx_jobs_functional_role ON public.jobs USING gin (functional_role);
CREATE INDEX idx_jobs_geocoded_at ON public.jobs USING btree (geocoded_at);
CREATE INDEX idx_jobs_impact_domain ON public.jobs USING gin (impact_domain);
CREATE INDEX idx_jobs_international ON public.jobs USING btree (international_eligible);
CREATE INDEX idx_jobs_international_eligible ON public.jobs USING btree (international_eligible);
CREATE INDEX idx_jobs_is_remote ON public.jobs USING btree (is_remote);
CREATE INDEX idx_jobs_latitude_longitude ON public.jobs USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));
CREATE INDEX idx_jobs_level_norm ON public.jobs USING btree (level_norm);
CREATE INDEX idx_jobs_low_confidence ON public.jobs USING btree (low_confidence) WHERE (low_confidence = true);
CREATE INDEX idx_jobs_needs_review ON public.jobs USING btree (needs_review) WHERE (needs_review = true);
CREATE INDEX idx_jobs_org_type ON public.jobs USING btree (org_name);
CREATE INDEX idx_jobs_quality_grade ON public.jobs USING btree (quality_grade);
CREATE INDEX idx_jobs_quality_score ON public.jobs USING btree (data_quality_score) WHERE (data_quality_score IS NOT NULL);
CREATE INDEX idx_jobs_response_phase ON public.jobs USING btree (response_phase);
CREATE INDEX idx_jobs_sdgs ON public.jobs USING gin (sdgs);
CREATE INDEX idx_jobs_search_tsv ON public.jobs USING gin (search_tsv);
CREATE INDEX idx_jobs_status_deadline ON public.jobs USING btree (status, deadline);

CREATE OR REPLACE FUNCTION public.jobs_tsv_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
            BEGIN
                NEW.search_tsv := 
                    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
                    setweight(to_tsvector('english', COALESCE(NEW.org_name, '')), 'B') ||
                    setweight(to_tsvector('english', COALESCE(NEW.description_snippet, '')), 'C') ||
                    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.mission_tags, ' '), '')), 'D');
                RETURN NEW;
            END;
            $function$;

CREATE TRIGGER jobs_tsv_trigger BEFORE INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION jobs_tsv_update();
