/**
 * The demo's stand-in for the job-description generator: fixed rules and a written content library, no AI and no
 * network. Formats, groups, commitments, and checks follow the research recorded in the employer-side plan
 * (section 14); the production generator is decided later (decision E7).
 */
import type { Arrangement, Commitment, Engagement, Facts, Format, GroupKey, Org, Period, Section, SectionDef, Tone } from './types';

const DAY = 86_400_000;

export const GROUPS: Array<{ key: GroupKey; label: string; hint: string }> = [
  { key: 'employer', label: 'About the employer', hint: 'Who you are and where the post sits' },
  { key: 'job', label: 'The job', hint: 'What the person will do' },
  { key: 'person', label: 'The person', hint: 'What they need, essential and desirable' },
  { key: 'offer', label: 'The offer and conditions', hint: 'Pay, benefits, and the conditions of the post' },
  { key: 'apply', label: 'Applying', hint: 'How, by when, and what happens next' },
];

export const SECTIONS: SectionDef[] = [
  { key: 'about', label: 'About us', group: 'employer', hint: 'Who the organisation is, from its profile' },
  { key: 'team', label: 'Team purpose', group: 'employer', hint: 'What the team is there to do' },
  { key: 'background', label: 'Background', group: 'employer', hint: 'The programme or project the post belongs to' },
  { key: 'setting', label: 'Organisational setting', group: 'employer', hint: 'Where the post sits and who it reports to' },
  { key: 'purpose', label: 'Role purpose', group: 'job', hint: 'The job in two or three sentences' },
  { key: 'responsibilities', label: 'Responsibilities', group: 'job', hint: 'What the person will do, grouped' },
  { key: 'deliverables', label: 'Deliverables', group: 'job', hint: 'Outputs and timeline (consultancies)' },
  { key: 'relationships', label: 'Key working relationships', group: 'job', hint: 'Reports to, direct reports, who they work with' },
  { key: 'learning', label: 'Learning goals', group: 'job', hint: 'What an intern or fellow will learn' },
  { key: 'deployment', label: 'Deployment', group: 'job', hint: 'Availability and notice (rosters, surge)' },
  { key: 'firstweeks', label: 'Your first weeks', group: 'job', hint: 'What starting looks like' },
  { key: 'requirements', label: 'Qualifications and experience', group: 'person', hint: 'Essential and desirable' },
  { key: 'competencies', label: 'Competencies', group: 'person', hint: 'Skills and behaviours' },
  { key: 'languages', label: 'Languages', group: 'person', hint: 'Required and desirable' },
  { key: 'practical', label: 'Practical requirements', group: 'person', hint: 'Local language, licence, residence, travel' },
  { key: 'offer', label: 'What we offer', group: 'offer', hint: 'Pay, benefits, and leave' },
  { key: 'conditions', label: 'Conditions', group: 'offer', hint: 'Duty-station status, security, rest and recuperation' },
  { key: 'funding', label: 'Funding and contract conditions', group: 'offer', hint: 'Subject to funding, or contingent on an award' },
  { key: 'apply', label: 'How to apply', group: 'apply', hint: 'Method, documents, and process' },
  { key: 'assessment', label: 'Assessment', group: 'apply', hint: 'Tests and interviews' },
];

export const SECTION_BY_KEY: Record<string, SectionDef> = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

export const COMMITMENTS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'safeguarding', label: 'Safeguarding', hint: 'Keeping children and adults at risk safe' },
  { key: 'psea', label: 'PSEA', hint: 'Protection from sexual exploitation, abuse and harassment (IASC Six Core Principles)' },
  { key: 'mds', label: 'Misconduct Disclosure Scheme', hint: 'For members of the inter-agency scheme (SCHR, CHS Alliance)' },
  { key: 'checks', label: 'Background checks', hint: 'References and checks for the country of work' },
  { key: 'ct', label: 'Counter-terrorism checks', hint: 'Sanctions screening some donors require' },
  { key: 'fraud', label: 'No fee, fraud warning', hint: 'Candidates are never charged' },
  { key: 'equal', label: 'Equal opportunity', hint: 'Who you welcome' },
  { key: 'encourage', label: 'Apply even if…', hint: '"You don\'t need to meet every requirement"' },
  { key: 'adjustments', label: 'Adjustments', hint: 'Reasonable adjustments in the process' },
  { key: 'dataprot', label: 'Data protection', hint: "How applicants' data is handled" },
  { key: 'righttowork', label: 'Right to work', hint: 'Work authorisation for the country' },
  { key: 'unconsiderations', label: 'UN considerations', hint: 'For UN entities' },
  { key: 'esr', label: 'Environmental and social responsibility', hint: 'How the organisation manages its environmental and social impact (ESG)' },
];

const DOC_ORDER = SECTIONS.map((s) => s.key);

/** Ten real formats, named by format (decision of 3 November 2026), with the headings their users write. */
export const FORMATS: Format[] = [
  {
    key: 'un-secretariat',
    label: 'UN Secretariat format',
    family: 'UN and multilateral',
    usedBy: 'UN Secretariat entities (UN Careers, Inspira)',
    tone: 'formal',
    order: [
      { key: 'setting', heading: 'Org. setting and reporting' },
      { key: 'responsibilities', heading: 'Responsibilities' },
      { key: 'competencies', heading: 'Competencies' },
      { key: 'requirements', heading: 'Education and work experience' },
      { key: 'languages', heading: 'Languages' },
      { key: 'assessment', heading: 'Assessment' },
    ],
    commitments: ['unconsiderations', 'fraud'],
  },
  {
    key: 'un-agency',
    label: 'UN agency format',
    family: 'UN and multilateral',
    usedBy: 'e.g. UNDP and other UN funds and programmes',
    tone: 'formal',
    order: [
      { key: 'background', heading: 'Background' },
      { key: 'responsibilities', heading: 'Duties and responsibilities' },
      { key: 'relationships', heading: 'Institutional arrangement' },
      { key: 'competencies', heading: 'Competencies' },
      { key: 'requirements', heading: 'Required skills and experience' },
      { key: 'languages', heading: 'Languages' },
    ],
    commitments: ['fraud', 'equal'],
  },
  {
    key: 'ingo-role-profile',
    label: 'INGO role profile',
    family: 'INGO and humanitarian',
    usedBy: 'e.g. Save the Children, World Vision',
    tone: 'formal',
    order: [
      { key: 'purpose', heading: 'Role purpose' },
      { key: 'relationships', heading: 'Scope of role' },
      { key: 'responsibilities', heading: 'Key areas of accountability' },
      { key: 'competencies', heading: 'Behaviours' },
      { key: 'requirements', heading: 'Qualifications and experience' },
    ],
    commitments: ['safeguarding', 'checks', 'equal', 'fraud'],
  },
  {
    key: 'ingo-purpose',
    label: 'INGO purpose-led',
    family: 'INGO and humanitarian',
    usedBy: 'e.g. Oxfam',
    tone: 'warm',
    order: [
      { key: 'team', heading: 'Team purpose' },
      { key: 'purpose', heading: 'Job purpose' },
      { key: 'responsibilities', heading: 'Key responsibilities' },
      { key: 'requirements', heading: 'What we are looking for' },
      { key: 'offer', heading: 'We offer' },
      { key: 'apply', heading: 'How to apply' },
    ],
    commitments: ['safeguarding', 'mds', 'ct', 'equal'],
  },
  {
    key: 'about-you',
    label: '"About you" narrative',
    family: 'INGO and humanitarian',
    usedBy: 'e.g. Plan International, CARE International UK, Christian Aid',
    tone: 'warm',
    order: [
      { key: 'about', heading: 'The organisation' },
      { key: 'purpose', heading: 'The opportunity' },
      { key: 'responsibilities', heading: 'Key responsibilities' },
      { key: 'requirements', heading: 'About you' },
      { key: 'offer', heading: 'What we offer' },
      { key: 'apply', heading: 'How to apply' },
    ],
    commitments: ['safeguarding', 'mds', 'equal', 'fraud'],
  },
  {
    key: 'field-profile',
    label: 'Humanitarian field profile',
    family: 'INGO and humanitarian',
    usedBy: 'e.g. MSF, IRC, NRC',
    tone: 'plain',
    order: [
      { key: 'purpose', heading: 'Main purpose' },
      { key: 'responsibilities', heading: 'Accountabilities' },
      { key: 'relationships', heading: 'Key working relationships' },
      { key: 'requirements', heading: 'Requirements' },
      { key: 'conditions', heading: 'Conditions' },
      { key: 'apply', heading: 'How to apply' },
    ],
    commitments: ['safeguarding', 'psea', 'fraud', 'equal'],
  },
  {
    key: 'donor',
    label: 'Government donor',
    family: 'Donors, foundations and contractors',
    usedBy: 'e.g. GIZ; FCDO uses essential and desirable criteria and behaviours',
    tone: 'formal',
    order: [
      { key: 'background', heading: 'About the programme' },
      { key: 'responsibilities', heading: 'Your tasks' },
      { key: 'requirements', heading: 'Your profile' },
      { key: 'offer', heading: 'What we offer' },
      { key: 'apply', heading: 'How to apply' },
    ],
    commitments: ['equal', 'righttowork', 'checks'],
  },
  {
    key: 'contractor',
    label: 'Development contractor',
    family: 'Donors, foundations and contractors',
    usedBy: 'e.g. DAI, Palladium, Chemonics',
    tone: 'formal',
    order: [
      { key: 'purpose', heading: 'Position overview' },
      { key: 'responsibilities', heading: 'Responsibilities' },
      { key: 'deliverables', heading: 'Deliverables' },
      { key: 'requirements', heading: 'Qualifications' },
      { key: 'funding', heading: 'Funding and contract conditions' },
      { key: 'apply', heading: 'How to apply' },
    ],
    commitments: ['equal', 'fraud', 'safeguarding'],
  },
  {
    key: 'local-concise',
    label: 'Local NGO concise',
    family: 'National NGOs and charities',
    usedBy: 'e.g. BRAC, Amref, Kenya Red Cross',
    tone: 'plain',
    order: [
      { key: 'background', heading: 'Project brief' },
      { key: 'purpose', heading: 'Job purpose' },
      { key: 'responsibilities', heading: 'Key responsibilities' },
      { key: 'requirements', heading: 'Qualifications and experience' },
      { key: 'apply', heading: 'How to apply' },
    ],
    commitments: ['fraud', 'safeguarding', 'equal'],
  },
  {
    key: 'charity',
    label: 'Domestic charity',
    family: 'National NGOs and charities',
    usedBy: 'UK, US, and Australian charities and nonprofits',
    tone: 'warm',
    order: [
      { key: 'purpose', heading: 'About the role' },
      { key: 'responsibilities', heading: "What you'll do" },
      { key: 'requirements', heading: 'About you' },
      { key: 'offer', heading: 'Why join us' },
      { key: 'apply', heading: 'How to apply' },
    ],
    commitments: ['equal', 'encourage', 'adjustments', 'checks'],
  },
];

export const FAMILIES_ORDER: Array<Format['family']> = ['Your organisation', 'UN and multilateral', 'INGO and humanitarian', 'Donors, foundations and contractors', 'National NGOs and charities'];

