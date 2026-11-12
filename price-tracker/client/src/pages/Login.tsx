import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { TextInput } from '../components/Field';
import { useAuth } from '../hooks/useAuth';
import { ApiError, fieldErrors } from '../services/api';

interface UnlockForm {
  password: string;
}

/**
 * The whole sign-in surface: one password, asked once per browser.
 *
 * There are no accounts, so there is nothing to register, no email to remember
 * and no password to reset — the operator sets `APP_ACCESS_PASSWORD` and that is
 * the only credential the app knows about.
 */
export function LoginPage() {
  const { unlock } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UnlockForm>({ defaultValues: { password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await unlock(values.password);
      const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard';
      navigate(redirectTo, { replace: true });
    } catch (error) {
      const fields = fieldErrors(error);
      if (fields.password) {
        setError('password', { message: fields.password });
      } else {
        setFormError(
          error instanceof ApiError ? error.message : 'Could not unlock. Please try again.',
        );
      }
    }
  });

  return (
    <div className="animate-fade-up">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Price Tracker</h1>
      <p className="mt-1.5 text-sm text-muted">Enter the access password to continue.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        {formError && (
          <p role="alert" className="rounded-xl border border-bad/30 bg-bad/5 px-3.5 py-2.5 text-sm text-bad">
            {formError}
          </p>
        )}

        <TextInput
          label="Access password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          error={errors.password?.message}
          {...register('password', { required: 'Enter the access password' })}
        />

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Unlock
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        This browser stays unlocked afterwards, so you should only see this once.
      </p>
    </div>
  );
}
