-- Seed Taxonomy Data
-- Idempotent seed data for lookup tables

-- Countries (extended list)
INSERT INTO countries (code_iso2, name) VALUES
    ('IN', 'India'),
    ('KE', 'Kenya'),
    ('US', 'United States'),
    ('GB', 'United Kingdom'),
    ('ZA', 'South Africa'),
    ('CH', 'Switzerland'),
    ('FR', 'France'),
    ('DE', 'Germany'),
    ('CA', 'Canada'),
    ('AU', 'Australia')
ON CONFLICT (code_iso2) DO NOTHING;

-- Levels
INSERT INTO levels (key, label) VALUES
    ('intern', 'Intern'),
    ('junior', 'Junior'),
    ('mid', 'Mid'),
    ('senior', 'Senior'),
    ('lead', 'Lead'),
    ('executive', 'Executive')
ON CONFLICT (key) DO NOTHING;

-- Missions with SDG links
INSERT INTO missions (key, label, sdg_links) VALUES
    ('health', 'Health', ARRAY['SDG3']),
    ('education', 'Education', ARRAY['SDG4']),
    ('gender', 'Gender Equality', ARRAY['SDG5']),
    ('climate', 'Climate Action', ARRAY['SDG13']),
    ('governance', 'Governance', ARRAY['SDG16']),
    ('human_rights', 'Human Rights', ARRAY['SDG16']),
    ('wash', 'WASH', ARRAY['SDG6']),
    ('livelihoods', 'Livelihoods', ARRAY['SDG1', 'SDG8']),
    ('economic_growth', 'Economic Growth', ARRAY['SDG8']),
    ('peacebuilding', 'Peacebuilding', ARRAY['SDG16']),
    ('refugees', 'Refugees', ARRAY['SDG10']),
    ('urban', 'Urban Development', ARRAY['SDG11']),
    ('infrastructure', 'Infrastructure', ARRAY['SDG9']),
    ('energy', 'Energy', ARRAY['SDG7']),
    ('information_systems', 'Information Systems', ARRAY['SDG9']),
    ('communications', 'Communications', ARRAY['SDG9']),
    ('youth', 'Youth', ARRAY['SDG4']),
    ('culture', 'Culture', ARRAY['SDG11']),
    ('food_security', 'Food Security', ARRAY['SDG2']),
    ('innovation', 'Innovation', ARRAY['SDG9']),
    ('mel', 'Monitoring, Evaluation & Learning', ARRAY['SDG17']),
    ('cross_sector', 'Cross-Sector', ARRAY['SDG17'])
ON CONFLICT (key) DO NOTHING;

-- Work Modalities
INSERT INTO work_modalities (key, label) VALUES
    ('onsite', 'On-site'),
    ('field', 'Field-based'),
    ('remote', 'Remote'),
    ('hybrid', 'Hybrid'),
    ('home_based', 'Home-based'),
    ('flexible', 'Flexible')
ON CONFLICT (key) DO NOTHING;

-- Contract Types
INSERT INTO contracts (key, label) VALUES
    ('full_time', 'Full-time'),
    ('part_time', 'Part-time'),
    ('project_based', 'Project-based'),
    ('short_term', 'Short-term'),
    ('freelance', 'Freelance'),
    ('volunteer', 'Volunteer'),
    ('fixed_term', 'Fixed-term')
ON CONFLICT (key) DO NOTHING;

-- Organization Types
INSERT INTO org_types (key, label, parent) VALUES
    ('un', 'UN Agency', NULL),
    ('ingo', 'International NGO', NULL),
    ('ngo', 'Local NGO', NULL),
    ('gov', 'Government', NULL),
    ('csr', 'Corporate Social Responsibility', NULL),
    ('foundation', 'Foundation', NULL),
    ('academic', 'Academic Institution', NULL),
    ('social_enterprise', 'Social Enterprise', NULL),
    ('network', 'Network/Coalition', NULL)
ON CONFLICT (key) DO NOTHING;

-- Crisis Types
INSERT INTO crisis_types (key, label) VALUES
    ('conflict', 'Conflict'),
    ('earthquake', 'Earthquake'),
    ('flood', 'Flood'),
    ('drought', 'Drought'),
    ('epidemic', 'Epidemic'),
    ('cyclone', 'Cyclone'),
    ('displacement', 'Displacement')
ON CONFLICT (key) DO NOTHING;

-- Humanitarian Clusters
INSERT INTO clusters (key, label) VALUES
    ('health', 'Health'),
    ('wash', 'WASH'),
    ('shelter', 'Shelter'),
    ('protection', 'Protection'),
    ('cccm', 'Camp Coordination & Camp Management'),
    ('nutrition', 'Nutrition'),
    ('education', 'Education'),
    ('food_security', 'Food Security'),
    ('logistics', 'Logistics'),
    ('early_recovery', 'Early Recovery')
ON CONFLICT (key) DO NOTHING;

-- Response Phases
INSERT INTO response_phases (key, label) VALUES
    ('preparedness', 'Preparedness'),
    ('response', 'Response'),
    ('recovery', 'Recovery'),
    ('resilience', 'Resilience')
ON CONFLICT (key) DO NOTHING;

-- Benefits
INSERT INTO benefits (key, label) VALUES
    ('health_insurance', 'Health Insurance'),
    ('pension', 'Pension'),
    ('relocation', 'Relocation Support'),
    ('visa_sponsorship', 'Visa Sponsorship'),
    ('housing', 'Housing'),
    ('travel', 'Travel Allowance'),
    ('hazard_pay', 'Hazard Pay')
ON CONFLICT (key) DO NOTHING;

-- Policy Flags
INSERT INTO policy_flags (key, label) VALUES
    ('pay_transparent', 'Pay Transparency'),
    ('disability_friendly', 'Disability Friendly'),
    ('gender_friendly', 'Gender Friendly')
ON CONFLICT (key) DO NOTHING;

-- Donors
INSERT INTO donors (key, label) VALUES
    ('usaid', 'USAID'),
    ('giz', 'GIZ'),
    ('eu', 'European Union'),
    ('world_bank', 'World Bank'),
    ('adb', 'Asian Development Bank')
ON CONFLICT (key) DO NOTHING;
