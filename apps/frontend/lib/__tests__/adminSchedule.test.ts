import {
  LEGACY_DEFAULT_FREQ_DAYS,
  MAX_CUSTOM_FREQ_DAYS,
  crawlFrequencyPayload,
  defaultFreqDays,
  formatInterval,
  resolveEffectiveSchedule,
  scheduleModeFromStored,
  usesOrgTypeDefault,
} from '@/lib/admin/schedule';

describe('admin effective crawl schedule helpers', () => {
  test('usesOrgTypeDefault matches orchestrator.py rules', () => {
    expect(usesOrgTypeDefault(null)).toBe(true);
    expect(usesOrgTypeDefault(undefined)).toBe(true);
    expect(usesOrgTypeDefault(0)).toBe(true);
    expect(usesOrgTypeDefault(-2)).toBe(true);
    expect(usesOrgTypeDefault(3)).toBe(true);
    expect(usesOrgTypeDefault(Number.NaN)).toBe(true);
    expect(usesOrgTypeDefault(1)).toBe(false);
    expect(usesOrgTypeDefault(2)).toBe(false);
    expect(usesOrgTypeDefault(5)).toBe(false);
  });

  test('defaultFreqDays mirrors DEFAULT_FREQ_DAYS case-insensitively', () => {
    expect(defaultFreqDays('un')).toBe(0.5);
    expect(defaultFreqDays(' UN ')).toBe(0.5);
    expect(defaultFreqDays('ingo')).toBe(0.5);
    expect(defaultFreqDays('INGO')).toBe(0.5);
    expect(defaultFreqDays('ngo')).toBe(1);
    expect(defaultFreqDays('private')).toBe(5);
    expect(defaultFreqDays('academic')).toBe(7);
    expect(defaultFreqDays('')).toBe(1);
    expect(defaultFreqDays(null)).toBe(1);
    expect(defaultFreqDays(undefined)).toBe(1);
    expect(defaultFreqDays('foundation')).toBe(1);
    // Prototype-key safety for free-text org_type input
    expect(defaultFreqDays('constructor')).toBe(1);
    expect(defaultFreqDays('toString')).toBe(1);
  });

  test('formatInterval handles sub-day, singular day, and multi-day intervals', () => {
    expect(formatInterval(0.5)).toBe('Every 12 hours');
    expect(formatInterval(1 / 24)).toBe('Every 1 hour');
    expect(formatInterval(1)).toBe('Every 1 day');
    expect(formatInterval(2)).toBe('Every 2 days');
    expect(formatInterval(7)).toBe('Every 7 days');
  });

  test('resolveEffectiveSchedule reflects real base schedule for legacy 3, null, and custom overrides', () => {
    expect(resolveEffectiveSchedule(3, 'un')).toEqual({
      days: 0.5,
      isDefault: true,
      orgTypeKey: 'un',
      intervalLabel: 'Every 12 hours',
      summaryLabel: 'Every 12 hours (UN default)',
    });

    expect(resolveEffectiveSchedule(3, 'INGO')).toEqual({
      days: 0.5,
      isDefault: true,
      orgTypeKey: 'ingo',
      intervalLabel: 'Every 12 hours',
      summaryLabel: 'Every 12 hours (INGO default)',
    });

    expect(resolveEffectiveSchedule(null, 'ngo')).toEqual({
      days: 1,
      isDefault: true,
      orgTypeKey: 'ngo',
      intervalLabel: 'Every 1 day',
      summaryLabel: 'Every 1 day (NGO default)',
    });

    expect(resolveEffectiveSchedule(0, 'private')).toEqual({
      days: 5,
      isDefault: true,
      orgTypeKey: 'private',
      intervalLabel: 'Every 5 days',
      summaryLabel: 'Every 5 days (Private default)',
    });

    expect(resolveEffectiveSchedule(3, 'academic')).toEqual({
      days: 7,
      isDefault: true,
      orgTypeKey: 'academic',
      intervalLabel: 'Every 7 days',
      summaryLabel: 'Every 7 days (Academic default)',
    });

    expect(resolveEffectiveSchedule(3, null)).toEqual({
      days: 1,
      isDefault: true,
      orgTypeKey: null,
      intervalLabel: 'Every 1 day',
      summaryLabel: 'Every 1 day (default)',
    });

    expect(resolveEffectiveSchedule(2, 'un')).toEqual({
      days: 2,
      isDefault: false,
      orgTypeKey: 'un',
      intervalLabel: 'Every 2 days',
      summaryLabel: 'Every 2 days (custom)',
    });

    expect(resolveEffectiveSchedule(3, 'constructor')).toEqual({
      days: 1,
      isDefault: true,
      orgTypeKey: null,
      intervalLabel: 'Every 1 day',
      summaryLabel: 'Every 1 day (default)',
    });
  });

  test('scheduleModeFromStored maps stored DB and imported values safely to Auto or Custom', () => {
    expect(scheduleModeFromStored(3)).toEqual({ mode: 'auto', customDays: '' });
    expect(scheduleModeFromStored(null)).toEqual({ mode: 'auto', customDays: '' });
    expect(scheduleModeFromStored(0)).toEqual({ mode: 'auto', customDays: '' });
    expect(scheduleModeFromStored(0.5)).toEqual({ mode: 'auto', customDays: '' });
    expect(scheduleModeFromStored(3.5)).toEqual({ mode: 'auto', customDays: '' });
    expect(scheduleModeFromStored('abc')).toEqual({ mode: 'auto', customDays: '' });
    expect(scheduleModeFromStored(1)).toEqual({ mode: 'custom', customDays: '1' });
    expect(scheduleModeFromStored(4)).toEqual({ mode: 'custom', customDays: '4' });
  });

  test('crawlFrequencyPayload sends legacy sentinel 3 for Auto and validates Custom strictly', () => {
    expect(crawlFrequencyPayload('auto', '')).toEqual({
      ok: true,
      value: LEGACY_DEFAULT_FREQ_DAYS,
    });
    expect(crawlFrequencyPayload('auto', '99')).toEqual({
      ok: true,
      value: LEGACY_DEFAULT_FREQ_DAYS,
    });

    expect(crawlFrequencyPayload('custom', '1')).toEqual({ ok: true, value: 1 });
    expect(crawlFrequencyPayload('custom', ' 4 ')).toEqual({ ok: true, value: 4 });
    expect(crawlFrequencyPayload('custom', String(MAX_CUSTOM_FREQ_DAYS))).toEqual({
      ok: true,
      value: MAX_CUSTOM_FREQ_DAYS,
    });

    expect(crawlFrequencyPayload('custom', '').ok).toBe(false);
    expect(crawlFrequencyPayload('custom', '0').ok).toBe(false);
    expect(crawlFrequencyPayload('custom', '-1').ok).toBe(false);
    expect(crawlFrequencyPayload('custom', '2.5').ok).toBe(false);
    expect(crawlFrequencyPayload('custom', 'abc').ok).toBe(false);
    expect(crawlFrequencyPayload('custom', String(MAX_CUSTOM_FREQ_DAYS + 1)).ok).toBe(false);
    expect(crawlFrequencyPayload('custom', '9999999999').ok).toBe(false);

    const legacyCustom = crawlFrequencyPayload('custom', '3');
    expect(legacyCustom.ok).toBe(false);
    if (!legacyCustom.ok) {
      expect(legacyCustom.error).toContain('3 days is reserved');
    }
  });
});
