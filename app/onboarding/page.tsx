'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, X as XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MODULES, type ModuleKey } from '@/lib/types';

const STEPS = ['Business profile', 'What you sell', 'Modules'] as const;

const INDUSTRIES = [
  'Retail',
  'Restaurant / Food service',
  'Wholesale / Distribution',
  'Manufacturing',
  'Professional services',
  'Construction',
  'Healthcare',
  'Technology',
  'Other',
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'BDT', 'INR'];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Singapore',
];

const MODULE_LABELS: Record<ModuleKey, string> = {
  sales: 'Sales',
  inventory: 'Inventory',
  purchases: 'Purchases',
  expenses: 'Expenses',
  invoices: 'Invoices',
  employees: 'Employees',
  tasks: 'Tasks',
  copilot: 'Copilot',
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — business profile
  const [industry, setIndustry] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [timezone, setTimezone] = useState('UTC');
  const [address, setAddress] = useState('');

  // Step 2 — product categories. This is a UX moment only: the Business type has no field to
  // store product categories, so nothing collected on this step is persisted anywhere.
  const [categoryDraft, setCategoryDraft] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  // Step 3 — modules, all enabled by default
  const [enabledModules, setEnabledModules] = useState<ModuleKey[]>([...MODULES]);

  function addCategory(e: FormEvent) {
    e.preventDefault();
    const value = categoryDraft.trim();
    setCategoryDraft('');
    if (!value || categories.includes(value)) return;
    setCategories((prev) => [...prev, value]);
  }

  function removeCategory(value: string) {
    setCategories((prev) => prev.filter((c) => c !== value));
  }

  function toggleModule(key: ModuleKey, checked: boolean) {
    setEnabledModules((prev) => (checked ? [...new Set([...prev, key])] : prev.filter((m) => m !== key)));
  }

  async function handleFinish() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry: industry || undefined,
          currency,
          timezone,
          address: address || undefined,
          enabledModules,
          onboardingComplete: true,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error?.message ?? 'Could not save your settings. Please try again.');
      }
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <span className="font-display text-2xl font-semibold text-primary">BizPilot</span>
      </div>

      <div className="mb-6 space-y-2">
        <Progress value={progress} />
        <div className="flex justify-between text-xs text-muted-foreground">
          {STEPS.map((label, i) => (
            <span key={label} className={i === step ? 'font-medium text-foreground' : undefined}>
              {i + 1}. {label}
            </span>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>
            {step === 0 && 'Tell us a bit about your business.'}
            {step === 1 && 'What kinds of products or services do you sell? (optional)'}
            {step === 2 && 'Choose which modules to enable — you can change this later in Settings.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {step === 0 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger id="industry">
                    <SelectValue placeholder="Select an industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Business address</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <form onSubmit={addCategory} className="flex gap-2">
                <Input
                  value={categoryDraft}
                  onChange={(e) => setCategoryDraft(e.target.value)}
                  placeholder="e.g. Beverages"
                  aria-label="Product category"
                />
                <Button type="submit" variant="secondary">
                  Add
                </Button>
              </form>
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No categories added yet — this is just to help you think it through, nothing here is saved.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <Badge key={c} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1">
                      {c}
                      <button
                        type="button"
                        onClick={() => removeCategory(c)}
                        className="ml-1 rounded-full p-0.5 hover:bg-background/50"
                        aria-label={`Remove ${c}`}
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              {MODULES.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:bg-accent/50"
                >
                  <Checkbox
                    checked={enabledModules.includes(key)}
                    onCheckedChange={(checked) => toggleModule(key, checked === true)}
                  />
                  <span className="text-sm font-medium">{MODULE_LABELS[key]}</span>
                </label>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>Continue</Button>
        ) : (
          <Button onClick={handleFinish} disabled={submitting}>
            {submitting ? (
              'Saving...'
            ) : (
              <>
                <Check className="h-4 w-4" />
                Finish
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
