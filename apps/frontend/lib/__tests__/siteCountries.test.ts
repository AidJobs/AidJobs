/**
 * @jest-environment node
 */
import { countries as flagCountries, hasFlag } from 'country-flag-icons';
import { COUNTRY_NAMES, countryName, isoFromName } from '../site/countries';
import { isoFromLocation } from '../site/jobs';
import liveLocations from './fixtures/liveLocations.json';

/** The approved demo named countries with the runtime's Intl names; the fixed table must give the same answers. */
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

describe('fixed country table', () => {
  it('names every two-letter flag the same way the demo did', () => {
    for (const code of flagCountries) {
      if (code.length !== 2 || code === 'XA') continue;
      const name = regionNames.of(code);
      if (!name || name === code) continue;
      expect([code, COUNTRY_NAMES[code]]).toEqual([code, name]);
    }
  });

  it('looks names up both ways, ignoring case and spaces', () => {
    expect(countryName('ke')).toBe('Kenya');
    expect(countryName('SS')).toBe('South Sudan');
    expect(countryName(null)).toBeNull();
    expect(countryName('ZZ')).toBeNull();
    expect(isoFromName(' kenya ')).toBe('KE');
    expect(isoFromName('Myanmar (Burma)')).toBe('MM');
    expect(isoFromName('State of Palestine')).toBe('PS');
    expect(isoFromName('UK')).toBe('GB');
    expect(isoFromName('Atlantis')).toBeNull();
  });

  it('places every live job location exactly as the demo did', () => {
    expect(rows.length).toBeGreaterThan(50);
    for (const r of rows) {
      expect([r.location, siteIso(r.location, r.country_iso)]).toEqual([r.location, demoIso(r.location, r.country_iso)]);
    }
  });
});