/** The closest real format for an organisation type, when none has been learned. */
export const FORMAT_FOR_TYPE: Record<Org['orgType'], string> = {
  un: 'un-agency',
  ingo: 'about-you',
  ngo: 'local-concise',
  charity: 'charity',
  donor: 'donor',
  contractor: 'contractor',
};

type RoleFamily = {
  key: string;
  title: string;
  words: string[];
  sector: string;
  sdg: number;
  resp: string[];
  more: string[];
  essential: string[];
  desirable: string[];
  comp: string[];
  deliverables: string[];
  learning: string[];
};

export const ROLE_FAMILIES: RoleFamily[] = [
  {
    key: 'wash',
    title: 'WASH Programme Manager',
    words: ['wash', 'water', 'sanitation', 'hygiene'],
    sector: 'Water, sanitation and hygiene',
    sdg: 6,
    resp: [
      'Lead the design, delivery, and quality of the water, sanitation, and hygiene programme across project sites',
      'Manage the WASH team and partners, including work plans, coaching, and performance reviews',
      'Oversee the programme budget, procurement plans, and monthly spending against forecast',
      'Make sure water systems and latrines meet Sphere and national standards',
      'Represent the organisation in the WASH cluster and with local water authorities',
      'Prepare donor reports and proposals with the grants and MEAL teams',
    ],
    more: ['Plan hygiene promotion with communities, including women and people with disabilities', 'Lead water-quality monitoring and act on the results', 'Prepare the WASH response for cholera or flooding, with pre-positioned stock'],
    essential: ["Degree in civil or environmental engineering, public health, or a related field", 'Experience managing WASH programmes in humanitarian or development settings', 'Experience managing budgets and leading teams'],
    desirable: ['Knowledge of Sphere standards and the WASH cluster', 'Experience with cholera preparedness'],
    comp: ['Leads teams through change and pressure', 'Builds trust with communities and authorities', 'Plans and solves problems in the field'],
    deliverables: ['Inception report with method and work plan', 'Assessment of water points and sanitation facilities', 'Draft report with recommendations', 'Final report and validation workshop'],
    learning: ['How a WASH programme is planned and monitored', 'Water-quality testing in the field', 'Writing for donors'],
  },
  {
    key: 'health',
    title: 'Health Programme Officer',
    words: ['health', 'medical', 'clinic', 'epidemiolog', 'nurse', 'doctor', 'malaria', 'vaccin'],
    sector: 'Health',
    sdg: 3,
    resp: ['Support primary health care activities with health facilities and community health workers', 'Monitor health indicators and the quality of services', 'Coordinate with the Ministry of Health and the health cluster', 'Manage medical supplies with the logistics team', 'Train health staff and volunteers'],
    more: ['Support outbreak preparedness and response', 'Make sure services reach women, children, and people with disabilities'],
    essential: ['Degree in medicine, nursing, public health, or a related field', 'Experience in health programmes in low-resource settings'],
    desirable: ['Knowledge of national health policies'],
    comp: ['Works well with government counterparts', 'Accurate with data', 'Calm under pressure'],
    deliverables: ['Inception report', 'Health facility assessment', 'Draft and final report'],
    learning: ['How health programmes are monitored', 'Working with health authorities'],
  },
  {
    key: 'nutrition',
    title: 'Nutrition Officer',
    words: ['nutrition', 'malnutrition', 'cmam', 'iycf', 'feeding programme', 'feeding program'],
    sector: 'Nutrition',
    sdg: 2,
    resp: [
      'Run community-based management of acute malnutrition with health facilities and community volunteers',
      'Organise screening for acute malnutrition and follow up referrals to treatment',
      'Promote infant and young child feeding with mothers, caregivers, and community groups',
      'Track nutrition supplies and stock with the logistics team',
      'Coordinate with the Ministry of Health and the nutrition cluster',
    ],
    more: ['Support nutrition surveys and act on their results', 'Make sure services reach pregnant and breastfeeding women and children under five'],
    essential: ['Degree in nutrition, public health, or a related field', 'Experience in nutrition programmes in humanitarian or development settings'],
    desirable: ['Knowledge of national nutrition protocols and the nutrition cluster'],
    comp: ['Works closely with communities and health staff', 'Accurate with data', 'Calm under pressure'],
    deliverables: ['Inception report', 'Nutrition assessment', 'Draft and final report'],
    learning: ['How nutrition programmes are run and monitored', 'Screening and referral in the field'],
  },
  {
    key: 'protection',
    title: 'Child Protection Specialist',
    words: ['protection', 'child', 'gbv', 'gender-based', 'safeguard', 'caseworker', 'case worker'],
    sector: 'Child protection',
    sdg: 16,
    resp: ['Lead case management for children at risk, with clear referral pathways', 'Train staff and partners on child protection and safeguarding', 'Coordinate with the child protection area of responsibility and local authorities', 'Monitor the quality of services and the wellbeing of children', 'Support community-based protection groups'],
    more: ['Run child-friendly spaces with partners', 'Advise programmes on safe and inclusive design'],
    essential: ['Degree in social work, law, psychology, or a related field', 'Experience in child protection case management'],
    desirable: ['Knowledge of the Minimum Standards for Child Protection in Humanitarian Action'],
    comp: ['Puts the child first', 'Discreet with sensitive information', 'Builds strong partnerships'],
    deliverables: ['Inception report', 'Mapping of services and referral pathways', 'Final report'],
    learning: ['How case management works', 'Safeguarding in practice'],
  },
  {
    key: 'education',
    title: 'Education Officer',
    words: ['education', 'teacher', 'school', 'learning centre'],
    sector: 'Education',
    sdg: 4,
    resp: ['Support schools and learning centres to deliver quality education', 'Train teachers in child-centred methods', 'Monitor attendance and learning outcomes', 'Work with parents and education authorities'],
    more: ['Support education in emergencies preparedness', 'Promote inclusive education for children with disabilities'],
    essential: ['Degree in education or a related field', 'Experience in education programmes'],
    desirable: ['Knowledge of INEE Minimum Standards'],
    comp: ['Communicates clearly with communities', 'Organised and reliable'],
    deliverables: ['Inception report', 'Learning assessment', 'Final report'],
    learning: ['How education programmes are run', 'Monitoring learning outcomes'],
  },
  {
    key: 'meal',
    title: 'MEAL Coordinator',
    words: ['meal', 'm&e', 'monitoring', 'evaluation', 'accountability'],
    sector: 'Monitoring and evaluation',
    sdg: 17,
    resp: ['Lead monitoring, evaluation, accountability, and learning (MEAL) across the country programme', 'Design indicators, tools, and data systems', 'Run the feedback and complaints mechanism', 'Lead evaluations and learning reviews', 'Train staff on data quality'],
    more: ['Produce dashboards for management', 'Support proposal writing with results frameworks'],
    essential: ['Degree in statistics, social sciences, or a related field', 'Experience leading MEAL systems'],
    desirable: ['Skills in Kobo and a statistics package'],
    comp: ['Analytical', 'Turns data into decisions', 'Coaches others'],
    deliverables: ['Evaluation design', 'Data collection and analysis', 'Evaluation report'],
    learning: ['How MEAL systems work', 'Data collection tools'],
  },
  {
    key: 'finance',
    title: 'Finance Officer',
    words: ['finance', 'accountant', 'accounting', 'budget', 'grants'],
    sector: 'Finance',
    sdg: 17,
    resp: ['Process payments and keep accurate accounting records', 'Prepare monthly financial reports and reconciliations', 'Support budget monitoring with programme teams', 'Make sure spending follows donor rules and internal policies', 'Support audits'],
    more: ['Train staff on finance procedures', 'Manage petty cash and bank transfers'],
    essential: ['Degree in accounting, finance, or a related field', 'Experience in NGO finance'],
    desirable: ['A professional accounting qualification (ACCA, CPA)'],
    comp: ['Accurate', 'Honest and transparent', 'Meets deadlines'],
    deliverables: ['Financial review', 'Recommendations report'],
    learning: ['NGO finance procedures', 'Donor reporting'],
  },
  {
    key: 'logistics',
    title: 'Logistics Officer',
    words: ['logistics', 'supply', 'procurement', 'fleet', 'warehouse'],
    sector: 'Logistics',
    sdg: 9,
    resp: ['Manage procurement in line with policy and donor rules', 'Run warehouses and stock control', 'Manage the vehicle fleet and movements', 'Support distributions with programme teams'],
    more: ['Pre-position emergency stock', 'Assess suppliers and markets'],
    essential: ['Degree or diploma in logistics or supply chain', 'Experience in humanitarian logistics'],
    desirable: ['Knowledge of donor procurement rules'],
    comp: ['Organised', 'Solves problems quickly', 'Works well across teams'],
    deliverables: ['Supply chain assessment', 'Recommendations report'],
    learning: ['Humanitarian supply chains', 'Procurement procedures'],
  },
  {
    key: 'comms',
    title: 'Communications Officer',
    words: ['communications', 'comms', 'advocacy', 'media', 'content'],
    sector: 'Communications',
    sdg: 17,
    resp: ['Produce stories, photos, and videos from programmes', 'Manage social media and the website', 'Support advocacy and media relations', 'Follow consent and safeguarding rules for content'],
    more: ['Prepare donor visibility materials', 'Train staff on storytelling'],
    essential: ['Degree in communications, journalism, or a related field', 'Experience in NGO communications'],
    desirable: ['Photography or video skills'],
    comp: ['Creative', 'Respects dignity in storytelling', 'Works to deadlines'],
    deliverables: ['Content plan', 'Stories and media package'],
    learning: ['NGO communications', 'Ethical storytelling'],
  },
  {
    key: 'esg',
    title: 'ESG and Safeguards Specialist',
    words: ['esg', 'e&s', 'environmental and social', 'safeguards specialist', 'safeguards officer', 'esia', 'esms', 'sustainability'],
    sector: 'ESG and environmental and social safeguards',
    sdg: 12,
    resp: [
      'Apply the environmental and social standards the funding requires (such as the World Bank ESF or the IFC Performance Standards) across the portfolio',
      'Screen projects and partners for environmental and social risk, and agree the actions that manage it',
      'Prepare and review environmental and social impact assessments and management plans',
      'Set up grievance mechanisms and stakeholder engagement with affected communities',
      'Monitor compliance in the field and report to management and funders',
    ],
    more: ['Train staff and partners on the standards', 'Track ESG indicators and contribute to sustainability reporting'],
    essential: ['Degree in environmental science, social science, or a related field', 'Experience applying environmental and social safeguards or ESG frameworks'],
    desirable: ['Knowledge of the World Bank ESF, the IFC Performance Standards, or equivalent', 'Experience with development finance institutions'],
    comp: ['Balances risk and delivery', 'Explains standards clearly', 'Works well with communities and authorities'],
    deliverables: ['Environmental and social risk screening', 'Environmental and social management plan', 'Monitoring report with recommendations'],
    learning: ['How environmental and social standards are applied', 'Risk screening in the field'],
  },
  {
    key: 'climate',
    title: 'Climate Resilience Adviser',
    words: ['climate', 'environment', 'resilience', 'adaptation'],
    sector: 'Climate and environment',
    sdg: 13,
    resp: ['Advise programmes on climate risk and adaptation', 'Design community resilience projects', 'Support climate finance proposals', 'Represent the organisation in climate networks'],
    more: ['Develop early warning and anticipatory action plans', 'Measure environmental impact of programmes'],
    essential: ['Degree in environmental science, climate policy, or a related field', 'Experience in climate adaptation programmes'],
    desirable: ['Knowledge of climate finance'],
    comp: ['Thinks across sectors', 'Influences decision-makers'],
    deliverables: ['Climate risk assessment', 'Adaptation plan'],
    learning: ['Climate adaptation in practice', 'Climate finance basics'],
  },
  {
    key: 'livelihoods',
    title: 'Livelihoods Officer',
    words: ['livelihood', 'food security', 'cash', 'economic', 'agricultur'],
    sector: 'Livelihoods and food security',
    sdg: 2,
    resp: ['Deliver cash and livelihoods activities with communities', 'Run market assessments', 'Support farmer and business groups', 'Monitor household food security'],
    more: ['Link groups to markets and financial services', 'Support cash transfer systems'],
    essential: ['Degree in agriculture, economics, or a related field', 'Experience in livelihoods or cash programmes'],
    desirable: ['Experience with digital cash transfers'],
    comp: ['Works closely with communities', 'Practical and organised'],
    deliverables: ['Market assessment', 'Final report'],
    learning: ['Cash programming', 'Market assessments'],
  },
  {
    key: 'hr',
    title: 'HR Officer',
    words: ['hr ', 'human resources', 'people and culture', 'recruitment'],
    sector: 'Human resources',
    sdg: 8,
    resp: ['Run recruitment from job posting to contract', 'Maintain staff records and HR systems', 'Support performance management and learning', 'Advise managers on HR policy and labour law'],
    more: ['Support staff wellbeing initiatives', 'Prepare payroll inputs'],
    essential: ['Degree in human resources or a related field', 'Experience in HR in an NGO'],
    desirable: ['A professional HR qualification'],
    comp: ['Discreet', 'Fair and consistent'],
    deliverables: ['HR policy review', 'Recommendations'],
    learning: ['Recruitment in an NGO', 'HR systems'],
  },
  {
    key: 'programme',
    title: 'Programme Manager',
    words: ['programme', 'program', 'project manager', 'project'],
    sector: 'Programme management',
    sdg: 17,
    resp: ['Lead the delivery of the programme on time and on budget', 'Manage the programme team and partners', 'Monitor results with the MEAL team', 'Report to donors and senior management', 'Represent the organisation with partners and authorities'],
    more: ['Develop new proposals', 'Manage risks and compliance'],
    essential: ['Degree in development studies or a related field', 'Experience managing development or humanitarian programmes'],
    desirable: ['Experience with institutional donors'],
    comp: ['Leads and motivates', 'Plans and delivers', 'Builds partnerships'],
    deliverables: ['Inception report', 'Draft and final reports'],
    learning: ['Programme management', 'Donor reporting'],
  },
];

