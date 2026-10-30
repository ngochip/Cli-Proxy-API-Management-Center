import type { AuthFileUsageGuard } from '@/types/authFile';
import { parseTimestampMs } from '@/utils/timestamp';

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readRatio = (value: unknown): number | undefined => {
  const n = readNumber(value);
  return n !== undefined && n >= 0 ? n : undefined;
};

const readTimestamp = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return Number.isFinite(parseTimestampMs(value)) ? value.trim() : undefined;
};

/** Percent limit 1..100 from the auth JSON; absent/0/invalid means no limit. */
export function normalizeUsageLimitPercent(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > 100) return undefined;
  return n;
}

/** Tolerates missing fields (older backends); returns undefined when nothing usable. */
export function normalizeUsageGuard(value: unknown): AuthFileUsageGuard | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const source = raw.limit_source;
  const window = raw.parked_window;
  const effectiveLimit7d = readRatio(raw.effective_limit_7d);
  const effectiveLimit5h = readRatio(raw.effective_limit_5h);
  const guard: AuthFileUsageGuard = {
    utilization5h: readRatio(raw.utilization_5h),
    utilization7d: readRatio(raw.utilization_7d),
    reset5h: readTimestamp(raw.reset_5h),
    reset7d: readTimestamp(raw.reset_7d),
    observedAt: readTimestamp(raw.observed_at),
    effectiveLimit7d: effectiveLimit7d ? effectiveLimit7d : undefined,
    effectiveLimit5h: effectiveLimit5h ? effectiveLimit5h : undefined,
    limitSource: source === 'auth' || source === 'config' || source === 'none' ? source : undefined,
    parked: raw.parked === true,
    parkedUntil: readTimestamp(raw.parked_until),
    parkedWindow: window === '5h' || window === '7d' ? window : undefined,
    failOpen: raw.fail_open === true,
  };
  return guard;
}
