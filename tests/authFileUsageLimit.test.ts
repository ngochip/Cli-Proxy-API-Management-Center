import { describe, expect, test } from 'bun:test';
import { normalizeAuthFilesResponse } from '../src/services/api/authFiles';
import type { AuthFilesResponse } from '../src/types/authFile';
import {
  buildUsageLimitPatch,
  formatUsagePercent,
  formatUsageWindow,
  parseUsageLimitText,
  summarizeUsageWindow,
  usageLimitDraftError,
  usageLimitErrorKey,
  usageTone,
} from '../src/features/authFiles/usageLimit';
import {
  buildAuthFileFieldsPatch,
  type PrefixProxyEditorState,
} from '../src/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';

const normalize = (files: Array<Record<string, unknown>>) =>
  normalizeAuthFilesResponse({ files } as unknown as AuthFilesResponse).files;

describe('usage limit normalization', () => {
  test('reads limits and the usage guard', () => {
    const [file] = normalize([
      {
        name: 'a.json',
        usage_limit_7d: 70,
        usage_limit_5h: 90,
        usage_guard: {
          utilization_5h: 0.38,
          utilization_7d: 0.9,
          reset_7d: '2026-11-05T04:00:00+08:00',
          effective_limit_7d: 0.7,
          effective_limit_5h: 0,
          limit_source: 'auth',
          parked: true,
          parked_until: '2026-11-05T04:00:00+08:00',
          parked_window: '7d',
          fail_open: true,
        },
      },
    ]);
    expect(file.usageLimit7d).toBe(70);
    expect(file.usageLimit5h).toBe(90);
    expect(file.usageGuard).toMatchObject({
      utilization5h: 0.38,
      utilization7d: 0.9,
      effectiveLimit7d: 0.7,
      effectiveLimit5h: undefined,
      limitSource: 'auth',
      parked: true,
      parkedWindow: '7d',
      failOpen: true,
      parkedUntil: '2026-11-05T04:00:00+08:00',
    });
  });

  test('tolerates older backends and invalid values', () => {
    const [old, bad] = normalize([
      { name: 'old.json' },
      { name: 'bad.json', usage_limit_7d: 0, usage_limit_5h: 150, usage_guard: 'x' },
    ]);
    for (const file of [old, bad]) {
      expect(file.usageLimit7d).toBeUndefined();
      expect(file.usageLimit5h).toBeUndefined();
      expect(file.usageGuard).toBeUndefined();
    }
  });

  test('guard with missing fields defaults to not parked', () => {
    const [file] = normalize([{ name: 'a.json', usage_guard: { utilization_7d: 0.1 } }]);
    expect(file.usageGuard?.parked).toBe(false);
    expect(file.usageGuard?.failOpen).toBe(false);
  });
});

describe('usage limit formatting', () => {
  test('formats percent and handles null', () => {
    expect(formatUsagePercent(0.824)).toBe('82%');
    expect(formatUsagePercent(1)).toBe('100%');
    expect(formatUsagePercent(undefined)).toBe('—');
    expect(formatUsagePercent(null)).toBe('—');
    expect(formatUsagePercent(Number.NaN)).toBe('—');
  });

  test('tone by used/limit ratio', () => {
    expect(usageTone(0.5, 0.7)).toBe('normal');
    expect(usageTone(0.63, 0.7)).toBe('near');
    expect(usageTone(0.7, 0.7)).toBe('reached');
    expect(usageTone(0.9, 0.7)).toBe('reached');
    expect(usageTone(0.9, undefined)).toBe('none');
    expect(usageTone(0.9, 0)).toBe('none');
    expect(usageTone(undefined, 0.7)).toBe('normal');
  });

  test('window summary prefers effective limit, falls back to field, hides when empty', () => {
    const guard = { parked: false, failOpen: false, utilization7d: 0.82, effectiveLimit7d: 0.7 };
    const s = summarizeUsageWindow({ usageGuard: guard }, '7d')!;
    expect(formatUsageWindow(s)).toBe('7d 82% / 70%');
    expect(s.tone).toBe('reached');
    expect(formatUsageWindow(summarizeUsageWindow({ usageLimit5h: 90 }, '5h')!)).toBe('5h — / 90%');
    expect(formatUsageWindow(summarizeUsageWindow({ usageGuard: { ...guard } }, '7d')!)).toBe(
      '7d 82% / 70%'
    );
    expect(
      formatUsageWindow(
        summarizeUsageWindow(
          { usageGuard: { parked: false, failOpen: false, utilization5h: 0.2 } },
          '5h'
        )!
      )
    ).toBe('5h 20% / —');
    expect(summarizeUsageWindow({}, '7d')).toBeNull();
  });
});

describe('usage limit editing', () => {
  test('parses and validates percent input', () => {
    expect(parseUsageLimitText(' 70 ')).toBe(70);
    for (const bad of ['', '0', '101', '1.5', '-3', 'abc']) {
      expect(parseUsageLimitText(bad)).toBeNull();
    }
    expect(usageLimitErrorKey(false, '')).toBeNull();
    expect(usageLimitErrorKey(true, '')).toBe('auth_files.usage_limit_invalid');
    expect(
      usageLimitDraftError({
        usageLimitTouched: true,
        usageLimit7dEnabled: true,
        usageLimit7d: '0',
      })
    ).toBe(true);
    expect(usageLimitDraftError({ usageLimit7dEnabled: true, usageLimit7d: '0' })).toBe(false);
  });

  test('patch sets, clears with null, and skips unchanged', () => {
    const original = { usage_limit_7d: 70 };
    expect(buildUsageLimitPatch(original, {})).toEqual({});
    expect(
      buildUsageLimitPatch(original, {
        usageLimitTouched: true,
        usageLimit7dEnabled: true,
        usageLimit7d: '70',
        usageLimit5hEnabled: true,
        usageLimit5h: '90',
      })
    ).toEqual({ usage_limit_5h: 90 });
    expect(
      buildUsageLimitPatch(original, {
        usageLimitTouched: true,
        usageLimit7dEnabled: false,
        usageLimit7d: '70',
        usageLimit5hEnabled: false,
      })
    ).toEqual({ usage_limit_7d: null });
  });

  test('field patch integrates usage limits', () => {
    const json = { usage_limit_5h: 50 };
    const editor = {
      fileName: 'a.json',
      json,
      providerKey: 'claude',
      prefix: '',
      proxyUrl: '',
      priority: '',
      weight: '',
      usageLimit7dEnabled: true,
      usageLimit7d: '65',
      usageLimit5hEnabled: false,
      usageLimit5h: '50',
      usageLimitTouched: true,
    } as unknown as PrefixProxyEditorState;
    expect(buildAuthFileFieldsPatch(editor, (key) => key)).toEqual({
      usage_limit_7d: 65,
      usage_limit_5h: null,
    });
  });
});