const ROLE_BY_KEY: Record<string, RoleFamily> = Object.fromEntries(ROLE_FAMILIES.map((f) => [f.key, f]));

export type Place = { city: string; country: string; iso: string; risky?: boolean; tz: string; currency: string; payLaw?: string };

export const PLACES: Place[] = [
  { city: 'Nairobi', country: 'Kenya', iso: 'KE', tz: 'EAT', currency: 'KES' },
  { city: 'Kampala', country: 'Uganda', iso: 'UG', tz: 'EAT', currency: 'UGX' },
  { city: 'Addis Ababa', country: 'Ethiopia', iso: 'ET', tz: 'EAT', currency: 'ETB' },
  { city: 'Juba', country: 'South Sudan', iso: 'SS', risky: true, tz: 'CAT', currency: 'USD' },
  { city: 'Goma', country: 'DR Congo', iso: 'CD', risky: true, tz: 'CAT', currency: 'USD' },
  { city: 'Mogadishu', country: 'Somalia', iso: 'SO', risky: true, tz: 'EAT', currency: 'USD' },
  { city: 'Maiduguri', country: 'Nigeria', iso: 'NG', risky: true, tz: 'WAT', currency: 'NGN' },
  { city: 'Abuja', country: 'Nigeria', iso: 'NG', tz: 'WAT', currency: 'NGN' },
  { city: 'Dakar', country: 'Senegal', iso: 'SN', tz: 'GMT', currency: 'XOF' },
  { city: 'Amman', country: 'Jordan', iso: 'JO', tz: 'AST', currency: 'JOD' },
  { city: "Cox's Bazar", country: 'Bangladesh', iso: 'BD', risky: true, tz: 'BST', currency: 'BDT' },
  { city: 'Dhaka', country: 'Bangladesh', iso: 'BD', tz: 'BST', currency: 'BDT' },
  { city: 'Kabul', country: 'Afghanistan', iso: 'AF', risky: true, tz: 'AFT', currency: 'USD' },
  { city: 'Kathmandu', country: 'Nepal', iso: 'NP', tz: 'NPT', currency: 'NPR' },
  { city: 'New Delhi', country: 'India', iso: 'IN', tz: 'IST', currency: 'INR' },
  { city: 'Manila', country: 'Philippines', iso: 'PH', tz: 'PHT', currency: 'PHP' },
  { city: 'Port-au-Prince', country: 'Haiti', iso: 'HT', risky: true, tz: 'EST', currency: 'USD' },
  { city: 'Bogotá', country: 'Colombia', iso: 'CO', tz: 'COT', currency: 'COP' },
  { city: 'Geneva', country: 'Switzerland', iso: 'CH', tz: 'CET', currency: 'CHF' },
  { city: 'London', country: 'United Kingdom', iso: 'GB', tz: 'GMT', currency: 'GBP' },
  { city: 'New York', country: 'United States', iso: 'US', tz: 'EST', currency: 'USD', payLaw: 'New York' },
  { city: 'Denver', country: 'United States', iso: 'US', tz: 'MST', currency: 'USD', payLaw: 'Colorado' },
  { city: 'Melbourne', country: 'Australia', iso: 'AU', tz: 'AEDT', currency: 'AUD' },
  { city: 'Lilongwe', country: 'Malawi', iso: 'MW', tz: 'CAT', currency: 'MWK' },
  { city: 'Maputo', country: 'Mozambique', iso: 'MZ', tz: 'CAT', currency: 'MZN' },
];

export const LANGUAGES = ['English', 'French', 'Spanish', 'Arabic', 'Portuguese', 'Swahili', 'Amharic', 'Somali', 'Hausa', 'Hindi', 'Bengali'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const HOLIDAYS: Record<string, string[]> = { KE: ['01-01', '05-01', '06-01', '10-10', '10-20', '12-12', '12-25', '12-26'], default: ['01-01', '12-25'] };

export function isoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function addDays(ms: number, n: number): string {
  return isoDay(ms + n * DAY);
}
export function parseIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}
export function daysUntil(today: number, iso: string): number {
  return Math.round((parseIso(iso) - startOfDay(today)) / DAY);
}

/** Acronyms said as words, not letter by letter, so they take the article of their first sound: "a MEAL Coordinator". */
const SAID_AS_WORDS = /^(MEAL|MERL|NATO|NORCAP|SMART|HEAT|RedR|FEWS|SPHERE|LEGS)\b/;

/** "a" or "an" before a word, by its sound: "an Education Specialist", "a UNICEF post", "an HR Officer", "a MEAL Coordinator". */
export function article(word: string): 'a' | 'an' {
  const w = word.trim();
  if (SAID_AS_WORDS.test(w)) return /^[AEIOU]/.test(w) ? 'an' : 'a';
  if (/^(uni|use|usu|eu|one|once)/i.test(w) || /^U[A-Z]/.test(w)) return 'a';
  if (/^(hour|honest|honou?r|heir)/i.test(w) || /^[FHLMNRSX][A-Z]/.test(w)) return 'an';
  return /^[aeiou]/i.test(w) ? 'an' : 'a';
}

