/**
 * @jest-environment node
 */
import { countries as flagCountries, hasFlag } from 'country-flag-icons';
import { COUNTRY_NAMES, countryName, isoFromName, nameKey } from '../site/countries';
import { isoFromLocation } from '../site/jobs';
import liveLocations from './fixtures/liveLocations.json';

/** The approved demo named countries with the runtime's Intl names and a few extra spellings. */
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const DEMO_ALIASES: Record<string, string> = {
  uk: 'GB',
  usa: 'US',
  'south sudan': 'SS',
  "cote d'ivoire": 'CI',
  'state of palestine': 'PS',
  'state of palestine (sop)': 'PS',
};

function demoIso(location: string | null, iso: string | null): string | null {
  if (iso && hasFlag(iso.toUpperCase())) return iso.toUpperCase();
  const last = location?.split(',').pop()?.trim().toLowerCase();
  if (!last) return null;
  if (DEMO_ALIASES[last]) return DEMO_ALIASES[last];
  for (const code of flagCountries) {
    if (code.length === 2 && regionNames.of(code)?.toLowerCase() === last) return code;
  }
  return null;
}

function siteIso(location: string | null, iso: string | null): string | null {
  if (iso && hasFlag(iso.toUpperCase())) return iso.toUpperCase();
  return isoFromLocation(location);
}

const rows = liveLocations as Array<{ location: string | null; country_iso: string | null }>;

/** Live locations the demo left without a country, and where they are now placed (approved 23 October 2026). */
const NOW_PLACED: Record<string, string> = {
  'Afghanistan, various sites': 'AF',
  'Democratic Republic of the Congo, various sites': 'CD',
  'Ethiopia, various sites': 'ET',
  'Lao People’s Democratic Republic': 'LA',
  Myanmar: 'MM',
  'Nigeria, various sites': 'NG',
  'Syrian Arab Republic': 'SY',
  'Ukraine, various sites': 'UA',
  'United Republic of Tanzania': 'TZ',
  'Yangon, Bahan Township, Myanmar': 'MM',
};

describe('fixed country table', () => {
  it('keeps the CLDR name for every two-letter flag', () => {
    for (const code of flagCountries) {
      if (code.length !== 2 || code === 'XA') continue;
      const name = regionNames.of(code);
      if (!name || name === code) continue;
      expect([code, COUNTRY_NAMES[code]]).toEqual([code, name]);
    }
  });

  it('shows plainer names for a few countries and writes "and" for "&"', () => {
    expect(countryName('MM')).toBe('Myanmar');
    expect(countryName('CD')).toBe('DR Congo');
    expect(countryName('PS')).toBe('State of Palestine');
    expect(countryName('BA')).toBe('Bosnia and Herzegovina');
    expect(countryName('ke')).toBe('Kenya');
    expect(countryName(null)).toBeNull();
    expect(countryName('ZZ')).toBeNull();
  });

  it('matches names regardless of accents, apostrophes, "&", case, and a leading "The"', () => {
    expect(nameKey('  Côte d’Ivoire ')).toBe("cote d'ivoire");
    expect(isoFromName("Cote d'Ivoire")).toBe('CI');
    expect(isoFromName('Türkiye')).toBe('TR');
    expect(isoFromName('Turkiye')).toBe('TR');
    expect(isoFromName('Bosnia and Herzegovina')).toBe('BA');
    expect(isoFromName('The Gambia')).toBe('GM');
    expect(isoFromName('Myanmar (Burma)')).toBe('MM');
    expect(isoFromName('State of Palestine')).toBe('PS');
    expect(isoFromName('UK')).toBe('GB');
    expect(isoFromName('Atlantis')).toBeNull();
  });

  it('places every live location the demo placed in the same country', () => {
    expect(rows.length).toBeGreaterThan(50);
    for (const r of rows) {
      const demo = demoIso(r.location, r.country_iso);
      if (demo) expect([r.location, siteIso(r.location, r.country_iso)]).toEqual([r.location, demo]);
    }
  });

  it('places the live locations the demo missed, and only real countries', () => {
    for (const r of rows) {
      if (demoIso(r.location, r.country_iso) || !r.location) continue;
      expect([r.location, siteIso(r.location, r.country_iso)]).toEqual([r.location, NOW_PLACED[r.location] ?? null]);
    }
  });
});
