import clsx from 'clsx';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldShellProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="ml-0.5 text-bad">*</span>}
      </label>
      {children(id)}
      {error ? <p className="error-text">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  prefix?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, required, prefix, className, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id) => (
        <div className="relative">
          {prefix && (
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
              {prefix}
            </span>
          )}
          <input
            id={id}
            ref={ref}
            aria-invalid={Boolean(error)}
            className={clsx('input', prefix && 'pl-8', error && 'border-bad focus:ring-bad/25', className)}
            {...rest}
          />
        </div>
      )}
    </Field>
  );
});

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  options: Array<{ value: string | number; label: string }>;
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(function SelectInput(
  { label, hint, error, options, className, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => (
        <select id={id} ref={ref} className={clsx('input pr-8', className)} {...rest}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
});

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-brand' : 'bg-line',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  );
}