export function longDate(iso: string): string {
  return iso ? new Date(parseIso(iso)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}
export function shortDate(iso: string): string {
  return iso ? new Date(parseIso(iso)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
}
/** Countries whose working week runs Sunday to Thursday, so the weekend is Friday and Saturday. */
const FRI_SAT = new Set(['AF', 'JO', 'IQ', 'YE', 'SA', 'EG', 'SY', 'LY', 'SD', 'OM', 'KW', 'BH', 'QA', 'AE', 'PS', 'DZ']);

export function weekend(iso: string, countryIso = ''): boolean {
  const d = new Date(parseIso(iso)).getDay();
  return FRI_SAT.has(countryIso) ? d === 5 || d === 6 : d === 0 || d === 6;
}
export function holiday(iso: string, countryIso: string): boolean {
  return (HOLIDAYS[countryIso] ?? HOLIDAYS.default).includes(iso.slice(5));
}
export function placeOf(location: string): Place | undefined {
  return PLACES.find((p) => location.startsWith(p.city));
}

export function emptyFacts(): Facts {
  return {
    title: '',
    location: '',
    country: '',
    iso: '',
    arrangement: 'onsite',
    engagement: 'job',
    contract: '',
    hours: 'full',
    recruitment: 'vacancy',
    subjectToFunding: false,
    grade: '',
    duration: '',
    deadline: '',
    closingTime: '23:59',
    timezone: '',
    salaryMode: 'hidden',
    salaryMin: '',
    salaryMax: '',
    currency: '',
    period: 'month',
    languages: [],
    eligibility: 'anyone',
    safeguarding: '',
    directReports: '',
    startDate: '',
    positions: '1',
    donor: '',
    availability: '',
    client: '',
    keyPersonnel: false,
  };
}

export const ENGAGEMENTS: Array<{ key: Engagement; label: string; hint: string; google: string }> = [
  { key: 'job', label: 'Job', hint: 'A paid position, permanent or temporary', google: 'FULL_TIME' },
  { key: 'consultancy', label: 'Consultancy', hint: 'A specialised task or advice for a limited period', google: 'CONTRACTOR' },
  { key: 'internship', label: 'Internship or fellowship', hint: 'Practical experience for students, graduates, or fellows', google: 'INTERN' },
  { key: 'volunteer', label: 'Volunteer', hint: 'Unpaid or with an allowance', google: 'VOLUNTEER' },
];

export const CONTRACTS: Record<Engagement, string[]> = {
  job: ['Fixed-term', 'Temporary (under a year)', 'Open-ended', 'Continuing'],
  consultancy: ['Consultant', 'Individual contractor'],
  internship: ['Internship', 'Fellowship'],
  volunteer: ['Volunteer', 'UN Volunteer'],
};

export function googleType(f: Facts): string[] {
  const t = [ENGAGEMENTS.find((e) => e.key === f.engagement)?.google ?? 'OTHER'];
  if (f.engagement === 'job') t[0] = f.hours === 'part' ? 'PART_TIME' : f.contract.startsWith('Temporary') ? 'TEMPORARY' : 'FULL_TIME';
  return t;
}

export function detectRole(text: string): { role: RoleFamily | null; engagement: Engagement | null } {
  const t = ` ${text.toLowerCase()} `;
  let engagement: Engagement | null = null;
  if (/\bconsult(ant|ancy)\b|terms of reference|\btor\b/.test(t)) engagement = 'consultancy';
  else if (/\bintern(ship)?\b|\bfellow(ship)?\b/.test(t)) engagement = 'internship';
  else if (/\bvolunteer\b/.test(t)) engagement = 'volunteer';
  // ESG's phrases are the most specific ("environmental and social safeguards"), so they are read before child protection's "safeguard".
  const pick = (s: string) => {
    const esg = ROLE_FAMILIES.find((f) => f.key === 'esg' && f.words.some((w) => s.includes(w)));
    return esg ?? ROLE_FAMILIES.find((f) => f.key !== 'programme' && f.words.some((w) => s.includes(w))) ?? ROLE_FAMILIES.find((f) => f.key === 'programme' && f.words.some((w) => s.includes(w))) ?? null;
  };
  // The role is named in the first sentence; later ones describe the work ("with 3 partner clinics") and are read only if it names none.
  const role = pick(`${t.split(/[.!?;]\s/)[0]} `) ?? pick(t);
  return { role, engagement };
}

function titleCase(s: string): string {
  const small = new Set(['and', 'of', 'for', 'the', 'in', 'on', 'to', 'a']);
  return s
    .split(/\s+/)
    .map((w, i) => {
      if (/^[A-Z0-9&]{2,}$/.test(w)) return w;
      const lw = w.toLowerCase();
      if (i > 0 && small.has(lw)) return lw;
      if (['wash', 'meal', 'hr', 'gbv'].includes(lw)) return lw.toUpperCase();
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    })
    .join(' ');
}

function titleFrom(text: string, role: RoleFamily | null, engagement: Engagement | null): string {
  const m = text.match(/\b(?:hiring|recruiting|looking for|need|seeking)\s+(?:an?\s+|the\s+)?([a-z&][a-z&\s/–-]{2,60}?)(?=\s+(?:in|for|based|at|to|on|with|who)\b|[,.;:(]|\s+[–-]\s|$)/i);
  if (m) {
    const raw = m[1].trim().replace(/\s+/g, ' ');
    const vague = /^(?:someone|somebody|anyone|people|person|staff|help|support|candidates?|new (?:people|staff)|more (?:people|staff))\b/i.test(raw);
    if (!vague && raw.split(' ').length <= 7) return titleCase(raw);
  }
  if (!role) return '';
  const sector = role.key === 'programme' ? 'Programme' : role.title.split(' ').slice(0, -1).join(' ') || role.title;
  if (engagement === 'consultancy') return `${sector} Consultant`;
  if (engagement === 'internship') return `${sector} Intern`;
  return role.title;
}

function nextDate(today: number, day: number, monthIdx: number, year?: number): string {
  const now = new Date(startOfDay(today));
  let y = year ?? now.getFullYear();
  let d = new Date(y, monthIdx, day);
  if (!year && d.getTime() < now.getTime()) {
    y += 1;
    d = new Date(y, monthIdx, day);
  }
  return isoDay(d.getTime());
}

const MONEY = /(?:\b(?:USD|US\$|EUR|GBP|KES|AUD|INR)|[$€£])\s?(\d[\d,.]*k?)(?:\s?(?:-|–|to)\s?(\d[\d,.]*k?))?(?:\s?(?:a|per|\/)\s?(hour|day|month|year|annum))?/gi;
const PAY_WORD = /\b(?:salary|salaries|pay|paid|paying|stipend|wages?|remuneration|compensation|gross|net|earn\w*|fees?|rate)\b/i;
const NOT_PAY_BEFORE = /\b(?:budgets?|purchases?|procurement|spend\w*|approv\w*|authori[sz]\w*|thresholds?|limits?|up to|sign(?:ing)?[- ]off|grants?|awards?|worth|value|portfolio|funding|turnover)\b[^.;\n]{0,30}$/i;
const NOT_PAY_AFTER = /^\s*(?:per|a|each|for each)\s+(?:purchase|transaction|order|item|invoice|payment|request|contract|grant|procurement)\b/i;

/**
 * The first amount in the text that is pay: a range, an amount per hour, day, month, or year, or one next to a pay word ("salary",
 * "stipend"). A budget, a spending limit, or an amount per purchase is not pay ("approves purchases up to USD 5,000 per purchase").
 */
function payIn(t: string): string[] | null {
  for (const m of t.matchAll(MONEY)) {
    const at = m.index ?? 0;
    const before = t.slice(Math.max(0, at - 40), at);
    const after = t.slice(at + m[0].length, at + m[0].length + 30);
    if (NOT_PAY_BEFORE.test(before) || NOT_PAY_AFTER.test(after)) continue;
    if (m[2] || m[3] || PAY_WORD.test(before) || PAY_WORD.test(after.slice(0, 20))) return [m[0], m[0].replace(/\s?\d.*$/, ''), m[1], m[2], m[3]];
  }
  return null;
}

export function extractFacts(text: string, today: number, base: Facts = emptyFacts()): { facts: Facts; role: RoleFamily | null; engagement: Engagement | null } {
  const { role, engagement } = detectRole(text);
  const f: Facts = { ...base, languages: [...base.languages] };
  const t = text;
  const title = titleFrom(t, role, engagement);
  if (title && !base.title) f.title = title;
  if (engagement) {
    f.engagement = engagement;
    if (!f.contract || !CONTRACTS[engagement].includes(f.contract)) f.contract = CONTRACTS[engagement][0];
  }
  const place = PLACES.find((p) => new RegExp(`\\b${p.city.replace(/[.*+?^${}()|[\]\\']/g, '.')}\\b`, 'i').test(t));
  if (place) {
    f.location = `${place.city}, ${place.country}`;
    f.country = place.country;
    f.iso = place.iso;
    f.timezone = place.tz;
    if (!f.currency) f.currency = place.currency;
  } else if (!base.location) {
    const loose = looseLocation(t);
    if (loose) {
      f.location = loose.location;
      f.country = loose.country;
    }
  }
  if (/\bremote\b|home[- ]based|work from home/i.test(t)) f.arrangement = 'remote';
  else if (/\bhybrid\b/i.test(t)) f.arrangement = 'hybrid';
  const grade = t.match(/\b(P-?[1-5]|D-?[12]|G-?[1-7]|NO-?[A-D])\b/i);
  if (grade) f.grade = grade[1].toUpperCase().replace('-', '');
  const months = t.match(/\b(\d{1,2})[- ]?(?:month|months|mo)\b/i);
  const years = t.match(/\b(\d)[- ]?(?:year|years)\b(?!\s+(?:of\s+)?experience)/i);
  if (months) f.duration = `${Number(months[1])} months`;
  else if (years) f.duration = `${Number(years[1])} ${Number(years[1]) === 1 ? 'year' : 'years'}`;
  if (/fixed[- ]term/i.test(t)) f.contract = 'Fixed-term';
  else if (/\btemporary\b/i.test(t)) f.contract = 'Temporary (under a year)';
  else if (/permanent|open[- ]ended/i.test(t)) f.contract = 'Open-ended';
  else if (f.duration && !f.contract) f.contract = 'Fixed-term';
  if (/\bpart[- ]time\b/i.test(t)) f.hours = 'part';
  if (/\broster\b|talent pool|\bpool\b/i.test(t)) f.recruitment = 'roster';
  else if (/contingent|proposal stage|key personnel/i.test(t)) f.recruitment = 'proposal';
  if (/subject to (?:continued )?funding/i.test(t)) f.subjectToFunding = true;
  const iso = t.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
  const dm = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(20\d\d))?/i);
  const md = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d\d))?/i);
  const weeks = t.match(/\b(?:in|within)\s+(\d)\s+weeks?\b/i);
  const slash = t.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d\d)\b/);
  const endOf = t.match(/\bend of (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
  const weekday = t.match(/\b(?:by |on |this |next )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (iso) f.deadline = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else if (dm) f.deadline = nextDate(today, Number(dm[1]), MONTHS.indexOf(dm[2].toLowerCase()), dm[3] ? Number(dm[3]) : undefined);
  else if (md) f.deadline = nextDate(today, Number(md[2]), MONTHS.indexOf(md[1].toLowerCase()), md[3] ? Number(md[3]) : undefined);
  else if (weeks) f.deadline = addDays(today, Number(weeks[1]) * 7);
  else if (slash) f.deadline = `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  else if (endOf) {
    const m = MONTHS.indexOf(endOf[1].toLowerCase());
    const y = new Date(today).getUTCFullYear() + (m < new Date(today).getUTCMonth() ? 1 : 0);
    f.deadline = isoDay(Date.UTC(y, m + 1, 0, 12));
  } else if (weekday && /clos|deadline|by|until|^\s*(?:by |on |this |next )?\w+day\s*$/i.test(t)) {
    const want = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(weekday[1].toLowerCase());
    const now = new Date(today).getUTCDay();
    f.deadline = addDays(today, ((want - now + 7) % 7) || 7);
  }
  const sal = payIn(t);
  if (sal) {
    const c = sal[1].toUpperCase();
    f.currency = c === '$' || c === 'US$' ? 'USD' : sal[1] === '€' ? 'EUR' : sal[1] === '£' ? 'GBP' : c;
    f.salaryMin = sal[2];
    f.salaryMax = sal[3] ?? '';
    f.salaryMode = sal[3] ? 'range' : 'exact';
    if (sal[4]) f.period = (sal[4].toLowerCase() === 'annum' ? 'year' : sal[4].toLowerCase()) as Period;
  } else if (/as per (?:our )?(?:salary )?scale/i.test(t)) f.salaryMode = 'scale';
  for (const lang of LANGUAGES) if (new RegExp(`\\b${lang}\\b`, 'i').test(t) && !f.languages.includes(lang)) f.languages.push(lang);
  return { facts: f, role, engagement };
}

export function roleByKey(key: string): RoleFamily {
  return ROLE_BY_KEY[key] ?? ROLE_BY_KEY.programme;
}

export function salaryText(f: Facts): string {
  const per = { hour: 'an hour', day: 'a day', month: 'a month', year: 'a year' }[f.period];
  switch (f.salaryMode) {
    case 'range':
      return f.salaryMin && f.salaryMax ? `${f.currency} ${f.salaryMin} to ${f.salaryMax} ${per}` : '';
    case 'exact':
      return f.salaryMin ? `${f.currency} ${f.salaryMin} ${per}` : '';
    case 'daily':
      return f.salaryMin ? `${f.currency} ${f.salaryMin} a day` : 'Daily rate: please state yours';
    case 'scale':
      return 'As per our salary scale';
    case 'grade':
      return f.grade ? `Grade ${f.grade}` : 'By grade';
    case 'competitive':
      return 'Competitive';
    default:
      return '';
  }
}

/** Sections a job needs: the format's own, then what the engagement, recruitment, and place call for. */
export function recommendSections(format: Format, f: Facts): string[] {
  const keys = format.order.map((o) => o.key);
  const add = (k: string) => {
    if (!keys.includes(k)) keys.push(k);
  };
  if (f.engagement === 'consultancy') {
    add('deliverables');
    add('apply');
  }
  if (f.engagement === 'internship') add('learning');
  if (f.recruitment === 'roster') add('deployment');
  if (f.recruitment === 'proposal' || f.subjectToFunding) add('funding');
  if (placeOf(f.location)?.risky) add('conditions');
  if (f.languages.length > 1) add('languages');
  if (!keys.includes('apply')) add('apply');
  return keys;
}

/** Sections candidates value most that a format often leaves out: pay and benefits, what happens after applying, the first weeks, the team. */
const ADD_RANK = ['offer', 'assessment', 'firstweeks', 'team', 'relationships', 'practical', 'competencies', 'languages', 'background', 'setting'];

/** Up to five high-value sections to offer as one-click additions, beyond what the format and the facts already include. */
export function addSuggestions(format: Format, f: Facts): string[] {
  const have = recommendSections(format, f);
  return ADD_RANK.filter((k) => !have.includes(k)).slice(0, 5);
}

/**
 * The order the JD outline shows: group by group (the employer, the job, the person, the offer, applying), keeping the order inside each
 * group. The job description always follows this order, so what the outline shows is what the job description reads.
 */
export function outlineOrder(keys: string[]): string[] {
  const rank = (k: string) => {
    const g = GROUPS.findIndex((x) => x.key === SECTION_BY_KEY[k]?.group);
    return g < 0 ? GROUPS.length : g;
  };
  return keys
    .map((k, i) => ({ k, i }))
    .sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i)
    .map((x) => x.k);
}

/**
 * Sections put in the order of `keys`, which is the job's outline: the group order, or the user's own once they moved a section across
 * groups (section 19, phase 5, B). Any section without a key in the list keeps its place at the end.
 */
export function inOutlineOrder<T extends { key: string }>(sections: T[], keys: string[]): T[] {
  const listed = keys.map((k) => sections.find((x) => x.key === k)).filter(Boolean) as T[];
  return [...listed, ...sections.filter((x) => !keys.includes(x.key))];
}

/**
 * A section added without a place: after the last section of its group, or of an earlier group, in the order as it stands; first when
 * none comes before it. In a job that follows the group order this is the group order.
 */
export function placeIn(order: string[], key: string): string[] {
  if (order.includes(key)) return order;
  const rank = (k: string) => GROUPS.findIndex((g) => g.key === SECTION_BY_KEY[k]?.group);
  const mine = rank(key);
  let at = -1;
  order.forEach((k, i) => {
    if (rank(k) <= mine) at = i;
  });
  return [...order.slice(0, at + 1), key, ...order.slice(at + 1)];
}

/** A section's lines with its sub-sections after them, each sub-heading as a short label: for the checks, the AI, and copies. */
export function allLines(sec: Section): string[] {
  return [...sec.lines, ...(sec.subs ?? []).flatMap((sb) => [`${sb.title}:`, ...sb.lines])];
}

/**
 * Two or three other titles for a section (section 19, phase 5, B): the headings other templates give it, and its plain name; never the
 * one in use. A suggestion applies only when chosen.
 */
export function titleSuggestions(formats: Format[], key: string, current: string): string[] {
  const seen = new Set([current.trim().toLowerCase()]);
  const out: string[] = [];
  for (const h of [...formats.flatMap((f) => f.order.filter((o) => o.key === key).map((o) => o.heading)), SECTION_BY_KEY[key]?.label ?? '']) {
    const t = h.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.slice(0, 3);
}

export function orderSections(keys: string[], format: Format): string[] {
  const own = format.order.map((o) => o.key);
  return outlineOrder([...own.filter((k) => keys.includes(k)), ...DOC_ORDER.filter((k) => keys.includes(k) && !own.includes(k))]);
}

export function headingFor(key: string, format: Format): string {
  return format.order.find((o) => o.key === key)?.heading ?? SECTION_BY_KEY[key]?.label ?? key;
}

const NEXT_HINTS: Array<{ need: (f: Facts, hasRole: boolean) => boolean; text: (today: number) => string }> = [
  { need: (_f, hasRole) => !hasRole, text: () => "We're hiring a WASH Programme Manager" },
  { need: (f) => !f.location && f.arrangement !== 'remote', text: () => ' in Nairobi, Kenya' },
  { need: (f) => !f.duration && !f.contract, text: () => ', 12-month fixed-term contract' },
  { need: (f) => !f.deadline, text: (today) => `, closing ${longDate(addDays(today, 27))}` },
];

/** Ghost text: the next missing fact, as a completion of what the person has typed. */
export function suggestNext(text: string, today: number): string {
  const trimmed = text.replace(/\s+$/, '');
  const { facts, role } = extractFacts(trimmed, today);
  const hint = NEXT_HINTS.find((h) => h.need(facts, Boolean(role) || Boolean(facts.title)));
  if (!hint) return '';
  let s = hint.text(today);
  if (!trimmed) return s;
  if (/[.,;:]$/.test(trimmed)) s = s.replace(/^[.,;:]\s?/, ' ');
  if (/\s$/.test(text)) s = s.replace(/^\s+/, '');
  return s;
}

export type BuildContext = { facts: Facts; roleKey: string; org: Org; tone: Tone; format: Format; commitments: string[]; applyLines: string[] };

function yearsFor(grade: string, engagement: Engagement): string {
  if (engagement === 'internship') return 'Currently enrolled in, or recently completed, a relevant degree, or equivalent experience';
  const years: Record<string, number> = { P1: 1, P2: 2, P3: 5, P4: 7, P5: 10, D1: 15, D2: 15, NOA: 1, NOB: 2, NOC: 5, NOD: 7 };
  const n = years[grade];
  return n ? `At least ${n} years of relevant, progressively responsible experience` : 'Relevant experience in a similar role, or equivalent experience';
}

function lead(tone: Tone, formal: string, warm: string, plain: string): string {
  return tone === 'formal' ? formal : tone === 'warm' ? warm : plain;
}

export function starterCommitment(key: string, org: Org, f: Facts): string {
  const name = org.name;
  switch (key) {
    case 'safeguarding':
      return `${name} is committed to keeping children and adults at risk safe. Every member of staff follows our safeguarding policy and code of conduct${f.safeguarding === 'high' ? '; this role has frequent contact with children, so enhanced checks apply' : ''}.`;
    case 'psea':
      return `${name} has zero tolerance for sexual exploitation, abuse and harassment, in line with the IASC Six Core Principles. Every member of staff must report any concern.`;
    case 'mds':
      return `${name} takes part in the Inter-Agency Misconduct Disclosure Scheme: we will ask previous employers about any findings of sexual exploitation, abuse, or harassment. By applying, you confirm you understand this.`;
    case 'checks':
      return 'Any offer depends on satisfactory references and the background checks that apply in the country of work.';
    case 'ct':
      return 'Any offer depends on counter-terrorism and sanctions screening, as some of our donors require.';
    case 'fraud':
      return `${name} never charges a fee at any stage of recruitment and never asks for bank details. Genuine messages come only from @${org.domain}.`;
    case 'equal':
      return `${name} is an equal opportunity employer. We welcome applications from everyone, and particularly from people from the communities we work with.`;
    case 'encourage':
      return "You don't need to meet every requirement to apply. If you meet most of the essentials and the work excites you, we'd like to hear from you.";
    case 'adjustments':
      return 'If you need any adjustment at any stage of the process, tell us and we will make it.';
    case 'dataprot':
      return 'We use your application only to assess it for this role and delete it when it is no longer needed.';
    case 'esr':
      return `${name} manages the environmental and social impact of its work: it reduces its footprint, respects the rights of the communities it works with, and expects staff and partners to do the same.`;
    case 'righttowork':
      return `Applicants must have the right to work in ${f.country || 'the country of the post'}.`;
    case 'unconsiderations':
      return 'Applications are considered without restriction on the eligibility of women and men to take part in any capacity and under conditions of equality.';
    default:
      return '';
  }
}

export function commitmentText(key: string, org: Org, f: Facts): { text: string; locked: boolean; own: boolean } {
  const own = org.standard.find((c: Commitment) => c.key === key);
  return own ? { text: own.text, locked: own.locked, own: true } : { text: starterCommitment(key, org, f), locked: false, own: false };
}

export function buildSection(key: string, ctx: BuildContext): Section {
  const { facts: f, org, tone, format } = ctx;
  const role = roleByKey(ctx.roleKey);
  const title = f.title || role.title;
  const where = f.arrangement === 'remote' ? 'remotely' : f.location ? `in ${f.location}` : 'in [Duty station]';
  const heading = headingFor(key, format);
  const terms = [f.contract, f.duration, f.grade && `grade ${f.grade}`, f.hours === 'part' ? 'part-time' : ''].filter(Boolean).join(', ');
  const place = placeOf(f.location);
  switch (key) {
    case 'about':
      return { key, title: heading, lines: [org.about] };
    case 'team':
      return { key, title: heading, lines: [`The ${role.sector.toLowerCase()} team ${lead(tone, 'delivers', 'works with communities to deliver', 'delivers')} ${org.short}'s ${role.sector.toLowerCase()} programmes${f.country ? ` in ${f.country}` : ''}, directly and with local partners.`] };
    case 'background':
      return { key, title: heading, lines: [`${org.short}'s ${role.sector.toLowerCase()} programme${f.country ? ` in ${f.country}` : ''} ${f.donor ? `is funded by ${f.donor} and ` : ''}works with communities and local authorities to improve services and resilience.`] };
    case 'setting':
      return { key, title: heading, lines: [`This position is located in the ${org.short} ${f.location ? `${f.location.split(',')[0]} office` : 'country office'} and reports to the Head of Programmes.`] };
    case 'purpose':
      return {
        key,
        title: heading,
        lines: [
          lead(
            tone,
            `The ${title} leads ${role.sector.toLowerCase()} work ${where} and contributes to ${org.short}'s country strategy.`,
            `We're looking for ${article(title)} ${title} to join our team ${where}. You'll lead our ${role.sector.toLowerCase()} work and make a real difference for the communities we serve.`,
            `This ${title} role is based ${where} and leads ${role.sector.toLowerCase()} work.`,
          ),
          ...(terms ? [`Contract: ${terms}.`] : []),
        ],
      };
    case 'responsibilities':
      return { key, title: heading, lines: role.resp.map((r) => `- ${r}`) };
    case 'deliverables':
      return { key, title: heading, lines: [...role.deliverables.map((d) => `- ${d}`), `Duration: ${f.duration || '40 working days over 3 months'}.`] };
    case 'relationships':
      return { key, title: heading, lines: [`Reports to: Head of Programmes.`, `Direct reports: ${f.directReports || 'none'}.`, 'Works closely with the operations, MEAL, and partnerships teams, and with local partners.'] };
    case 'learning':
      return { key, title: heading, lines: role.learning.map((l) => `- ${l}`) };
    case 'deployment':
      return { key, title: heading, lines: [`Availability: ${f.availability || 'at least 6 months'}, with deployment at short notice.`, 'Being on the roster is unpaid; you are paid when you are deployed.'] };
    case 'firstweeks':
      return { key, title: heading, lines: ['- Meet the team and partners, and visit project sites', '- Agree your work plan and priorities with your manager', '- Complete induction, including safeguarding and security briefings'] };
    case 'requirements':
      return {
        key,
        title: heading,
        lines: ['Essential:', ...role.essential.map((q) => `- ${q}`), `- ${yearsFor(f.grade, f.engagement)}`, 'Desirable:', ...role.desirable.map((q) => `- ${q}`)],
      };
    case 'competencies':
      return { key, title: heading, lines: role.comp.map((c) => `- ${c}`) };
    case 'languages': {
      const [first, ...rest] = f.languages.length ? f.languages : ['English'];
      return { key, title: heading, lines: [`Fluency in ${first} is required.${rest.length ? ` Knowledge of ${rest.join(' or ')} is desirable.` : ''}`] };
    }
    case 'practical':
      return { key, title: heading, lines: [`- Willingness to travel to project sites${place ? ` in ${place.country}` : ''}`, ...(f.eligibility === 'nationals' ? [`- Open to nationals of ${f.country || 'the country of the post'} only`] : [])] };
    case 'offer': {
      const pay = salaryText(f);
      return {
        key,
        title: heading,
        lines: [
          ...(pay ? [`Salary: ${pay}.`] : []),
          '- Annual leave, medical insurance, and a learning budget',
          ...(place?.risky ? ['- Rest and recuperation in line with the duty station'] : []),
          ...(f.engagement === 'internship' ? ['- A monthly stipend and a mentor for the whole internship'] : []),
          ...(f.subjectToFunding ? ['This post is subject to continued funding.'] : []),
        ],
      };
    }
    case 'conditions':
      return { key, title: heading, lines: [place?.risky ? `${place.city} is a non-family duty station with security restrictions; rest and recuperation applies.` : 'Standard working conditions for the duty station.'] };
    case 'funding':
      return {
        key,
        title: heading,
        lines: [
          f.recruitment === 'proposal'
            ? `This position is contingent upon contract award${f.client ? ` by ${f.client}` : ''} and client approval${f.keyPersonnel ? ' of key personnel' : ''}.`
            : 'This post is subject to continued funding.',
        ],
      };
    case 'apply':
      return { key, title: heading, lines: ctx.applyLines };
    case 'assessment':
      return { key, title: heading, lines: ['Shortlisted candidates may take a written assessment, followed by a competency-based interview.'] };
    default:
      return { key, title: heading, lines: [`${heading}: to be written.`] };
  }
}

export function buildSections(keys: string[], ctx: BuildContext): Section[] {
  return keys.map((k) => buildSection(k, ctx));
}

export type QualityItem = { key: string; level: 'ok' | 'info' | 'warn' | 'issue'; text: string; section?: string };

/** Checks shown on the document. They never block publishing; only a missing title, place, or closing date is an issue. */
export function quality(sections: Section[], f: Facts, today: number, otherLiveTitles: string[]): QualityItem[] {
  const items: QualityItem[] = [];
  if (!f.title) items.push({ key: 'title', level: 'issue', text: 'Add a job title' });
  if (!f.location && f.arrangement !== 'remote') items.push({ key: 'location', level: 'issue', text: 'Add a duty station, or mark the job remote' });
  if (!f.deadline) items.push({ key: 'deadline', level: 'issue', text: 'Add a closing date' });
  else {
    const left = daysUntil(today, f.deadline);
    if (left < 0) items.push({ key: 'deadline-past', level: 'issue', text: 'The closing date has passed' });
    if (weekend(f.deadline, f.iso)) items.push({ key: 'deadline-weekend', level: 'info', text: `${longDate(f.deadline)} is a weekend` });
    if (holiday(f.deadline, f.iso)) items.push({ key: 'deadline-holiday', level: 'info', text: `${longDate(f.deadline)} is a public holiday${f.country ? ` in ${f.country}` : ''}` });
  }
  for (const s of sections) {
    const text = s.lines.join('\n');
    if (/\[(?:Duty station|Closing date)\]/.test(text)) items.push({ key: `missing-${s.key}`, level: 'issue', text: `${s.title}: a fact is still missing; click the highlighted space to add it`, section: s.key });
    if (/\{[^}]{0,40}\}/.test(text)) items.push({ key: `placeholder-${s.key}`, level: 'warn', text: `${s.title}: a template placeholder is left in the text`, section: s.key });
    const fill = text.match(/\[(?!Duty station\]|Closing date\])[^\]\n]{2,40}\]/);
    if (fill) items.push({ key: `fill-${s.key}`, level: 'warn', text: `${s.title}: “${fill[0]}” is still to fill in`, section: s.key });
    const bullets = s.lines.filter((l) => l.startsWith('- '));
    if (new Set(bullets).size < bullets.length) items.push({ key: `dupe-${s.key}`, level: 'warn', text: `${s.title}: a bullet appears twice`, section: s.key });
    if (s.key === 'responsibilities' && bullets.length < 2) items.push({ key: 'duties-empty', level: 'warn', text: 'Responsibilities: list at least a few duties', section: s.key });
    const otherDate = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d\d)\b/i);
    if (otherDate && f.deadline && longDate(f.deadline).toLowerCase() !== `${Number(otherDate[1])} ${otherDate[2].toLowerCase()} ${otherDate[3]}` && /clos|deadline|apply/i.test(text)) {
      items.push({ key: `date-${s.key}`, level: 'warn', text: `${s.title}: mentions ${otherDate[0]}, but the closing date is ${longDate(f.deadline)}`, section: s.key });
    }
  }
  if (f.title && otherLiveTitles.some((t) => t.toLowerCase() === f.title.toLowerCase())) items.push({ key: 'duplicate', level: 'info', text: 'A job with this title is already live' });
  const ready = Boolean(f.title && f.deadline && (f.location || f.arrangement === 'remote') && sections.length >= 3);
  items.push({ key: 'google', level: ready ? 'ok' : 'info', text: ready ? "Ready for Google's job listings" : "For Google's job listings: title, place, closing date, and 3 sections" });
  return items;
}

