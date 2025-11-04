export interface CollectionPreset {
  slug: string;
  title: string;
  description: string;
  filters: Record<string, string | boolean | string[]>;
  metaDescription?: string;
}

export const collections: Record<string, CollectionPreset> = {
  'un-jobs': {
    slug: 'un-jobs',
    title: 'UN Jobs',
    description: 'Opportunities with United Nations agencies and programs',
    filters: { org_type: 'un' },
    metaDescription: 'Browse jobs with UN agencies including UNDP, UNICEF, UNHCR, and more.',
  },
  'remote': {
    slug: 'remote',
    title: 'Remote Jobs',
    description: 'Work from anywhere with these remote opportunities',
    filters: { work_modality: 'remote' },
    metaDescription: 'Find remote NGO and INGO jobs you can do from anywhere in the world.',
  },
  'consultancies': {
    slug: 'consultancies',
    title: 'Consultancies',
    description: 'Short-term consultancy contracts and expert positions',
    filters: { career_type: 'consultancy' },
    metaDescription: 'Explore consultancy opportunities with NGOs, INGOs, and UN agencies.',
  },
  'fellowships': {
    slug: 'fellowships',
    title: 'Fellowships',
    description: 'Professional development fellowships and programs',
    filters: { career_type: 'fellowship' },
    metaDescription: 'Discover fellowship programs for emerging and mid-career professionals.',
  },
  'surge': {
    slug: 'surge',
    title: 'Surge & Emergency',
    description: 'Rapid deployment roles for humanitarian emergencies',
    filters: { surge_required: true },
    metaDescription: 'Find surge capacity and emergency response positions for crisis situations.',
  },
};

export function getCollection(slug: string): CollectionPreset | null {
  return collections[slug] || null;
}

export function getAllCollectionSlugs(): string[] {
  return Object.keys(collections);
}
