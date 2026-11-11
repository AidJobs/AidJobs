/**
 * Language versions for the demo (employer-side plan, section 16, decision 6). The demo has no AI: headings, page labels, and the standard
 * sentences the demo's own writer produces are translated from a written table, with dates and country names from the browser's own
 * language data. Other lines stay in English, marked, for the employer to translate or edit while reviewing. The organisation's fixed
 * texts (its commitments) are shown as it wrote them.
 */
import { langSlots } from './plans';
import { SAMPLE_ORG } from './sample';
import type { DemoJob, Facts, JobLang, Lang, Section, Translation } from './types';

type LangInfo = { key: JobLang; label: string; native: string; locale: string; dir: 'ltr' | 'rtl' };

export const ENGLISH: LangInfo = { key: 'en', label: 'English', native: 'English', locale: 'en-GB', dir: 'ltr' };

export const LANGS: Array<LangInfo & { key: Lang }> = [
  { key: 'fr', label: 'French', native: 'Français', locale: 'fr-FR', dir: 'ltr' },
  { key: 'ar', label: 'Arabic', native: 'العربية', locale: 'ar', dir: 'rtl' },
  { key: 'es', label: 'Spanish', native: 'Español', locale: 'es-ES', dir: 'ltr' },
  { key: 'pt', label: 'Portuguese', native: 'Português', locale: 'pt-PT', dir: 'ltr' },
];

/** Every language a job can be written in or have a version in. */
export const ALL_LANGS: LangInfo[] = [ENGLISH, ...LANGS];

export function langOf(key: JobLang) {
  return ALL_LANGS.find((l) => l.key === key) ?? ENGLISH;
}

/** The language the job is written in. */
export function jobLang(job: DemoJob): JobLang {
  return job.lang ?? 'en';
}

/** The table's languages: the job's own wording in English needs no table. */
export function tableLang(lang?: JobLang): Lang | undefined {
  return lang && lang !== 'en' ? lang : undefined;
}

/** The languages a version can be made in: all those offered except the job's own. */
export function versionChoices(job: DemoJob): LangInfo[] {
  return ALL_LANGS.filter((l) => l.key !== jobLang(job));
}

/** The job's versions, in the order they were added. */
export function versionsOf(job: DemoJob): JobLang[] {
  return (Object.entries(job.translations ?? {}) as Array<[JobLang, Translation]>).sort((a, b) => a[1].at - b[1].at).map(([k]) => k);
}

const CUES: Record<Exclude<JobLang, 'ar'>, RegExp[]> = {
  en: [/\b(the|and|for|with|we|our|is|are|of|to|in|a|an|based|looking|need|officer|manager)\b/g],
  fr: [/\b(le|la|les|des|du|une|un|pour|avec|nous|notre|recherchons|cherchons|poste|chargée?|responsable|basée?|mois|cdd|cdi|et|est|dans|au|aux)\b/g, /[éèêàçù]/g],
  es: [/\b(el|los|las|del|una|un|para|con|nosotros|buscamos|puesto|basado|meses|y|en|es|oficial|técnico|técnica)\b/g, /[ñ¿¡]/g],
  pt: [/\b(o|os|as|do|da|dos|das|uma|um|para|com|nós|procuramos|vaga|baseado|meses|e|em|no|na|é|técnico|técnica)\b/g, /[ãõç]/g],
};

/**
 * The language a role is typed in (section 19: every job is written in one of the languages offered, read from the role as typed):
 * Arabic by its script, the others by their common words; English unless another language is clearly ahead.
 */
export function detectLang(text: string): JobLang {
  if ((text.match(/[\u0600-\u06FF]/g) ?? []).length >= 3) return 'ar';
  const t = text.toLowerCase();
  const score = (k: keyof typeof CUES) => CUES[k].reduce((n, re) => n + (t.match(re) ?? []).length, 0);
  const scores = (['en', 'fr', 'es', 'pt'] as const).map((k) => [k, score(k)] as const).sort((a, b) => b[1] - a[1]);
  const [top, second] = scores;
  if (top[0] === 'en' || top[1] < 2 || top[1] <= second[1]) return 'en';
  return top[0];
}

/** "write it in French", "en français", "in English please": a language asked for by name; null otherwise. */
export function langRequest(text: string): JobLang | null {
  const t = text.toLowerCase();
  if (!/\b(write|written|in|into|en|switch|change|use)\b/.test(t)) return null;
  const names: Array<[JobLang, RegExp]> = [
    ['en', /\b(in|into) english\b|\ben anglais\b/],
    ['fr', /\b(in|into) french\b|\ben français\b|\ben francais\b/],
    ['ar', /\b(in|into) arabic\b|بالعربية/],
    ['es', /\b(in|into) spanish\b|\ben español\b|\ben espanol\b/],
    ['pt', /\b(in|into) portuguese\b|\bem português\b|\bem portugues\b/],
  ];
  return names.find(([, re]) => re.test(t))?.[0] ?? null;
}

type T = Record<Lang, string>;