/** Inclusive-language rules. Highlight only, with a reason and a possible alternative; the user decides (3 November 2026). */
export type InclusiveRule = { id: string; re: RegExp; why: string; alt: string; source: string; skipFormats?: string[] };

export const INCLUSIVE: InclusiveRule[] = [
  { id: 'masculine', re: /\b(aggressive|dominant|competitive|fearless|headstrong|ninja|rock ?star)\b/gi, why: 'Strongly masculine-coded word. In experiments, wording like this lowered women\u2019s sense of belonging and the job\u2019s appeal, without changing how they rated their own skills.', alt: 'For example: "motivated", "confident", "committed"', source: 'Gaucher, Friesen and Kay, 2011' },
  { id: 'pronoun', re: /\b(he|him|his|she|her)\b/gi, why: 'A gendered pronoun suggests who is expected in the role.', alt: '"they", "the post holder", or "you"', source: 'Common inclusive-writing guidance' },
  { id: 'title', re: /\b(chairman|salesman|foreman|manpower|waitress)\b/gi, why: 'A gendered job word.', alt: '"chair", "sales assistant", "supervisor", "staff", "server"', source: 'UK job-advert guidance (reed.co.uk)' },
  { id: 'age', re: /\b(young(?!\s+(?:child|children|people|women|mothers|girls|boys)\b)|youthful|energetic|mature|recent graduates?|digital native)\b/gi, why: 'Age-coded wording can put off people of other ages; UK and US guidance warn against it.', alt: 'Describe the level ("entry-level") or the skill needed', source: 'UK statutory code (via University of Exeter guidance); US EEOC' },
  { id: 'years', re: /\b(at least|minimum of|a minimum of)\s+\d+\+?\s+years\b|\b\d+\+\s+years\b/gi, why: 'A fixed minimum of years can exclude capable people; UK guidance says it needs a reason.', alt: 'Add "or equivalent experience", or describe the skills', source: 'UK statutory code (via University of Exeter guidance)', skipFormats: ['un-secretariat', 'un-agency'] },
  { id: 'native', re: /\b(native speaker|native english|mother tongue)\b/gi, why: '"Native" points to origin, not ability.', alt: '"fluent in…" or "native-level proficiency"', source: 'University of Exeter and reed.co.uk guidance' },
  { id: 'physical', re: /\b(physically fit|able-bodied|good eyesight|must be able to stand|valid driving licen[cs]e)\b/gi, why: 'A physical requirement can exclude disabled people; worth keeping only if the job truly needs it.', alt: 'Describe the task, for example "regular travel to project sites", and offer adjustments', source: 'Disability guidance in UK and US employment law' },
  { id: 'acronym', re: /\b(IPA|HAC|CLA|SADD|PDM|HRP|NFI|CCCM|AAP)\b/g, why: 'An acronym that people outside the agency, or reading English as a second language, may not know.', alt: 'Spell it out the first time', source: 'Plain-language practice' },
];

