import { SelectInput } from './Field';
import { DROP_PERCENT_CHOICES } from '../utils/format';
import type { AlertRuleOverrides, AlertRules } from '../types';

/**
 * Per-product overrides of the account's smart alert rules. Every select has an
 * "Account default" option that maps to null, so the product follows whatever
 * the account is set to now and later.
 */
export function AlertRuleFields({
  value,
  defaults,
  onChange,
}: {
  value: AlertRuleOverrides;
  defaults: AlertRules;
  onChange: (next: AlertRuleOverrides) => void;
}) {
  const onOff = (on: boolean) => (on ? 'on' : 'off');
  const toBool = (raw: string) => (raw === '' ? null : raw === 'on');
  const fromBool = (v: boolean | null) => (v === null ? '' : onOff(v));

  return (
    <div className="grid gap-5 sm:grid-cols-3">
      <SelectInput
        label="Price drops by"
        value={value.dropPercent === null ? '' : String(value.dropPercent)}
        onChange={(event) =>
          onChange({
            ...value,
            dropPercent: event.target.value === '' ? null : Number(event.target.value),
          })
        }
        options={[
          {
            value: '',
            label: `Account default (${defaults.dropPercent > 0 ? `${defaults.dropPercent}%` : 'off'})`,
          },
          { value: '0', label: 'Off' },
          ...DROP_PERCENT_CHOICES.map((percent) => ({ value: String(percent), label: `${percent}% or more` })),
        ]}
      />
      <SelectInput
        label="New lowest price"
        value={fromBool(value.allTimeLow)}
        onChange={(event) => onChange({ ...value, allTimeLow: toBool(event.target.value) })}
        options={[
          { value: '', label: `Account default (${onOff(defaults.allTimeLow)})` },
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
      />
      <SelectInput
        label="Back in stock"
        value={fromBool(value.backInStock)}
        onChange={(event) => onChange({ ...value, backInStock: toBool(event.target.value) })}
        options={[
          { value: '', label: `Account default (${onOff(defaults.backInStock)})` },
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
      />
    </div>
  );
}