const HEADINGS: Record<string, T> = {
  about: { fr: 'À propos de nous', ar: 'من نحن', es: 'Quiénes somos', pt: 'Quem somos' },
  team: { fr: "Mission de l'équipe", ar: 'مهمة الفريق', es: 'Propósito del equipo', pt: 'Missão da equipa' },
  background: { fr: 'Contexte', ar: 'الخلفية', es: 'Antecedentes', pt: 'Contexto' },
  setting: { fr: 'Cadre organisationnel', ar: 'الإطار التنظيمي', es: 'Contexto organizativo', pt: 'Enquadramento organizacional' },
  purpose: { fr: 'Objet du poste', ar: 'الغرض من الوظيفة', es: 'Propósito del puesto', pt: 'Objetivo da função' },
  responsibilities: { fr: 'Responsabilités', ar: 'المسؤوليات', es: 'Responsabilidades', pt: 'Responsabilidades' },
  deliverables: { fr: 'Livrables', ar: 'المخرجات', es: 'Entregables', pt: 'Produtos esperados' },
  relationships: { fr: 'Principales relations de travail', ar: 'علاقات العمل الرئيسية', es: 'Relaciones de trabajo clave', pt: 'Principais relações de trabalho' },
  learning: { fr: "Objectifs d'apprentissage", ar: 'أهداف التعلم', es: 'Objetivos de aprendizaje', pt: 'Objetivos de aprendizagem' },
  deployment: { fr: 'Déploiement', ar: 'الانتشار', es: 'Despliegue', pt: 'Destacamento' },
  firstweeks: { fr: 'Vos premières semaines', ar: 'أسابيعك الأولى', es: 'Tus primeras semanas', pt: 'As suas primeiras semanas' },
  requirements: { fr: 'Qualifications et expérience', ar: 'المؤهلات والخبرة', es: 'Formación y experiencia', pt: 'Qualificações e experiência' },
  competencies: { fr: 'Compétences', ar: 'الكفاءات', es: 'Competencias', pt: 'Competências' },
  languages: { fr: 'Langues', ar: 'اللغات', es: 'Idiomas', pt: 'Línguas' },
  practical: { fr: 'Exigences pratiques', ar: 'المتطلبات العملية', es: 'Requisitos prácticos', pt: 'Requisitos práticos' },
  offer: { fr: 'Ce que nous offrons', ar: 'ما نقدمه', es: 'Lo que ofrecemos', pt: 'O que oferecemos' },
  conditions: { fr: 'Conditions', ar: 'ظروف العمل', es: 'Condiciones', pt: 'Condições' },
  funding: { fr: 'Financement et conditions du contrat', ar: 'التمويل وشروط العقد', es: 'Financiación y condiciones del contrato', pt: 'Financiamento e condições do contrato' },
  apply: { fr: 'Comment postuler', ar: 'كيفية التقديم', es: 'Cómo postularse', pt: 'Como se candidatar' },
  assessment: { fr: 'Évaluation', ar: 'التقييم', es: 'Evaluación', pt: 'Avaliação' },
};

/** Words on the job page and the field-post notice around the job description. */
export const UI: Record<string, T> = {
  closes: { fr: 'Clôture le', ar: 'آخر موعد للتقديم', es: 'Cierra el', pt: 'Encerra a' },
  today: { fr: "Aujourd'hui", ar: 'اليوم', es: 'Hoy', pt: 'Hoje' },
  daysLeft: { fr: '{n} jours restants', ar: 'متبقٍ {n} يوماً', es: 'Quedan {n} días', pt: 'Faltam {n} dias' },
  apply: { fr: 'Postuler sur {org}', ar: 'قدّم عبر {org}', es: 'Postular en {org}', pt: 'Candidatar-se em {org}' },
  commitments: { fr: 'Nos engagements', ar: 'التزاماتنا', es: 'Nuestros compromisos', pt: 'Os nossos compromissos' },
  publishedBy: { fr: 'Publié par {org}', ar: 'نشرتها {org}', es: 'Publicado por {org}', pt: 'Publicado por {org}' },
  notPublished: { fr: 'Pas encore publié', ar: 'لم تُنشر بعد', es: 'Aún no publicado', pt: 'Ainda não publicado' },
  posted: { fr: 'Publié le {date}', ar: 'نُشرت في {date}', es: 'Publicado el {date}', pt: 'Publicado a {date}' },
  report: { fr: 'Signaler cette offre', ar: 'الإبلاغ عن هذه الوظيفة', es: 'Denunciar esta oferta', pt: 'Denunciar esta oferta' },
  verified: { fr: 'Vérifié', ar: 'موثّقة', es: 'Verificado', pt: 'Verificado' },
  badge: { fr: 'Recrute activement', ar: 'توظيف نشط', es: 'Contratando activamente', pt: 'A recrutar ativamente' },
  hiring: { fr: 'Nous recrutons', ar: 'نحن نوظّف', es: 'Estamos contratando', pt: 'Estamos a recrutar' },
  scan: { fr: "Scannez pour lire l'offre complète et postuler", ar: 'امسح الرمز لقراءة الوظيفة كاملة والتقديم', es: 'Escanea para leer la oferta completa y postularte', pt: 'Leia o código para ver a oferta completa e candidatar-se' },
  free: { fr: "Postuler est gratuit. {org} ne demande jamais d'argent, à aucune étape.", ar: 'التقديم مجاني. لا تطلب {org} أي مال في أي مرحلة.', es: 'Postularse es gratis. {org} nunca pide dinero en ninguna etapa.', pt: 'Candidatar-se é gratuito. A {org} nunca pede dinheiro em nenhuma fase.' },
  onAidJobs: { fr: 'Publié sur AidJobs', ar: 'منشورة على AidJobs', es: 'Publicado en AidJobs', pt: 'Publicado no AidJobs' },
};

