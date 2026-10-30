import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { AuthFileUsageGuard } from '@/types/authFile';
import type {
  PrefixProxyEditorField,
  PrefixProxyEditorFieldValue,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import {
  formatUsagePercent,
  formatUsageTime,
  usageLimitErrorKey,
  type UsageWindow,
} from '../usageLimit';
import styles from './AuthFileUsageLimitFields.module.scss';

export type AuthFileUsageLimitFieldsProps = {
  disabled: boolean;
  guard?: AuthFileUsageGuard;
  values: {
    usageLimit7dEnabled?: boolean;
    usageLimit7d?: string;
    usageLimit5hEnabled?: boolean;
    usageLimit5h?: string;
  };
  onChange: (field: PrefixProxyEditorField, value: PrefixProxyEditorFieldValue) => void;
};

const WINDOWS: UsageWindow[] = ['7d', '5h'];

/** Per-account max usage % for the 7d and 5h rate-limit windows. */
export function AuthFileUsageLimitFields({
  disabled,
  guard,
  values,
  onChange,
}: AuthFileUsageLimitFieldsProps) {
  const { t, i18n } = useTranslation();
  const parkedUntil = formatUsageTime(guard?.parkedUntil, i18n.language);

  return (
    <div className={`form-group ${styles.section}`}>
      <label>{t('auth_files.usage_limit_title')}</label>
      <div className="hint">{t('auth_files.usage_limit_hint')}</div>
      {guard?.parked && (
        <div
          className={`${styles.parked} ${guard.failOpen ? styles.parkedFailOpen : ''}`}
          role="status"
        >
          {guard.failOpen
            ? t('auth_files.usage_limit_fail_open_detail')
            : t('auth_files.usage_limit_paused_until', { time: parkedUntil || '—' })}
        </div>
      )}
      {WINDOWS.map((window) => {
        const enabledKey = window === '7d' ? 'usageLimit7dEnabled' : 'usageLimit5hEnabled';
        const valueKey = window === '7d' ? 'usageLimit7d' : 'usageLimit5h';
        const enabled = values[enabledKey] === true;
        const text = values[valueKey] ?? '';
        const errorKey = usageLimitErrorKey(enabled, text);
        const used = window === '7d' ? guard?.utilization7d : guard?.utilization5h;
        const reset = formatUsageTime(
          window === '7d' ? guard?.reset7d : guard?.reset5h,
          i18n.language
        );
        const label = t(`auth_files.usage_limit_window_${window}`);
        return (
          <div className={styles.row} key={window}>
            <div className={styles.rowHead}>
              <span className={styles.windowLabel}>{label}</span>
              <ToggleSwitch
                checked={enabled}
                onChange={(value) => onChange(enabledKey, value)}
                disabled={disabled}
                ariaLabel={t('auth_files.usage_limit_toggle', { window: label })}
              />
            </div>
            {enabled && (
              <Input
                label={t('auth_files.usage_limit_percent_label')}
                type="number"
                min={1}
                max={100}
                step={1}
                value={text}
                disabled={disabled}
                error={errorKey ? t(errorKey) : undefined}
                onChange={(event) => onChange(valueKey, event.target.value)}
              />
            )}
            {used !== undefined && (
              <div className={styles.used}>
                {reset
                  ? t('auth_files.usage_limit_used_resets', {
                      window,
                      percent: formatUsagePercent(used),
                      time: reset,
                    })
                  : t('auth_files.usage_limit_used', {
                      window,
                      percent: formatUsagePercent(used),
                    })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
