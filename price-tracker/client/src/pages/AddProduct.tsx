import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { SelectInput, TextInput } from '../components/Field';
import { Banner } from '../components/Feedback';
import { MarketplaceBadge } from '../components/Badge';
import { productApi } from '../services/endpoints';
import { ApiError, fieldErrors } from '../services/api';
import { useToast } from '../hooks/useToast';
import { AlertRuleFields } from '../components/AlertRuleFields';
import { useAuth } from '../hooks/useAuth';
import { CHANNEL_OPTIONS, CHECK_INTERVALS, DEFAULT_ALERT_RULES, intervalLabel } from '../utils/format';
import type { AlertRuleOverrides, NotificationChannel, UrlPreview } from '../types';

const NO_OVERRIDES: AlertRuleOverrides = { dropPercent: null, allTimeLow: null, backInStock: null };

interface AddProductForm {
  productUrl: string;
  targetPrice: string;
  checkInterval: number;
  nickname: string;
  notificationChannel: '' | NotificationChannel;
  alertMode: '' | 'once' | 'always';
  comparisonGroup: string;
}

export function AddProductPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [preview, setPreview] = useState<UrlPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [alertRules, setAlertRules] = useState<AlertRuleOverrides>(NO_OVERRIDES);
  const { user } = useAuth();
  const ruleDefaults = { ...DEFAULT_ALERT_RULES, ...user?.notificationPrefs.alertRules };

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddProductForm>({
    defaultValues: {
      productUrl: '',
      targetPrice: '',
      checkInterval: 360,
      nickname: '',
      notificationChannel: '',
      alertMode: '',
      comparisonGroup: '',
    },
  });

  const url = watch('productUrl');

  /**
   * The preview endpoint only parses the URL — it never contacts the
   * marketplace — so it is safe to call as the user types.
   */
  useEffect(() => {
    const trimmed = url.trim();
    if (trimmed.length < 15) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await productApi.preview(trimmed);
        if (!cancelled) {
          setPreview(result);
          setPreviewError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(error instanceof ApiError ? error.message : 'Could not read that link');
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [url]);

  const createMutation = useMutation({
    mutationFn: productApi.create,
    onSuccess: (result) => {
      toast(result.message, 'success');
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate(`/products/${result.product.id}`);
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const target = Number.parseFloat(values.targetPrice);
    if (!Number.isFinite(target) || target <= 0) {
      setError('targetPrice', { message: 'Enter the price you want to be alerted at' });
      return;
    }

    try {
      await createMutation.mutateAsync({
        productUrl: values.productUrl.trim(),
        targetPrice: target,
        checkInterval: Number(values.checkInterval),
        nickname: values.nickname.trim() || undefined,
        notificationChannel: values.notificationChannel || undefined,
        alertMode: values.alertMode || undefined,
        // Only explicit choices are sent; "Account default" stays unset.
        alertRules: Object.fromEntries(
          Object.entries(alertRules).filter(([, value]) => value !== null),
        ),
        comparisonGroup: values.comparisonGroup.trim() || undefined,
      });
    } catch (error) {
      const fields = fieldErrors(error);
      let matched = false;
      for (const [path, message] of Object.entries(fields)) {
        if (path in values) {
          setError(path as keyof AddProductForm, { message });
          matched = true;
        }
      }
      if (!matched) {
        setFormError(error instanceof ApiError ? error.message : 'Could not start tracking.');
      }
    }
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Add a product</h1>
        <p className="mt-1 text-sm text-muted">
          Paste a product link. We work out the marketplace from the URL itself.
        </p>
      </header>

      <form onSubmit={onSubmit} className="card space-y-5 p-6" noValidate>
        {formError && (
          <p role="alert" className="rounded-xl border border-bad/30 bg-bad/5 px-3.5 py-2.5 text-sm text-bad">
            {formError}
          </p>
        )}

        <TextInput
          label="Product URL"
          type="url"
          autoFocus
          required
          placeholder="https://www.amazon.in/dp/… or https://www.flipkart.com/…/p/…"
          hint="Open the product page and copy the link from your browser's address bar."
          error={errors.productUrl?.message ?? previewError ?? undefined}
          {...register('productUrl', { required: 'Paste the product link' })}
        />

        {preview && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-good/25 bg-good/5 px-3.5 py-3">
            <MarketplaceBadge marketplace={preview.marketplace} />
            <span className="text-sm text-ink">
              Recognised product <span className="font-medium">{preview.externalProductId}</span>
            </span>
            <span className="ml-auto text-xs text-muted">
              Source: {preview.dataSource === 'official' ? 'official API' : preview.dataSource}
            </span>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput
            label="Target price"
            type="number"
            inputMode="decimal"
            min="1"
            step="1"
            required
            prefix="₹"
            hint="You are alerted when the price reaches this or lower."
            error={errors.targetPrice?.message}
            {...register('targetPrice', { required: 'Enter a target price' })}
          />

          <SelectInput
            label="Check frequency"
            hint="More frequent checks are not always better — prices move slowly."
            options={CHECK_INTERVALS.map((value) => ({ value, label: intervalLabel(value) }))}
            {...register('checkInterval', { valueAsNumber: true })}
          />
        </div>

        <TextInput
          label="Nickname"
          placeholder="e.g. AirPods for Dad"
          hint="Optional. Shown instead of the full product title."
          {...register('nickname')}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <SelectInput
            label="Notify me via"
            hint="Leave as default to use your account preference."
            options={[{ value: '', label: 'Account default' }, ...CHANNEL_OPTIONS]}
            {...register('notificationChannel')}
          />

          <SelectInput
            label="Alert me"
            options={[
              { value: '', label: 'Account default' },
              { value: 'once', label: 'Once per price drop' },
              { value: 'always', label: 'Every time it drops below target' },
            ]}
            {...register('alertMode')}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-ink">Also alert me when</legend>
          <AlertRuleFields value={alertRules} defaults={ruleDefaults} onChange={setAlertRules} />
        </fieldset>

        <TextInput
          label="Comparison group"
          placeholder="e.g. airpods-pro"
          hint="Optional. Give the same label to listings on different marketplaces to compare them side by side. We never assume two listings are the same product."
          {...register('comparisonGroup')}
        />

        <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting || createMutation.isPending}>
            Start tracking
          </Button>
        </div>
      </form>

      <Banner tone="info" title="How prices are collected">
        Pricewatch uses the marketplace's official API or a licensed data provider where one is
        configured, and otherwise reads the publicly available product page at a conservative rate.
        It never asks for your marketplace password and never tries to work around a marketplace's
        protections.
      </Banner>
    </div>
  );
}
