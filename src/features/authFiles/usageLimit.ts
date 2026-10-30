import type { AuthFileItem } from '@/types/authFile';
import { formatDateTimeValue } from '@/utils/format';

export type UsageWindow = '7d' | '5h';
export type UsageTone = 'none' | 'normal' | 'near' | 'reached';

/** A utilization at or above this share of the limit is "near". */
export const USAGE_NEAR_RATIO = 0.9;

export type UsageLimitErrorKey = 'auth_files.usage_limit_invalid';

/** Ratio (0..1) to a whole percent string, e.g. 0.824 -> "82%". Missing -> "—". */
export function formatUsagePercent(ratio: number | null | undefined): string {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0) return '—';
  return `${Math.round(ratio * 100)}%`;
}

/** Colour tone by used/limit ratio (both 0..1). No limit or no data -> "none". */
export function usageTone(
  used: number | null | undefined,
  limit: number | null | undefined
): UsageTone {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return 'none';
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0) return 'normal';
  const ratio = used / limit;
  if (ratio >= 1) return 'reached';
  if (ratio >= USAGE_NEAR_RATIO) return 'near';
  return 'normal';
}

export type UsageWindowSummary = {
  window: UsageWindow;
  used?: number;
  limit?: number;
  tone: UsageTone;
  reset?: string;
};

/**
 * Per-window summary for the list card. Limit prefers the backend's effective
 * limit and falls back to the auth-file field (percent). Returns null when
 * there is neither utilization nor a limit for the window.
 */
export function summarizeUsageWindow(
  file: Pick<AuthFileItem, 'usageGuard' | 'usageLimit7d' | 'usageLimit5h'>,
  window: UsageWindow
): UsageWindowSummary | null {
  const guard = file.usageGuard;
  const used = window === '7d' ? guard?.utilization7d : guard?.utilization5h;
  const effective = window === '7d' ? guard?.effectiveLimit7d : guard?.effectiveLimit5h;
  const field = window === '7d' ? file.usageLimit7d : file.usageLimit5h;
  const limit = effective && effective > 0 ? effective : field ? field / 100 : undefined;
  if (used === undefined && limit === undefined) return null;
  return {
    window,
    used,
    limit,
    tone: usageTone(used, limit),
    reset: window === '7d' ? guard?.reset7d : guard?.reset5h,
  };
}

/** "7d 82% / 70%" text for a window summary. */
export function formatUsageWindow(summary: UsageWindowSummary): string {
  return `${summary.window} ${formatUsagePercent(summary.used)} / ${formatUsagePercent(summary.limit)}`;
}

/** Whether the list card has anything to show. */
export function hasUsageInfo(file: AuthFileItem): boolean {
  return (
    summarizeUsageWindow(file, '7d') !== null ||
    summarizeUsageWindow(file, '5h') !== null ||
    Boolean(file.usageGuard?.parked)
  );
}

export function formatUsageTime(value: string | undefined, locale?: string): string {
  return value ? formatDateTimeValue(value, locale) : '';
}

/** Parse the percent input: empty/invalid -> null. Accepts whole numbers 1..100. */
export function parseUsageLimitText(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= 100 ? n : null;
}

export function usageLimitErrorKey(enabled: boolean, text: string): UsageLimitErrorKey | null {
  if (!enabled) return null;
  return parseUsageLimitText(text) === null ? 'auth_files.usage_limit_invalid' : null;
}

/** Percent from stored JSON (number, 1..100), else undefined. */
export function readUsageLimit(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 100
    ? value
    : undefined;
}

export type UsageLimitDraft = {
  usageLimit7dEnabled?: boolean;
  usageLimit7d?: string;
  usageLimit5hEnabled?: boolean;
  usageLimit5h?: string;
  usageLimitTouched?: boolean;
};

export function usageLimitDraftError(draft: UsageLimitDraft | null | undefined): boolean {
  if (!draft?.usageLimitTouched) return false;
  return (
    usageLimitErrorKey(draft.usageLimit7dEnabled === true, draft.usageLimit7d ?? '') !== null ||
    usageLimitErrorKey(draft.usageLimit5hEnabled === true, draft.usageLimit5h ?? '') !== null
  );
}

/** Patch entries for the touched draft versus the stored JSON; null = remove. */
export function buildUsageLimitPatch(
  original: Record<string, unknown>,
  draft: UsageLimitDraft
): { usage_limit_7d?: number | null; usage_limit_5h?: number | null } {
  const patch: { usage_limit_7d?: number | null; usage_limit_5h?: number | null } = {};
  if (!draft.usageLimitTouched) return patch;
  const apply = (
    key: 'usage_limit_7d' | 'usage_limit_5h',
    enabled: boolean | undefined,
    text: string | undefined
  ) => {
    const before = readUsageLimit(original[key]);
    if (!enabled) {
      if (before !== undefined) patch[key] = null;
      return;
    }
    const next = parseUsageLimitText(text ?? '');
    if (next !== null && next !== before) patch[key] = next;
  };
  apply('usage_limit_7d', draft.usageLimit7dEnabled, draft.usageLimit7d);
  apply('usage_limit_5h', draft.usageLimit5hEnabled, draft.usageLimit5h);
  return patch;
}
