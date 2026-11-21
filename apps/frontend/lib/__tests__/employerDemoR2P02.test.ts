/**
 * R2-P0-2 (21 November 2026): local NGO path must not leak Riverstone sample org
 * (template chips, apply URL, commitments, AI orgType, Google title).
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { defaultFormatKey, startJob } from '../../components/employer-demo/actions';
import { applyLines, defaultApply } from '../../components/employer-demo/apply';
import { contextFor } from '../../components/employer-demo/ai';
import { GooglePreview } from '../../components/employer-demo/Publish';
import { SAMPLE_ORG_NGO } from '../../components/employer-demo/sample';
import { recommendation } from '../../components/employer-demo/setup';
import { currentPreset, getState, resetDemo, update } from '../../components/employer-demo/store';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo('riverstone');
  update((s) => ({ ...s, signedIn: true }));
});

describe('R2-P0-2: Tumaini local NGO preset', () => {
  it('resetDemo("tumaini") loads Tumaini, not Riverstone', () => {
    resetDemo('tumaini');
    update((s) => ({ ...s, signedIn: true }));
    const s = getState();
    expect(currentPreset()).toBe('tumaini');
    expect(s.org.name).toBe('Tumaini Community Trust');
    expect(s.org.orgType).toBe('ngo');
    expect(s.org.domain).toBe('tumaini.example.org');
    expect(s.formats.some((f) => f.key === 'house')).toBe(false);
    expect(s.jobs).toHaveLength(0);
    expect(s.org.standard.every((c) => c.text.includes('Tumaini'))).toBe(true);
    expect(s.org.standard.some((c) => /riverstone/i.test(c.text))).toBe(false);
  });

  it('first Tumaini job defaults to Local NGO concise', () => {
    resetDemo('tumaini');
    update((s) => ({ ...s, signedIn: true }));
    expect(defaultFormatKey(getState())).toBe('local-concise');
    const id = startJob('WASH Coordinator in Kisumu, Kenya, closing 18 December 2026', undefined, [], true);
    const j = getState().jobs.find((x) => x.id === id)!;
    expect(j.format).toBe('local-concise');
  });

  it('Tumaini apply defaults to email, not a careers-site URL', () => {
    const apply = defaultApply(SAMPLE_ORG_NGO.orgType, SAMPLE_ORG_NGO.careersUrl);
    expect(apply.method).toBe('email');
    expect(apply.address).toBe('');
    const lines = applyLines(apply, { title: 'WASH Coordinator', deadline: '2026-12-18' } as never, SAMPLE_ORG_NGO);
    expect(lines.join(' ')).toMatch(/jobs@tumaini\.example\.org/i);
    expect(lines.join(' ')).not.toMatch(/careers site/i);
    expect(lines.join(' ')).not.toMatch(/riverstone/i);
  });

  it('recommendation others for ngo prefer National NGOs then INGO, not UN chips', () => {
    resetDemo('tumaini');
    update((s) => ({ ...s, signedIn: true }));
    const rec = recommendation(getState(), 'local-concise');
    expect(rec.key).toBe('local-concise');
    const labels = rec.others.map((k) => getState().formats.find((f) => f.key === k)?.family);
    expect(labels[0]).toBe('National NGOs and charities');
    expect(labels[1]).toBe('INGO and humanitarian');
    expect(labels.includes('UN and multilateral')).toBe(false);
  });

  it('AI context for Tumaini exposes orgType ngo and Tumaini name', () => {
    resetDemo('tumaini');
    update((s) => ({ ...s, signedIn: true }));
    const id = startJob('WASH Coordinator in Kisumu', undefined, [], true);
    const s = getState();
    const j = s.jobs.find((x) => x.id === id)!;
    const ctx = contextFor(s, j, undefined, true);
    expect(ctx.org.orgType).toBe('ngo');
    expect(ctx.org.name).toBe('Tumaini Community Trust');
    expect(ctx.job.template.key).toBe('local-concise');
  });

  it('Google preview title uses Tumaini, not Riverstone', () => {
    resetDemo('tumaini');
    update((s) => ({ ...s, signedIn: true }));
    const id = startJob('WASH Coordinator in Kisumu, Kenya', undefined, [], true);
    const s = getState();
    const j = { ...s.jobs.find((x) => x.id === id)!, facts: { ...s.jobs.find((x) => x.id === id)!.facts, title: 'WASH Coordinator', location: 'Kisumu, Kenya' } };
    const html = renderToStaticMarkup(createElement(GooglePreview, { job: j, s }));
    expect(html).toContain('WASH Coordinator – Tumaini Community Trust');
    expect(html).not.toMatch(/Riverstone/i);
  });

  it('Riverstone preset still loads house format and Riverstone org', () => {
    resetDemo('tumaini');
    resetDemo('riverstone');
    update((s) => ({ ...s, signedIn: true }));
    const s = getState();
    expect(currentPreset()).toBe('riverstone');
    expect(s.org.name).toBe('Riverstone Aid');
    expect(s.org.orgType).toBe('ingo');
    expect(s.formats.some((f) => f.key === 'house')).toBe(true);
    expect(s.jobs.length).toBeGreaterThan(0);
  });
});
