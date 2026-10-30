import { useTranslation } from 'react-i18next';
import type { AuthFileItem } from '@/types';
import {
  formatUsagePercent,
  formatUsageTime,
  hasUsageInfo,
  summarizeUsageWindow,
  type UsageTone,
  type UsageWindow,
} from '../usageLimit';
import styles from './AuthFileUsageSummary.module.scss';

const WINDOWS: UsageWindow[] = ['7d', '5h'];

const TONE_CLASS: Record<UsageTone, string> = {
  none: styles.toneNone,
  normal: styles.toneNormal,
  near: styles.toneNear,
  reached: styles.toneReached,
};

/** Compact "7d 82% / 70%" used/limit pills plus a Paused chip for the list card. */
export function AuthFileUsageSummary({ file }: { file: AuthFileItem }) {
  const { t, i18n } = useTranslation();
  if (!hasUsageInfo(file)) return null;
  const guard = file.usageGuard;
  const until = formatUsageTime(guard?.parkedUntil, i18n.language);

  return (
    <div className={styles.row}>
      {WINDOWS.map((window) => {
        const summary = summarizeUsageWindow(file, window);
        if (!summary) return null;
        const reset = formatUsageTime(summary.reset, i18n.language);
        const title = [
          t('auth_files.usage_limit_pill_title', {
            window,
            used: formatUsagePercent(summary.used),
            limit: formatUsagePercent(summary.limit),
          }),
          reset ? t('auth_files.usage_limit_resets', { time: reset }) : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <span key={window} className={`${styles.pill} ${TONE_CLASS[summary.tone]}`} title={title}>
            <span className={styles.window}>{window}</span>
            <span>
              {formatUsagePercent(summary.used)} / {formatUsagePercent(summary.limit)}
            </span>
          </span>
        );
      })}
      {guard?.parked && (
        <span
          className={`${styles.chip} ${guard.failOpen ? styles.chipFailOpen : ''}`}
          title={
            guard.failOpen
              ? t('auth_files.usage_limit_fail_open_detail')
              : t('auth_files.usage_limit_paused_until', { time: until || '—' })
          }
        >
          {guard.failOpen
            ? t('auth_files.usage_limit_fail_open')
            : t('auth_files.usage_limit_paused')}
        </span>
      )}
    </div>
  );
}
