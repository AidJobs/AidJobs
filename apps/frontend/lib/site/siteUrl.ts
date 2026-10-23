/** The public address of the site; one setting, so connecting the domain changes one value (UX-18). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://aid-jobs-frontend.vercel.app').replace(/\/+$/, '');

/** Search engines are told not to index any page until this is set to "true" at launch (UX-18). */
export const SITE_INDEXABLE = process.env.NEXT_PUBLIC_SITE_INDEXABLE === 'true';

/** Where the new public site lives until the switch (UX-29) moves it to "/". */
export const HOME_PATH = '/v2';