export function ui(key: keyof typeof UI | string, lang: Lang, vars: Record<string, string | number> = {}): string {
  const text = UI[key]?.[lang] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** A section heading in the language, from the table; null when the table has none. */
export function headingIn(key: string, lang: JobLang): string | null {
  return lang === 'en' ? null : (HEADINGS[key]?.[lang] ?? null);
}

const COMMITMENT_LABELS: Record<string, T> = {
  safeguarding: { fr: 'Protection', ar: 'الحماية', es: 'Salvaguardia', pt: 'Salvaguarda' },
  psea: { fr: 'PSEA', ar: 'الحماية من الاستغلال والاعتداء الجنسيين', es: 'PSEA', pt: 'PSEA' },
  mds: { fr: 'Dispositif de divulgation des fautes', ar: 'نظام الإفصاح عن سوء السلوك', es: 'Sistema de divulgación de faltas de conducta', pt: 'Sistema de divulgação de má conduta' },
  checks: { fr: 'Vérifications des antécédents', ar: 'التحقق من السوابق', es: 'Verificación de antecedentes', pt: 'Verificação de antecedentes' },
  fraud: { fr: 'Aucun frais, avertissement contre la fraude', ar: 'لا رسوم، تحذير من الاحتيال', es: 'Sin cargos, aviso de fraude', pt: 'Sem custos, aviso de fraude' },
  equal: { fr: 'Égalité des chances', ar: 'تكافؤ الفرص', es: 'Igualdad de oportunidades', pt: 'Igualdade de oportunidades' },
  encourage: { fr: 'Postulez même si…', ar: 'قدّم حتى لو…', es: 'Postúlate aunque…', pt: 'Candidate-se mesmo que…' },
};

export function commitmentLabel(key: string, english: string, lang?: JobLang): string {
  const l = tableLang(lang);
  return l ? (COMMITMENT_LABELS[key]?.[l] ?? english) : english;
}

const TERMS: Record<string, T> = {
  'Fixed-term': { fr: 'Durée déterminée', ar: 'محدد المدة', es: 'Plazo fijo', pt: 'Termo certo' },
  Temporary: { fr: 'Temporaire', ar: 'مؤقت', es: 'Temporal', pt: 'Temporário' },
  'Open-ended': { fr: 'Durée indéterminée', ar: 'غير محدد المدة', es: 'Indefinido', pt: 'Sem termo' },
  Internship: { fr: 'Stage', ar: 'تدريب', es: 'Prácticas', pt: 'Estágio' },
  Consultancy: { fr: 'Consultance', ar: 'استشارة', es: 'Consultoría', pt: 'Consultoria' },
  'On-site': { fr: 'Sur site', ar: 'في الموقع', es: 'Presencial', pt: 'Presencial' },
  Hybrid: { fr: 'Hybride', ar: 'هجين', es: 'Híbrido', pt: 'Híbrido' },
  Remote: { fr: 'À distance', ar: 'عن بُعد', es: 'Remoto', pt: 'Remoto' },
  Roster: { fr: 'Fichier de candidats', ar: 'قائمة احتياطية', es: 'Lista de reserva', pt: 'Bolsa de candidatos' },
  'part-time': { fr: 'temps partiel', ar: 'دوام جزئي', es: 'tiempo parcial', pt: 'tempo parcial' },
  'As per our salary scale': { fr: 'Selon notre grille salariale', ar: 'وفق سلّم الرواتب لدينا', es: 'Según nuestra escala salarial', pt: 'De acordo com a nossa tabela salarial' },
  Competitive: { fr: 'Compétitif', ar: 'تنافسي', es: 'Competitivo', pt: 'Competitivo' },
};

const UNITS: Array<[RegExp, T]> = [
  [/\b(\d+) months\b/g, { fr: '$1 mois', ar: '$1 شهراً', es: '$1 meses', pt: '$1 meses' }],
  [/\bgrade (\S+)/g, { fr: 'grade $1', ar: 'الدرجة $1', es: 'grado $1', pt: 'grau $1' }],
  [/\bGrade (\S+)/g, { fr: 'Grade $1', ar: 'الدرجة $1', es: 'Grado $1', pt: 'Grau $1' }],
  [/ to (\d)/g, { fr: ' à $1', ar: ' إلى $1', es: ' a $1', pt: ' a $1' }],
  [/ a month\b/g, { fr: ' par mois', ar: ' شهرياً', es: ' al mes', pt: ' por mês' }],
  [/ a year\b/g, { fr: ' par an', ar: ' سنوياً', es: ' al año', pt: ' por ano' }],
  [/ a day\b/g, { fr: ' par jour', ar: ' يومياً', es: ' al día', pt: ' por dia' }],
  [/ an hour\b/g, { fr: " de l'heure", ar: ' للساعة', es: ' por hora', pt: ' por hora' }],
];

/** Short terms: contract types, arrangements, durations, and pay. Unknown words stay as written. */
export function term(text: string, langIn?: JobLang): string {
  const lang = tableLang(langIn);
  if (!lang || !text) return text;
  let out = TERMS[text]?.[lang] ?? text;
  for (const [k, v] of Object.entries(TERMS)) out = out.replace(new RegExp(`\\b${k.replace(/[-]/g, '\\-')}\\b`, 'g'), v[lang]);
  for (const [re, v] of UNITS) out = out.replace(re, v[lang]);
  return out;
}

const SECTORS: Record<string, T> = {
  'water, sanitation and hygiene': { fr: 'eau, assainissement et hygiène', ar: 'المياه والصرف الصحي والنظافة', es: 'agua, saneamiento e higiene', pt: 'água, saneamento e higiene' },
  health: { fr: 'santé', ar: 'الصحة', es: 'salud', pt: 'saúde' },
  'child protection': { fr: "protection de l'enfance", ar: 'حماية الطفل', es: 'protección de la infancia', pt: 'proteção da criança' },
  education: { fr: 'éducation', ar: 'التعليم', es: 'educación', pt: 'educação' },
  'monitoring and evaluation': { fr: 'suivi et évaluation', ar: 'الرصد والتقييم', es: 'monitoreo y evaluación', pt: 'monitoria e avaliação' },
  finance: { fr: 'finances', ar: 'المالية', es: 'finanzas', pt: 'finanças' },
  logistics: { fr: 'logistique', ar: 'اللوجستيات', es: 'logística', pt: 'logística' },
  communications: { fr: 'communication', ar: 'الاتصالات', es: 'comunicación', pt: 'comunicação' },
  'climate and environment': { fr: 'climat et environnement', ar: 'المناخ والبيئة', es: 'clima y medio ambiente', pt: 'clima e ambiente' },
  'livelihoods and food security': { fr: 'moyens de subsistance et sécurité alimentaire', ar: 'سبل العيش والأمن الغذائي', es: 'medios de vida y seguridad alimentaria', pt: 'meios de subsistência e segurança alimentar' },
  'human resources': { fr: 'ressources humaines', ar: 'الموارد البشرية', es: 'recursos humanos', pt: 'recursos humanos' },
  'programme management': { fr: 'gestion de programmes', ar: 'إدارة البرامج', es: 'gestión de programas', pt: 'gestão de programas' },
};

const LANGUAGE_NAMES: Record<string, T> = {
  English: { fr: 'anglais', ar: 'الإنجليزية', es: 'inglés', pt: 'inglês' },
  French: { fr: 'français', ar: 'الفرنسية', es: 'francés', pt: 'francês' },
  Spanish: { fr: 'espagnol', ar: 'الإسبانية', es: 'español', pt: 'espanhol' },
  Arabic: { fr: 'arabe', ar: 'العربية', es: 'árabe', pt: 'árabe' },
  Portuguese: { fr: 'portugais', ar: 'البرتغالية', es: 'portugués', pt: 'português' },
  Swahili: { fr: 'swahili', ar: 'السواحيلية', es: 'suajili', pt: 'suaíli' },
};

const OR: T = { fr: ' ou ', ar: ' أو ', es: ' o ', pt: ' ou ' };
const AND: T = { fr: ' et ', ar: ' و', es: ' y ', pt: ' e ' };

function where(w: string, lang: Lang): string {
  if (w === 'remotely') return { fr: 'à distance', ar: 'عن بُعد', es: 'en modalidad remota', pt: 'em regime remoto' }[lang];
  const place = w.replace(/^in /, '');
  return { fr: `à ${place}`, ar: `في ${place}`, es: `en ${place}`, pt: `em ${place}` }[lang];
}

function sector(s: string, lang: Lang): string {
  return SECTORS[s.toLowerCase()]?.[lang] ?? s;
}

const DOCS: Record<string, T> = {
  'your cv': { fr: 'votre CV', ar: 'سيرتك الذاتية', es: 'tu CV', pt: 'o seu CV' },
  'cover letter': { fr: 'une lettre de motivation', ar: 'خطاب تقديم', es: 'una carta de presentación', pt: 'uma carta de apresentação' },
  'motivation letter': { fr: 'une lettre de motivation', ar: 'خطاب تحفيزي', es: 'una carta de motivación', pt: 'uma carta de motivação' },
  'academic certificates': { fr: 'vos diplômes', ar: 'الشهادات الأكاديمية', es: 'tus certificados académicos', pt: 'os seus certificados académicos' },
  'supporting statement': { fr: 'une déclaration à l’appui', ar: 'بيان داعم', es: 'una declaración de apoyo', pt: 'uma declaração de apoio' },
  'work samples': { fr: 'des exemples de travaux', ar: 'نماذج من أعمالك', es: 'muestras de trabajo', pt: 'exemplos de trabalho' },
  'your application': { fr: 'votre candidature', ar: 'طلبك', es: 'tu candidatura', pt: 'a sua candidatura' },
};

/** "your CV and cover letter" in the language, or null when an item is not in the table. */
function docs(text: string, lang: Lang): string | null {
  const items = text.split(/, | and /).map((x) => DOCS[x.trim().toLowerCase()]?.[lang]);
  if (items.some((x) => !x)) return null;
  const list = items as string[];
  return list.length > 1 ? `${list.slice(0, -1).join(', ')}${AND[lang]}${list[list.length - 1]}` : list[0];
}

const PROCESS: Record<string, T> = {
  'we review applications as they arrive': { fr: 'nous examinons les candidatures au fur et à mesure', ar: 'نراجع الطلبات فور وصولها', es: 'revisamos las candidaturas a medida que llegan', pt: 'analisamos as candidaturas à medida que chegam' },
  'we may close this vacancy early': { fr: 'nous pouvons clôturer cette offre plus tôt', ar: 'قد نغلق هذا الشاغر مبكراً', es: 'podemos cerrar esta vacante antes de tiempo', pt: 'podemos encerrar esta vaga mais cedo' },
  'only shortlisted candidates will be contacted': { fr: 'seules les personnes présélectionnées seront contactées', ar: 'سيتم التواصل مع المرشحين في القائمة المختصرة فقط', es: 'solo se contactará a las personas preseleccionadas', pt: 'apenas as pessoas pré-selecionadas serão contactadas' },
};

/** Whole sentences the demo's writer produces, word for word. */
const FIXED: Record<string, T> = {
  'Essential:': { fr: 'Essentiel :', ar: 'أساسي:', es: 'Imprescindible:', pt: 'Essencial:' },
  'Desirable:': { fr: 'Souhaitable :', ar: 'مرغوب:', es: 'Deseable:', pt: 'Desejável:' },
  'Reports to: Head of Programmes.': { fr: 'Rattachement : responsable des programmes.', ar: 'يرفع التقارير إلى: رئيس البرامج.', es: 'Depende de: jefatura de programas.', pt: 'Reporta a: chefe de programas.' },
  'Direct reports: none.': { fr: 'Personnes encadrées : aucune.', ar: 'المرؤوسون المباشرون: لا يوجد.', es: 'Personas a cargo: ninguna.', pt: 'Subordinados diretos: nenhum.' },
  'Works closely with the operations, MEAL, and partnerships teams, and with local partners.': {
    fr: "Travaille en étroite collaboration avec les équipes des opérations, MEAL et partenariats, ainsi qu'avec les partenaires locaux.",
    ar: 'يعمل بشكل وثيق مع فرق العمليات والرصد والتقييم والمساءلة والتعلّم والشراكات، ومع الشركاء المحليين.',
    es: 'Trabaja en estrecha colaboración con los equipos de operaciones, MEAL y alianzas, y con los socios locales.',
    pt: 'Trabalha em estreita colaboração com as equipas de operações, MEAL e parcerias, e com os parceiros locais.',
  },
  '- Meet the team and partners, and visit project sites': { fr: "- Rencontrer l'équipe et les partenaires, et visiter les sites des projets", ar: '- التعرف على الفريق والشركاء وزيارة مواقع المشاريع', es: '- Conocer al equipo y a los socios, y visitar los sitios de los proyectos', pt: '- Conhecer a equipa e os parceiros, e visitar os locais dos projetos' },
  '- Agree your work plan and priorities with your manager': { fr: '- Convenir de votre plan de travail et de vos priorités avec votre responsable', ar: '- الاتفاق على خطة عملك وأولوياتك مع مديرك', es: '- Acordar tu plan de trabajo y tus prioridades con tu responsable', pt: '- Acordar o seu plano de trabalho e prioridades com a sua chefia' },
  '- Complete induction, including safeguarding and security briefings': { fr: "- Suivre l'intégration, y compris les séances sur la protection et la sécurité", ar: '- إكمال برنامج التعريف، بما في ذلك إحاطات الحماية والأمن', es: '- Completar la inducción, incluidas las sesiones sobre salvaguardia y seguridad', pt: '- Concluir a integração, incluindo as sessões sobre salvaguarda e segurança' },
  '- Annual leave, medical insurance, and a learning budget': { fr: '- Congés annuels, assurance médicale et budget de formation', ar: '- إجازة سنوية وتأمين طبي وميزانية للتعلّم', es: '- Vacaciones anuales, seguro médico y presupuesto de formación', pt: '- Férias anuais, seguro de saúde e orçamento para formação' },
  '- Rest and recuperation in line with the duty station': { fr: "- Repos et récupération selon le lieu d'affectation", ar: '- فترات راحة واستجمام وفق مركز العمل', es: '- Descanso y recuperación según el lugar de destino', pt: '- Descanso e recuperação de acordo com o local de afetação' },
  '- A monthly stipend and a mentor for the whole internship': { fr: '- Une indemnité mensuelle et un mentor pendant tout le stage', ar: '- منحة شهرية ومرشد طوال فترة التدريب', es: '- Una ayuda mensual y una persona mentora durante todas las prácticas', pt: '- Um subsídio mensal e um mentor durante todo o estágio' },
  'This post is subject to continued funding.': { fr: 'Ce poste dépend de la poursuite du financement.', ar: 'هذه الوظيفة مرهونة باستمرار التمويل.', es: 'Este puesto está sujeto a la continuidad de la financiación.', pt: 'Esta função está sujeita à continuidade do financiamento.' },
  'Standard working conditions for the duty station.': { fr: "Conditions de travail habituelles pour le lieu d'affectation.", ar: 'ظروف عمل اعتيادية لمركز العمل.', es: 'Condiciones de trabajo habituales para el lugar de destino.', pt: 'Condições de trabalho habituais para o local de afetação.' },
  'Shortlisted candidates may take a written assessment, followed by a competency-based interview.': {
    fr: "Les personnes présélectionnées pourront passer une épreuve écrite, suivie d'un entretien fondé sur les compétences.",
    ar: 'قد يخضع المرشحون في القائمة المختصرة لتقييم كتابي، تليه مقابلة قائمة على الكفاءات.',
    es: 'Las personas preseleccionadas podrán realizar una prueba escrita, seguida de una entrevista por competencias.',
    pt: 'As pessoas pré-selecionadas poderão realizar uma prova escrita, seguida de uma entrevista por competências.',
  },
  '- Relevant experience in a similar role, or equivalent experience': { fr: '- Expérience pertinente dans un poste similaire, ou expérience équivalente', ar: '- خبرة ذات صلة في وظيفة مماثلة، أو خبرة معادلة', es: '- Experiencia pertinente en un puesto similar, o experiencia equivalente', pt: '- Experiência relevante numa função semelhante, ou experiência equivalente' },
  '- Currently enrolled in, or recently completed, a relevant degree, or equivalent experience': {
    fr: '- Inscription en cours ou récente dans un diplôme pertinent, ou expérience équivalente',
    ar: '- الالتحاق حالياً ببرنامج دراسي ذي صلة أو إكماله مؤخراً، أو خبرة معادلة',
    es: '- Estar cursando, o haber terminado recientemente, una titulación pertinente, o experiencia equivalente',
    pt: '- Estar a frequentar, ou ter concluído recentemente, um curso relevante, ou experiência equivalente',
  },
  [SAMPLE_ORG.about]: {
    fr: "Riverstone Aid est une ONG internationale fictive qui travaille avec les communautés d'Afrique de l'Est dans les domaines de l'eau potable, de la santé et de la protection. Cette organisation n'existe que dans cette démo.",
    ar: 'Riverstone Aid منظمة غير حكومية دولية افتراضية تعمل مع المجتمعات في شرق أفريقيا في مجالات المياه النظيفة والصحة والحماية. هذه المنظمة خيالية ولا توجد إلا في هذا العرض التجريبي.',
    es: 'Riverstone Aid es una ONG internacional ficticia que trabaja con comunidades de África Oriental en agua potable, salud y protección. Esta organización solo existe en esta demostración.',
    pt: 'A Riverstone Aid é uma ONG internacional fictícia que trabalha com comunidades da África Oriental em água potável, saúde e proteção. Esta organização só existe nesta demonstração.',
  },
};

type Rule = [RegExp, (m: RegExpMatchArray, lang: Lang) => string | null];

/** Sentence patterns from the demo's writer, with the job's own words (title, place, organisation) kept as they are. */
const PATTERNS: Rule[] = [
  [
    /^The (.+) leads (.+) work (remotely|in .+) and contributes to (.+)'s country strategy\.$/,
    (m, l) =>
      ({
        fr: `Le ou la ${m[1]} dirige les activités de ${sector(m[2], l)} ${where(m[3], l)} et contribue à la stratégie pays de ${m[4]}.`,
        ar: `يتولى شاغل وظيفة ${m[1]} قيادة أعمال ${sector(m[2], l)} ${where(m[3], l)}، ويساهم في الاستراتيجية القُطرية لـ${m[4]}.`,
        es: `La persona ${m[1]} dirige el trabajo de ${sector(m[2], l)} ${where(m[3], l)} y contribuye a la estrategia de país de ${m[4]}.`,
        pt: `A pessoa ${m[1]} lidera o trabalho de ${sector(m[2], l)} ${where(m[3], l)} e contribui para a estratégia de país de ${m[4]}.`,
      })[l],
  ],
  [
    /^We're looking for an? (.+) to join our team (remotely|in .+)\. You'll lead our (.+) work and make a real difference for the communities we serve\.$/,
    (m, l) =>
      ({
        fr: `Nous recherchons un ou une ${m[1]} pour rejoindre notre équipe ${where(m[2], l)}. Vous dirigerez nos activités de ${sector(m[3], l)} et ferez une vraie différence pour les communautés que nous servons.`,
        ar: `نبحث عن ${m[1]} للانضمام إلى فريقنا ${where(m[2], l)}. ستقود أعمالنا في مجال ${sector(m[3], l)} وتُحدث فرقاً حقيقياً في المجتمعات التي نخدمها.`,
        es: `Buscamos a una persona para el puesto de ${m[1]} que se una a nuestro equipo ${where(m[2], l)}. Liderarás nuestro trabajo de ${sector(m[3], l)} y marcarás una diferencia real para las comunidades a las que servimos.`,
        pt: `Procuramos uma pessoa para a função de ${m[1]} para integrar a nossa equipa ${where(m[2], l)}. Vai liderar o nosso trabalho de ${sector(m[3], l)} e fazer uma diferença real para as comunidades que servimos.`,
      })[l],
  ],
  [
    /^This (.+) role is based (remotely|in .+) and leads (.+) work\.$/,
    (m, l) =>
      ({
        fr: `Ce poste de ${m[1]} est basé ${where(m[2], l)} et dirige les activités de ${sector(m[3], l)}.`,
        ar: `مقر وظيفة ${m[1]} ${where(m[2], l)}، وتتولى قيادة أعمال ${sector(m[3], l)}.`,
        es: `Este puesto de ${m[1]} tiene sede ${where(m[2], l)} y dirige el trabajo de ${sector(m[3], l)}.`,
        pt: `Esta função de ${m[1]} está baseada ${where(m[2], l)} e lidera o trabalho de ${sector(m[3], l)}.`,
      })[l],
  ],
  [/^Contract: (.+)\.$/, (m, l) => ({ fr: `Contrat : ${term(m[1], l)}.`, ar: `العقد: ${term(m[1], l)}.`, es: `Contrato: ${term(m[1], l)}.`, pt: `Contrato: ${term(m[1], l)}.` })[l]],
  [/^Salary: (.+)\.$/, (m, l) => ({ fr: `Salaire : ${term(m[1], l)}.`, ar: `الراتب: ${term(m[1], l)}.`, es: `Salario: ${term(m[1], l)}.`, pt: `Salário: ${term(m[1], l)}.` })[l]],
  [/^Direct reports: (.+)\.$/, (m, l) => ({ fr: `Personnes encadrées : ${m[1]}.`, ar: `المرؤوسون المباشرون: ${m[1]}.`, es: `Personas a cargo: ${m[1]}.`, pt: `Subordinados diretos: ${m[1]}.` })[l]],
  [
    /^- At least (\d+) years of relevant, progressively responsible experience$/,
    (m, l) =>
      ({
        fr: `- Au moins ${m[1]} ans d'expérience pertinente, avec des responsabilités croissantes`,
        ar: `- خبرة ذات صلة لا تقل عن ${m[1]} سنوات، مع مسؤوليات متزايدة`,
        es: `- Al menos ${m[1]} años de experiencia pertinente, con responsabilidades crecientes`,
        pt: `- Pelo menos ${m[1]} anos de experiência relevante, com responsabilidades crescentes`,
      })[l],
  ],
  [
    /^Fluency in (\w+) is required\.(?: Knowledge of (.+) is desirable\.)?$/,
    (m, l) => {
      const name = (n: string) => LANGUAGE_NAMES[n]?.[l] ?? n;
      const more = m[2] ? m[2].split(' or ').map(name).join(OR[l]) : '';
      return {
        fr: `Maîtrise requise : ${name(m[1])}.${more ? ` Souhaitable : ${more}.` : ''}`,
        ar: `إتقان ${name(m[1])} مطلوب.${more ? ` معرفة ${more} مرغوبة.` : ''}`,
        es: `Se requiere dominio de ${name(m[1])}.${more ? ` Se valorará el conocimiento de ${more}.` : ''}`,
        pt: `É necessário domínio de ${name(m[1])}.${more ? ` O conhecimento de ${more} é desejável.` : ''}`,
      }[l];
    },
  ],
  [
    /^- Willingness to travel to project sites(?: in (.+))?$/,
    (m, l) => {
      const c = m[1] ? ` (${m[1]})` : '';
      return { fr: `- Disponibilité pour se rendre sur les sites des projets${c}`, ar: `- الاستعداد للسفر إلى مواقع المشاريع${c}`, es: `- Disponibilidad para viajar a los sitios de los proyectos${c}`, pt: `- Disponibilidade para viajar para os locais dos projetos${c}` }[l];
    },
  ],
  [
    /^(.+) is a non-family duty station with security restrictions; rest and recuperation applies\.$/,
    (m, l) =>
      ({
        fr: `${m[1]} est un lieu d'affectation sans famille, avec des restrictions de sécurité ; un régime de repos et de récupération s'applique.`,
        ar: `${m[1]} مركز عمل لا تُرافق فيه الأسرة، مع قيود أمنية؛ وتنطبق فترات الراحة والاستجمام.`,
        es: `${m[1]} es un lugar de destino no apto para familias, con restricciones de seguridad; se aplica el régimen de descanso y recuperación.`,
        pt: `${m[1]} é um local de afetação sem família, com restrições de segurança; aplica-se o regime de descanso e recuperação.`,
      })[l],
  ],
  [
    /^Apply on (.+)'s careers site by (.+?), with (.+)\.$/,
    (m, l) => {
      const d = docs(m[3], l);
      if (!d) return null;
      return { fr: `Postulez sur le site carrières de ${m[1]} avant le ${m[2]}, avec ${d}.`, ar: `قدّم طلبك عبر موقع الوظائف لدى ${m[1]} قبل ${m[2]}، مع ${d}.`, es: `Postúlate en el sitio de empleo de ${m[1]} antes del ${m[2]}, con ${d}.`, pt: `Candidate-se no site de carreiras de ${m[1]} até ${m[2]}, com ${d}.` }[l];
    },
  ],
  [
    /^Send (.+) to (\S+) by (.+)\.$/,
    (m, l) => {
      const d = docs(m[1], l);
      if (!d) return null;
      return { fr: `Envoyez ${d} à ${m[2]} avant le ${m[3]}.`, ar: `أرسل ${d} إلى ${m[2]} قبل ${m[3]}.`, es: `Envía ${d} a ${m[2]} antes del ${m[3]}.`, pt: `Envie ${d} para ${m[2]} até ${m[3]}.` }[l];
    },
  ],
  [
    /^Apply through the application form on our careers site by (.+)\. We do not accept CVs\.$/,
    (m, l) =>
      ({
        fr: `Postulez via le formulaire de candidature de notre site carrières avant le ${m[1]}. Nous n'acceptons pas les CV.`,
        ar: `قدّم طلبك عبر استمارة التقديم في موقع الوظائف لدينا قبل ${m[1]}. لا نقبل السير الذاتية.`,
        es: `Postúlate mediante el formulario de nuestro sitio de empleo antes del ${m[1]}. No aceptamos CV.`,
        pt: `Candidate-se através do formulário do nosso site de carreiras até ${m[1]}. Não aceitamos CV.`,
      })[l],
  ],
  [
    /^(.+)\.$/,
    (m, l) => {
      const parts = m[1].replace(/^./, (c) => c.toLowerCase()).split(', and ');
      const done = parts.map((p) => PROCESS[p]?.[l]);
      if (done.some((x) => !x)) return null;
      const text = done.join({ fr: ', et ', ar: '، و', es: ', y ', pt: ', e ' }[l]);
      return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
    },
  ],
];

const MONTH_RE = /\b(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/g;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function localDate(iso: string, lang?: JobLang): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang ? langOf(lang).locale : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The country's name in the language, from the browser's own data. */
export function countryName(iso: string, english: string, lang?: JobLang): string {
  if (!tableLang(lang) || !lang || !iso) return english;
  try {
    return new Intl.DisplayNames([langOf(lang).locale], { type: 'region' }).of(iso) ?? english;
  } catch {
    return english;
  }
}

/** Dates and the job's country, put into the language wherever they appear. */
function localise(text: string, f: Facts, lang: Lang): string {
  let out = text.replace(MONTH_RE, (_, d: string, mon: string, y: string) => localDate(`${y}-${String(MONTHS.indexOf(mon) + 1).padStart(2, '0')}-${d.padStart(2, '0')}`, lang));
  if (f.country && f.iso) out = out.split(f.country).join(countryName(f.iso, f.country, lang));
  return out;
}

/** One line in the language, or null when the demo's table has no translation for it. */
export function translateLine(line: string, f: Facts, lang: Lang): string | null {
  const fixed = FIXED[line]?.[lang];
  if (fixed) return localise(fixed, f, lang);
  for (const [re, make] of PATTERNS) {
    const m = line.match(re);
    if (!m) continue;
    const out = make(m, lang);
    if (out) return localise(out, f, lang);
  }
  return null;
}

/**
 * A section the rules wrote in English, put into the job's own language by the table: its heading, and each line the table covers; other
 * lines stay as written. Text written by hand or by the AI is already in the job's language and is left alone.
 */
export function inLanguage(sec: Section, f: Facts, lang: JobLang): Section {
  const l = tableLang(lang);
  if (!l || sec.edited || sec.ai) return sec;
  return { ...sec, title: HEADINGS[sec.key]?.[l] ?? sec.title, lines: sec.lines.map((x) => translateLine(x, f, l) ?? x) };
}

/**
 * A section's text in English, as the source for a version: for a job in another language, the rules' own English for the sections they
 * wrote (`english`), and the job's own text for the rest.
 */
function englishOf(job: DemoJob, sec: Section, english?: (sec: Section) => Section | null): Section {
  return jobLang(job) === 'en' ? sec : (english?.(sec) ?? sec);
}

/** One section drafted in the language: what the table covers is translated; every other line stays in the job's language, to translate while reviewing. */
function draftSection(job: DemoJob, sec: Section, lang: JobLang, english?: (sec: Section) => Section | null): Section {
  const en = englishOf(job, sec, english);
  if (lang === 'en') return { key: sec.key, title: en.title, lines: en.lines };
  return { key: sec.key, title: HEADINGS[sec.key]?.[lang] ?? sec.title, lines: sec.lines.map((l, i) => translateLine(en.lines[i] ?? l, job.facts, lang) ?? l) };
}

/** A first draft of the job in the language, with the job's sections; from then on the version keeps its own sections. */
export function draftTranslation(job: DemoJob, lang: JobLang, english?: (sec: Section) => Section | null): Translation {
  return { sections: job.sections.map((sec) => draftSection(job, sec, lang, english)), reviewed: false, source: sourceOf(job), at: Date.now() };
}

/** One section of the job drafted for a version that does not have it yet. */
export function draftVersionSection(job: DemoJob, key: string, lang: JobLang, english?: (sec: Section) => Section | null): Section | null {
  const sec = job.sections.find((x) => x.key === key);
  return sec ? draftSection(job, sec, lang, english) : null;
}

function sourceOf(job: DemoJob): string {
  return JSON.stringify(job.sections.map((sec) => [sec.key, sec.lines]));
}

/** The sections of the job's own text that changed since the version was last brought up to date. */
export function changedFor(job: DemoJob, t: Translation): string[] {
  const before = new Map<string, string[]>(JSON.parse(t.source) as Array<[string, string[]]>);
  return job.sections.filter((sec) => t.sections.some((x) => x.key === sec.key) && JSON.stringify(before.get(sec.key)) !== JSON.stringify(sec.lines)).map((sec) => sec.key);
}

/**
 * "Update the French too": in the version's own sections, lines whose source did not change keep their wording, changed lines are
 * drafted again; sections the version added or removed stay as they are. It needs a new review.
 */
export function redraftTranslation(job: DemoJob, old: Translation, lang: JobLang, english?: (sec: Section) => Section | null): Translation {
  const before = new Map<string, string[]>(JSON.parse(old.source) as Array<[string, string[]]>);
  const sections = old.sections.map((oldSec) => {
    const sec = job.sections.find((x) => x.key === oldSec.key);
    if (!sec) return oldSec;
    const fresh = draftSection(job, sec, lang, english);
    const oldSrc = before.get(sec.key) ?? [];
    return { ...fresh, title: oldSec.title, lines: fresh.lines.map((l, i) => (oldSrc[i] === sec.lines[i] && oldSec.lines[i] !== undefined ? oldSec.lines[i] : l)) };
  });
  return { ...old, sections, reviewed: false, source: sourceOf(job), kept: undefined };
}

/** "Keep the French as it is": the version stays as it is, and the update is not offered again for this text. */
export function keptTranslation(job: DemoJob, t: Translation): Translation {
  return { ...t, kept: sourceOf(job) };
}

/** Lines still word for word as in the job's own language, for the review. */
export function untranslated(job: DemoJob, t: Translation): number {
  return t.sections.reduce((n, sec) => {
    const own = job.sections.find((x) => x.key === sec.key);
    return n + sec.lines.filter((l, i) => own?.lines[i] === l && /\p{L}{3}/u.test(l)).length;
  }, 0);
}

export function totalLines(t: Translation): number {
  return t.sections.reduce((n, sec) => n + sec.lines.length, 0);
}

/**
 * Whether the job's own text changed since the version was last brought up to date, and the user has not chosen to keep it as it is.
 * Since 8 November 2026 a change is no longer carried into the versions: the chat offers the update, and the version stays as it was.
 */
export function stale(job: DemoJob, t: Translation): boolean {
  const now = sourceOf(job);
  return now !== t.source && now !== t.kept;
}

/**
 * The versions shown on the public job page: reviewed, only for an amplified job, and only as many as it includes or has paid for, in
 * the order they were added. A version that is behind the job's own text stays until the user updates it or keeps it.
 */
export function publicLangs(job: DemoJob): JobLang[] {
  if (job.plan !== 'amplify' || !job.translations) return [];
  return versionsOf(job)
    .filter((k) => k !== jobLang(job))
    .slice(0, langSlots(job))
    .filter((k) => job.translations?.[k]?.reviewed);
}