export type InclusiveHit = { rule: InclusiveRule; match: string; index: number };

export function findInclusive(text: string, formatKey: string): InclusiveHit[] {
  const hits: InclusiveHit[] = [];
  for (const rule of INCLUSIVE) {
    if (rule.skipFormats?.includes(formatKey)) continue;
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) hits.push({ rule, match: m[0], index: m.index });
  }
  return hits.sort((a, b) => a.index - b.index).filter((h, i, all) => i === 0 || h.index >= all[i - 1].index + all[i - 1].match.length);
}

/** Salary suggestion with its basis (plan, section 14). Returns null when there is no basis rather than a guess. */
export type SalaryHint = { min: number; max: number; currency: string; period: Period; basis: string; sample: boolean };

export function salarySuggestion(f: Facts, org: Org): SalaryHint | null {
  const own = org.scale.find((r) => r.grade === f.grade);
  if (own) return { min: own.min, max: own.max, currency: own.currency, period: own.period, basis: `Your ${org.short} salary scale, grade ${own.grade}`, sample: true };
  if (/^P[1-5]$|^D[12]$/.test(f.grade) && f.location) return { min: 6500, max: 8200, currency: 'USD', period: 'month', basis: `Indicative UN net pay for ${f.grade} at ${f.location.split(',')[0]} from the ICSC salary scale and post adjustment (sample figures in the demo)`, sample: true };
  const place = placeOf(f.location);
  if (place?.iso === 'GB') return { min: 2350, max: 2900, currency: 'GBP', period: 'month', basis: 'Middle range of 14 similar UK charity jobs on AidJobs that show pay (sample figures in the demo); the Real Living Wage is £14.10 an hour, £15.45 in London', sample: true };
  if (place?.iso === 'KE') return { min: 180000, max: 260000, currency: 'KES', period: 'month', basis: 'Middle range of 9 similar jobs in Kenya on AidJobs that show pay (sample figures in the demo)', sample: true };
  return null;
}

export const SALARY_FACTS = [
  { text: 'Jobs that show an employer-provided salary get 3.8 times more applications.', source: 'Indeed Hiring Lab, US job postings' },
  { text: '70% of organisations that list pay ranges say it brought more applicants, and 66% say better-qualified ones.', source: 'SHRM, 2023' },
  { text: '73% of workers trust organisations more when they show pay ranges.', source: 'SHRM, 2023' },
];

export type ChatResult = { sections: Section[]; tags: string[]; tone: Tone; facts: Facts; reply: string; quick?: string[] };

function sectionFrom(text: string, keys: string[], format: Format): string | null {
  const t = text.toLowerCase();
  const hit = keys.find((k) => t.includes(headingFor(k, format).toLowerCase()) || t.includes((SECTION_BY_KEY[k]?.label ?? k).toLowerCase()) || t.includes(k));
  return hit ?? null;
}

