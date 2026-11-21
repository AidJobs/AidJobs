/**
 * R2-P1-7 (21 November 2026): national NGO chips and default format —
 * no UN as chip #2; org type wins over house for ngo/charity; browse order org-aware.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { defaultFormatKey } from '../../components/employer-demo/actions';
import { familiesForOrg, recommendation } from '../../components/employer-demo/setup';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo('riverstone');
  update((s) => ({ ...s, signedIn: true }));
});

describe('R2-P1-7: NGO template chips and house vs org type', () => {
  it('Tumaini chips: Local NGO, then National sibling, then INGO — no UN in others', () => {
    resetDemo('tumaini');
    update((s) => ({ ...s, signedIn: true }));
    const rec = recommendation(getState(), 'local-concise');
    expect(rec.key).toBe('local-concise');
    expect(rec.others[0]).toBe('charity');
    const families = rec.others.map((k) => getState().formats.find((f) => f.key === k)?.family);
    expect(families[1]).toBe('INGO and humanitarian');
    expect(families.every((f) => f !== 'UN and multilateral')).toBe(true);
  });

  it('defaultFormatKey: ngo with a house format still uses Local NGO concise', () => {
    resetDemo('riverstone');
    update((s) => ({
      ...s,
      signedIn: true,
      org: { ...s.org, orgType: 'ngo', name: 'Tumaini Community Trust', short: 'Tumaini' },
    }));
    expect(getState().formats.some((f) => f.key === 'house')).toBe(true);
    expect(defaultFormatKey(getState())).toBe('local-concise');
  });

  it('defaultFormatKey: charity with house uses Domestic charity', () => {
    resetDemo('riverstone');
    update((s) => ({
      ...s,
      signedIn: true,
      org: { ...s.org, orgType: 'charity' },
    }));
    expect(defaultFormatKey(getState())).toBe('charity');
  });

  it('defaultFormatKey: ingo still prefers house when present', () => {
    resetDemo('riverstone');
    update((s) => ({ ...s, signedIn: true }));
    expect(getState().org.orgType).toBe('ingo');
    expect(defaultFormatKey(getState())).toBe('house');
  });

  it('familiesForOrg puts National before INGO before UN for ngo', () => {
    const order = familiesForOrg('ngo');
    expect(order[0]).toBe('Your organisation');
    expect(order[1]).toBe('National NGOs and charities');
    expect(order.indexOf('INGO and humanitarian')).toBeLessThan(order.indexOf('UN and multilateral'));
  });

  it('familiesForOrg keeps UN early for un org type', () => {
    const order = familiesForOrg('un');
    expect(order[1]).toBe('UN and multilateral');
  });
});