/** Words of thanks and agreement; a short message made only of these changes nothing. */
const ACKNOWLEDGE = new Set(['ok', 'okay', 'k', 'thanks', 'thank', 'thx', 'you', 'great', 'good', 'nice', 'perfect', 'cool', 'yes', 'yeah', 'yep', 'no', 'sure', 'fine', 'got', 'it', "it's", 'its', 'looks', 'look', 'a', 'lot', 'much', 'so', 'very', 'really', 'alright', 'awesome', 'brilliant', 'done', 'lovely', 'excellent', 'wonderful', 'amazing', 'super', 'that', 'thats', "that's", 'all', 'for', 'now', 'please', 'sounds', 'sound', 'to', 'me', 'job', 'work', 'love', 'like', 'one', 'right', 'makes', 'sense', 'agreed', 'agree', 'i']);

const TONE_WORDS: Array<[RegExp, Tone]> = [
  [/^(formal|un)$/, 'formal'],
  [/^(warm|warmer|friendly|friendlier|casual|human)$/, 'warm'],
  [/^(plain|plainer|simple|simpler|direct)$/, 'plain'],
];

/**
 * The tone a message asks for, read from the whole message ("more formal please", "can you make it sound friendlier", "too formal",
 * "use a warmer tone"), or null. A tone word inside a sentence ("two direct reports", "sound knowledge of IPSAS") is not a request.
 */
export function toneRequest(text: string): Tone | null {
  let s = text.toLowerCase().trim().replace(/[.!?]+$/, '');
  s = s.replace(/[\s,]+please$/, '').replace(/^please\s+/, '').replace(/^(can|could|would|will) you\s+/, '').replace(/^please\s+/, '');
  s = s.replace(/^(make|write|rewrite)\s+(it|this|the text|the job description)\s+/, '').replace(/^sound\s+/, '').replace(/^(use|in|with)\s+an?\s+/, '').replace(/^(it's|it is|this is|that's|that is|it sounds|this sounds)\s+/, '');
  s = s.replace(/\s+tone$/, '').replace(/[\s,]+please$/, '');
  const m = s.match(/^(more|a bit more|slightly more|a little more|less|a bit less|not so|too|a bit too|way too|far too)?\s*([a-z]+)$/);
  const tone = m ? TONE_WORDS.find(([re]) => re.test(m[2]))?.[1] : undefined;
  if (!m || !tone) return null;
  if (!m[1] || !/less|not so|too/.test(m[1])) return tone;
  return tone === 'formal' ? 'warm' : 'formal';
}

/** Whether a message asks to make the text shorter or longer, rather than containing those words in a sentence. */
export function lengthRequest(t: string): 'shorter' | 'longer' | null {
  const s = t.trim().replace(/[.!?]+$/, '').replace(/[\s,]+please$/, '').replace(/^please\s+/, '').replace(/^(can|could|would) you\s+/, '');
  if (/^(shorter|more concise|too long|(make|keep) [\p{L}' ]{1,40} (shorter|more concise|brief)|(shorten|cut|trim|tighten)( down)? (it|this|that|the\b.*)|(shorten|cut|trim|tighten)( it)? down)$/u.test(s) || /^shorten\b/.test(s)) return 'shorter';
  if (/^(longer|more detail|too short|add more( detail)?.*|more detail (on|in|for) .+|(make|write) [\p{L}' ]{1,40} longer|expand (it|this|that|the\b.*))$/u.test(s)) return 'longer';
  return null;
}

/** What the rules can add to a section asked to be longer, from the role's own lines; none where only the employer knows (pay, benefits). */
function moreFor(key: string, role: RoleFamily): string[] {
  if (key === 'responsibilities') return role.more;
  if (key === 'requirements') return role.desirable;
  if (key === 'competencies') return role.comp;
  if (key === 'deliverables') return role.deliverables;
  if (key === 'learning') return role.learning;
  return [];
}

/** Edits asked for in the chat after the first draft. */
/** `focus`: the section in view in the window; a request that names no section is about it. */
export function applyEdit(text: string, keys: string[], sections: Section[], ctx: BuildContext, today: number, focus?: string): ChatResult {
  const t = text.toLowerCase();
  const target = sectionFrom(text, keys, ctx.format) ?? (focus && keys.includes(focus) ? focus : null);
  const role = roleByKey(ctx.roleKey);
  const rebuild = (ks: string[], c: BuildContext) => sections.map((s) => (ks.includes(s.key) && !s.edited && !s.ai ? { ...buildSection(s.key, c), title: s.title, ...(s.subs ? { subs: s.subs } : {}) } : s));
  let tone = ctx.tone;
  let facts = ctx.facts;
  const length = lengthRequest(t);
  if (length === 'shorter') {
    const ks = target ? [target] : sections.map((s) => s.key);
    const next = sections.map((s) => {
      if (!ks.includes(s.key)) return s;
      const bullets = s.lines.filter((l) => l.startsWith('- '));
      const other = s.lines.filter((l) => !l.startsWith('- '));
      return bullets.length > 3 ? { ...s, lines: [...other.slice(0, 1), ...bullets.slice(0, 3)], edited: true } : s;
    });
    return { sections: next, tags: keys, tone, facts, reply: target ? `Shortened ${headingFor(target, ctx.format)}.` : 'Shortened the longer sections to their essentials.', quick: ['Undo that', 'More formal'] };
  }
  if (length === 'longer') {
    const k = target ?? 'responsibilities';
    const sec = sections.find((s) => s.key === k);
    const add = sec ? moreFor(k, role).filter((m) => !sec.lines.includes(`- ${m}`)) : [];
    const heading = sec?.title ?? headingFor(k, ctx.format);
    if (!add.length) return { sections, tags: keys, tone, facts, reply: `I can't add more to ${heading} without your details. Tell me what to add (for example the benefits, leave, or allowances), and I'll put it in.` };
    const next = sections.map((s) => (s.key === k ? { ...s, lines: [...s.lines, ...add.map((m) => `- ${m}`)], edited: true } : s));
    return { sections: next, tags: keys, tone, facts, reply: `Added more detail to ${heading}.` };
  }
  const asked = toneRequest(text);
  if (asked && asked !== ctx.tone) {
    tone = asked;
    return { sections: rebuild(sections.map((s) => s.key), { ...ctx, tone }), tags: keys, tone, facts, reply: `Rewritten in a ${tone} tone. Sections you edited by hand are unchanged.` };
  }
  if (asked) return { sections, tags: keys, tone, facts, reply: `It is already written in a ${tone} tone.` };
  const lang = LANGUAGES.find((l) => t.includes(l.toLowerCase()));
  if (lang && !facts.languages.includes(lang)) {
    facts = { ...facts, languages: facts.languages.length ? [...facts.languages, lang] : ['English', lang] };
    const nextKeys = placeIn(keys, 'languages');
    const c = { ...ctx, facts };
    const had = sections.find((s) => s.key === 'languages');
    const merged = nextKeys.map((k) => (k === 'languages' ? { ...buildSection(k, c), ...(had?.subs ? { subs: had.subs } : {}) } : (sections.find((s) => s.key === k) ?? buildSection(k, c))));
    return { sections: merged, tags: nextKeys, tone, facts, reply: `Added ${lang} as desirable.` };
  }
  const add = t.trim().match(/^(?:please\s+)?(?:can you\s+|could you\s+)?add\s+(?:a\s+|an\s+|the\s+)?(.+?)(?:\s+section)?(?:\s+please)?[.!?]?$/);
  if (add) {
    const named = add[1].trim();
    const def = SECTIONS.find((x) => [x.label, x.key, headingFor(x.key, ctx.format)].some((n) => n.toLowerCase() === named));
    if (def && !keys.includes(def.key)) {
      const nextKeys = placeIn(keys, def.key);
      return { sections: inOutlineOrder([...sections, buildSection(def.key, ctx)], nextKeys), tags: nextKeys, tone, facts, reply: `Added ${headingFor(def.key, ctx.format)}.` };
    }
  }
  const remove = t.match(/\b(?:remove|drop|delete)\s+(?:the\s+)?(.+)/);
  if (remove) {
    const k = keys.find((x) => remove[1].includes(headingFor(x, ctx.format).toLowerCase()) || remove[1].includes((SECTION_BY_KEY[x]?.label ?? x).toLowerCase()));
    // How to apply is part of every job (section 19, phase 6, D): its text and method change instead.
    if (k === 'apply') return { sections, tags: keys, tone, facts, reply: `${headingFor(k, ctx.format)} stays on every job: change its text or how people apply with its pencil.` };
    if (k) return { sections: sections.filter((s) => s.key !== k), tags: keys.filter((x) => x !== k), tone, facts, reply: `Removed ${headingFor(k, ctx.format)}.` };
  }
  const { facts: f2 } = extractFacts(text, today, facts);
  const changed = (Object.keys(f2) as Array<keyof Facts>).filter((k) => JSON.stringify(f2[k]) !== JSON.stringify(facts[k]));
  if (changed.length) {
    facts = f2;
    return { sections: rebuild(['purpose', 'apply', 'offer', 'languages', 'setting', 'conditions', 'deployment', 'deliverables', 'funding'], { ...ctx, facts }), tags: keys, tone, facts, reply: 'Updated the facts and the sections that mention them.' };
  }
  // Only text that reads as content is added; thanks, acknowledgements, and instructions it could not act on change nothing.
  const said = text.trim();
  const words = said.toLowerCase().split(/[\s,.!]+/).filter(Boolean);
  if (words.length && words.length <= 5 && words.every((w) => ACKNOWLEDGE.has(w))) return { sections, tags: keys, tone, facts, reply: 'Ask for any change, or edit the job description directly.' };
  const asks =
    /\?$/.test(said) ||
    /^please\b/i.test(said) ||
    /^(can|could|would|will)\s+you\b/i.test(said) ||
    /^(undo|revert|redo|try again|go back)\b/i.test(said) ||
    /^(make|change|rewrite|edit|include|mention|add|improve|fix|update|use|move|turn|replace|set)\s+(it|this|that|more|less|something|some|the\s+(job|text|description|section|title|tone|wording)|a\s+(line|sentence|note|point|bit))\b/i.test(said);
  if (asks) {
    return { sections, tags: keys, tone, facts, reply: 'I could not tell what to change. Try "shorter", "more formal", "add First weeks", "remove Background", or write the sentence to add.', quick: ['Shorter', 'More formal'] };
  }
  const k = target ?? (keys.includes('purpose') ? 'purpose' : keys[0]);
  const sentence = text.trim().replace(/^./, (c) => c.toUpperCase()).replace(/([^.!?])$/, '$1.');
  return { sections: sections.map((s) => (s.key === k ? { ...s, lines: [...s.lines, sentence], edited: true } : s)), tags: keys, tone, facts, reply: `Added that to ${headingFor(k, ctx.format)}.` };
}

/** Reads pasted text into sections: headings are short lines, upper-case lines, or lines ending in a colon. */
export function readPasted(text: string): Array<{ heading: string; key: string; lines: string[] }> {
  const rows = text.split(/\r?\n/).map((l) => l.trim());
  const out: Array<{ heading: string; key: string; lines: string[] }> = [];
  const keyFor = (h: string): string => {
    const l = h.toLowerCase();
    if (/about (us|the organi[sz]ation)|who we are|the organi[sz]ation|company description/.test(l)) return 'about';
    if (/team purpose|about the team/.test(l)) return 'team';
    if (/background|project brief|about the programme|context/.test(l)) return 'background';
    if (/setting|reporting/.test(l)) return 'setting';
    if (/purpose|summary|overview|the role|about the role|the opportunity/.test(l)) return 'purpose';
    if (/responsibilit|accountabilit|duties|tasks|what you.?ll do/.test(l)) return 'responsibilities';
    if (/deliverable/.test(l)) return 'deliverables';
    if (/relationship|scope of role|institutional/.test(l)) return 'relationships';
    if (/qualification|requirement|experience|about you|profile|looking for|person specification|skills/.test(l)) return 'requirements';
    if (/competenc|behaviour|values/.test(l)) return 'competencies';
    if (/language/.test(l)) return 'languages';
    if (/offer|benefit|salary|remuneration|why join/.test(l)) return 'offer';
    if (/condition|working environment/.test(l)) return 'conditions';
    if (/apply|application/.test(l)) return 'apply';
    if (/assessment|selection/.test(l)) return 'assessment';
    return 'purpose';
  };
  let current: { heading: string; key: string; lines: string[] } | null = null;
  for (const r of rows) {
    if (!r) continue;
    const isHeading = (r.length < 60 && (/:$/.test(r) || (/^[A-Z0-9 &/'()-]+$/.test(r) && /[A-Z]{3}/.test(r)))) || (r.length < 40 && !/[.!?]$/.test(r) && rows.length > 3 && /^[A-Z]/.test(r) && r.split(' ').length <= 5);
    if (isHeading) {
      const heading = r.replace(/:$/, '').replace(/\b\w/g, (c) => c).trim();
      current = { heading: heading.charAt(0) + heading.slice(1).toLowerCase(), key: keyFor(heading), lines: [] };
      out.push(current);
    } else {
      if (!current) {
        current = { heading: 'The role', key: 'purpose', lines: [] };
        out.push(current);
      }
      current.lines.push(/^[•*\-–]\s*/.test(r) ? `- ${r.replace(/^[•*\-–]\s*/, '')}` : r);
    }
  }
  return out.filter((s) => s.lines.length);
}

export function slug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function arrangementLabel(a: Arrangement): string {
  return a === 'onsite' ? 'On-site' : a === 'hybrid' ? 'Hybrid' : 'Remote';
}

/** Countries AidJobs recognises in free text, beyond the places it knows well. */
const COUNTRY_NAMES = Array.from(
  new Set([
    ...PLACES.map((p) => p.country),
    'India', 'Pakistan', 'Afghanistan', 'Bangladesh', 'Myanmar', 'Nepal', 'Sri Lanka', 'Syria', 'Lebanon', 'Jordan', 'Iraq', 'Yemen', 'Turkey', 'Ukraine', 'Sudan',
    'Chad', 'Niger', 'Mali', 'Burkina Faso', 'Cameroon', 'Central African Republic', 'Somalia', 'Ethiopia', 'Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Burundi',
    'Zambia', 'Zimbabwe', 'Mozambique', 'Malawi', 'Madagascar', 'South Africa', 'Nigeria', 'Ghana', 'Sierra Leone', 'Liberia', 'Senegal', 'Haiti', 'Colombia',
    'Venezuela', 'Peru', 'Ecuador', 'Guatemala', 'Honduras', 'Philippines', 'Indonesia', 'Palestine', 'Egypt', 'Libya', 'Tunisia', 'Morocco',
  ]),
);

/** A duty station AidJobs does not know, written as "based in …", "in Place, Country", or "in Country"; never guessed from other words. */
export function looseLocation(t: string): { location: string; country: string } | null {
  const stop = String.raw`(?=[.;!?,\n]|$|\s(?:and|with|for|from|on)\s)`;
  const based = t.match(new RegExp(String.raw`\bbased in (\p{L}[\p{L}' .-]{1,40}?)(?:,\s*(\p{L}[\p{L}' .-]{1,30}?))?` + stop, 'iu'));
  const pair = t.match(new RegExp(String.raw`\bin (\p{L}[\p{L}' .-]{1,30}?),\s*(\p{L}[\p{L}' .-]{1,30}?)` + stop, 'iu'));
  const m = based ?? pair;
  if (m) {
    const named = (x?: string) => (x ? COUNTRY_NAMES.find((c) => c.toLowerCase() === x.trim().toLowerCase()) : undefined);
    const country = named(m[2]) ?? named(m[1]);
    if (based || country) {
      const place = titleCase(m[1]);
      return m[2] ? { location: `${place}, ${country ?? titleCase(m[2])}`, country: country ?? titleCase(m[2]) } : { location: place, country: country ?? '' };
    }
  }
  const only = COUNTRY_NAMES.find((c) => new RegExp(String.raw`\bin ${c}\b`, 'i').test(t));
  return only ? { location: only, country: only } : null;
}

/** Words that job titles in the sector commonly use, for gentle spelling suggestions. */
const TITLE_WORDS = [
  'Specialist', 'Officer', 'Manager', 'Coordinator', 'Assistant', 'Associate', 'Adviser', 'Advisor', 'Director', 'Consultant', 'Analyst', 'Engineer', 'Intern',
  'Programme', 'Program', 'Project', 'Education', 'Protection', 'Nutrition', 'Health', 'Logistics', 'Finance', 'Communications', 'Monitoring', 'Evaluation',
  'Accountability', 'Learning', 'Livelihoods', 'Shelter', 'Security', 'Procurement', 'Partnerships', 'Advocacy', 'Humanitarian', 'Emergency', 'Response',
  'Safeguarding', 'Gender', 'Child', 'Senior', 'Junior', 'Country', 'Regional', 'Field', 'Technical', 'Resilience', 'Climate', 'Water', 'Sanitation', 'Hygiene',
  'Educator', 'Evaluator', 'Programmer', 'Trainer', 'Facilitator', 'Mobiliser', 'Supervisor', 'Researcher', 'Driver', 'Nurse', 'Doctor', 'Midwife', 'Teacher',
  'Accountant', 'Cashier', 'Translator', 'Interpreter', 'Planner', 'Designer', 'Developer', 'Writer', 'Editor', 'Lead', 'Head', 'Chief', 'Deputy',
];

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** A corrected job title when a word looks misspelt ("Speclist" → "Specialist"); null when it looks right. Never applied automatically. */
export function suggestTitle(title: string): string | null {
  let changed = false;
  const words = title.split(/(\s+)/).map((w) => {
    if (!/^[A-Za-z]{4,}$/.test(w) || TITLE_WORDS.some((x) => x.toLowerCase() === w.toLowerCase())) return w;
    const best = TITLE_WORDS.map((x) => ({ x, d: distance(w.toLowerCase(), x.toLowerCase()) })).sort((p, q) => p.d - q.d)[0];
    if (best && best.d > 0 && best.d <= (w.length > 6 ? 2 : 1)) {
      changed = true;
      return best.x;
    }
    return w;
  });
  return changed ? words.join('') : null;
}

const COMPLETION_TERMS = [
  'fixed-term contract', 'temporary appointment', 'consultancy', 'internship', 'full-time', 'part-time', 'home-based', 'subject to funding', 'roster',
  'closing', 'years of experience', 'national staff', 'international staff', 'P1', 'P2', 'P3', 'P4', 'P5', 'D1', 'D2', 'NOA', 'NOB', 'NOC', 'NOD',
];

/**
 * Predictive completion: the rest of the word or phrase being typed, from the organisation's own titles and places first, then AidJobs titles,
 * duty stations, grades, and contract terms. It completes what is typed and never adds a fact of its own.
 */
export function completeText(text: string, own: string[] = []): string {
  if (!text || /\s$/.test(text)) return '';
  const phrases = [...own, ...ROLE_FAMILIES.map((r) => r.title), ...PLACES.map((p) => `${p.city}, ${p.country}`), ...COMPLETION_TERMS];
  const words = text.split(/\s+/);
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    const tail = words.slice(-n).join(' ');
    if (tail.length < (n === 1 ? (/^[A-Z]/.test(tail) ? 2 : 3) : 4)) continue;
    const lower = tail.toLowerCase();
    const hit = phrases.find((ph) => ph.toLowerCase().startsWith(lower) && ph.length > tail.length);
    if (hit) return hit.slice(tail.length);
  }
  return '';
}

export type FactMark = { start: number; end: number; label: string };

/**
 * Facts recognised in what is being typed, with where they are, for a faint underline: the duty station, the closing date, the grade, the
 * contract, and the duration, each with how AidJobs read it and any useful note.
 */
export function recognise(text: string, today: number, ownGrades: string[] = []): FactMark[] {
  const marks: FactMark[] = [];
  const add = (re: RegExp, label: (m: RegExpExecArray) => string | null) => {
    const m = re.exec(text);
    if (!m) return;
    const l = label(m);
    if (l && !marks.some((x) => m.index < x.end && m.index + m[0].length > x.start)) marks.push({ start: m.index, end: m.index + m[0].length, label: l });
  };
  const place = PLACES.find((p) => new RegExp(String.raw`\b${p.city.replace(/[.*+?^${}()|[\]\\']/g, '.')}\b`, 'i').test(text));
  if (place) add(new RegExp(String.raw`\b${place.city.replace(/[.*+?^${}()|[\]\\']/g, '.')}\b`, 'i'), () => `Duty station: ${place.city}, ${place.country}.${place.risky ? ' A high-risk duty station, so AidJobs adds a section on conditions.' : ''}`);
  const date = (m: RegExpExecArray) => {
    const d = extractFacts(`closing ${m[0]}`, today).facts.deadline;
    if (!d) return null;
    const day = new Date(parseIso(d)).toLocaleDateString('en-GB', { weekday: 'long' });
    const note = weekend(d, place?.iso) ? ` That is a weekend${place ? ` in ${place.country}` : ''}; a working day is usually better.` : '';
    return `Closing date: ${day} ${longDate(d)}.${note}`;
  };
  add(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+20\d\d)?/i, date);
  add(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+20\d\d)?/i, date);
  add(/\b\d{1,2}[/.]\d{1,2}[/.]20\d\d\b/, date);
  add(/\b(?:in|within)\s+\d\s+weeks?\b/i, date);
  if (ownGrades.length) add(new RegExp(String.raw`\b(${ownGrades.map((g) => g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\b`, 'i'), (m) => `Grade: ${m[1].toUpperCase()}, on your organisation's own scale.`);
  add(/\b(P-?[1-5]|D-?[12]|NO-?[A-D]|G-?[1-7])\b/i, (m) => {
    const g = m[1].toUpperCase().replace('-', '');
    return `Grade: ${g}, ${g.startsWith('P') || g.startsWith('D') ? 'the UN professional scale' : g.startsWith('NO') ? 'the UN national officer scale' : 'the UN general service scale'}.`;
  });
  add(/\bfixed[- ]term\b|\btemporary\b|\bpermanent\b|\bopen[- ]ended\b|\bconsultan(?:cy|t)\b|\binternship\b/i, (m) => `Contract: ${m[0].toLowerCase()}.`);
  add(/\b\d{1,2}[- ]?(?:month|months)\b/i, (m) => `Duration: ${m[0]}.`);
  return marks.sort((a, b) => a.start - b.start);
}