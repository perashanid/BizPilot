'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/use-toast';
import { MODULES, type Business, type ModuleKey, type PublicUser, type TaxRateSetting } from '@/lib/types';

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

const CURRENCIES = ['USD', 'EUR', 'GBP', 'BDT', 'INR', 'AUD', 'CAD'];
const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Singapore',
];

interface NotificationPrefs {
  lowStock: boolean;
  overdueInvoices: boolean;
  dailyDigest: boolean;
}
const NOTIF_KEY = 'sme-copilot:notification-prefs';

export default function SettingsPage() {
  const { toast } = useToast();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      setUser(data.user);
      setBusiness(data.business);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const isOwner = user?.role === 'owner';

  async function saveBusiness(patch: Partial<Business>, successMessage = 'Settings saved.') {
    try {
      const res = await fetch('/api/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to save settings.');
      setBusiness(data);
      toast({ title: successMessage });
    } catch (err) {
      toast({ title: 'Could not save', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !business || !user) {
    return (
      <div className="p-6">
        <ErrorState message="Couldn't load settings." onRetry={load} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your business profile, tax rates, invoicing, and preferences.</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="profile">Business profile</TabsTrigger>
          <TabsTrigger value="users">Users &amp; roles</TabsTrigger>
          <TabsTrigger value="tax">Tax rates</TabsTrigger>
          <TabsTrigger value="invoicing">Invoicing</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <BusinessProfileTab business={business} isOwner={isOwner} onSave={saveBusiness} />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab user={user} />
        </TabsContent>
        <TabsContent value="tax" className="mt-4">
          <TaxRatesTab business={business} isOwner={isOwner} onSave={saveBusiness} />
        </TabsContent>
        <TabsContent value="invoicing" className="mt-4">
          <InvoicingTab business={business} isOwner={isOwner} onSave={saveBusiness} />
        </TabsContent>
        <TabsContent value="modules" className="mt-4">
          <ModulesTab business={business} isOwner={isOwner} onSave={saveBusiness} />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="billing" className="mt-4">
          <BillingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReadOnlyNotice() {
  return (
    <p className="text-xs text-muted-foreground">
      Only the business owner can change these settings. You have read-only access.
    </p>
  );
}

function BusinessProfileTab({
  business,
  isOwner,
  onSave,
}: {
  business: Business;
  isOwner: boolean;
  onSave: (patch: Partial<Business>, msg?: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: business.name,
    legalName: business.legalName ?? '',
    industry: business.industry ?? '',
    address: business.address ?? '',
    currency: business.currency,
    timezone: business.timezone,
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    await onSave({
      name: form.name.trim(),
      legalName: form.legalName.trim() || undefined,
      industry: form.industry.trim() || undefined,
      address: form.address.trim() || undefined,
      currency: form.currency,
      timezone: form.timezone,
    });
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business profile</CardTitle>
        <CardDescription>Your business's identity, currency, and timezone.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="biz-name">Business name</Label>
          <Input id="biz-name" value={form.name} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="biz-legal">Legal name</Label>
          <Input id="biz-legal" value={form.legalName} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="biz-industry">Industry</Label>
          <Input id="biz-industry" value={form.industry} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Select value={form.currency} disabled={!isOwner} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
            <SelectTrigger>
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
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <Select value={form.timezone} disabled={!isOwner} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="biz-address">Address</Label>
          <Textarea id="biz-address" rows={2} value={form.address} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        {isOwner ? <div /> : <ReadOnlyNotice />}
        {isOwner && (
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function UsersTab({ user }: { user: PublicUser }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Users &amp; roles</CardTitle>
        <CardDescription>
          Full team management (inviting teammates, changing roles) is out of scope for this build pass — there is no
          team-listing API yet. This shows your own account only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-medium text-foreground">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Badge variant="secondary" className="capitalize">
            {user.role}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function TaxRatesTab({
  business,
  isOwner,
  onSave,
}: {
  business: Business;
  isOwner: boolean;
  onSave: (patch: Partial<Business>, msg?: string) => Promise<void>;
}) {
  const [rates, setRates] = useState<TaxRateSetting[]>(business.taxSettings.rates);
  const [pricesIncludeTax, setPricesIncludeTax] = useState(business.taxSettings.pricesIncludeTax);
  const [saving, setSaving] = useState(false);

  function updateRate(i: number, patch: Partial<TaxRateSetting>) {
    setRates((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRate() {
    setRates((rs) => [...rs, { name: 'New rate', rate: 0, isDefault: rs.length === 0 }]);
  }
  function removeRate(i: number) {
    setRates((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function handleSubmit() {
    setSaving(true);
    await onSave({ taxSettings: { rates, pricesIncludeTax } });
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax rates</CardTitle>
        <CardDescription>Rates applied on sales, invoices, and product pricing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tax rates configured yet.</p>
        ) : (
          <div className="space-y-2">
            {rates.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                <Input
                  className="w-40"
                  value={r.name}
                  disabled={!isOwner}
                  onChange={(e) => updateRate(i, { name: e.target.value })}
                  placeholder="Name"
                />
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    className="w-24 tabular-nums"
                    value={r.rate}
                    disabled={!isOwner}
                    onChange={(e) => updateRate(i, { rate: Number(e.target.value) })}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Checkbox checked={r.isDefault} disabled={!isOwner} onCheckedChange={(v) => updateRate(i, { isDefault: !!v })} />
                  Default
                </label>
                {isOwner && (
                  <Button variant="ghost" size="icon" className="ml-auto" onClick={() => removeRate(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {isOwner && (
          <Button variant="outline" size="sm" onClick={addRate}>
            <Plus className="mr-1.5 h-4 w-4" /> Add rate
          </Button>
        )}
        <label className="flex items-center gap-2 pt-2 text-sm text-foreground">
          <Switch checked={pricesIncludeTax} disabled={!isOwner} onCheckedChange={setPricesIncludeTax} />
          Prices include tax
        </label>
      </CardContent>
      <CardFooter className="justify-between">
        {isOwner ? <div /> : <ReadOnlyNotice />}
        {isOwner && (
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function InvoicingTab({
  business,
  isOwner,
  onSave,
}: {
  business: Business;
  isOwner: boolean;
  onSave: (patch: Partial<Business>, msg?: string) => Promise<void>;
}) {
  const [prefix, setPrefix] = useState(business.invoiceSettings.prefix);
  const [nextNumber, setNextNumber] = useState(business.invoiceSettings.nextNumber);
  const [terms, setTerms] = useState(business.invoiceSettings.terms ?? '');
  const [footer, setFooter] = useState(business.invoiceSettings.footer ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    await onSave({
      invoiceSettings: { prefix: prefix.trim() || 'INV-', nextNumber, terms: terms.trim() || undefined, footer: footer.trim() || undefined },
    });
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice settings</CardTitle>
        <CardDescription>Numbering and default terms for new invoices.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inv-prefix">Number prefix</Label>
          <Input id="inv-prefix" value={prefix} disabled={!isOwner} onChange={(e) => setPrefix(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-next">Next number</Label>
          <Input
            id="inv-next"
            type="number"
            className="tabular-nums"
            value={nextNumber}
            disabled={!isOwner}
            onChange={(e) => setNextNumber(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="inv-terms">Default terms</Label>
          <Textarea id="inv-terms" rows={2} value={terms} disabled={!isOwner} onChange={(e) => setTerms(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="inv-footer">Footer note</Label>
          <Textarea id="inv-footer" rows={2} value={footer} disabled={!isOwner} onChange={(e) => setFooter(e.target.value)} />
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        {isOwner ? <div /> : <ReadOnlyNotice />}
        {isOwner && (
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function ModulesTab({
  business,
  isOwner,
  onSave,
}: {
  business: Business;
  isOwner: boolean;
  onSave: (patch: Partial<Business>, msg?: string) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState<ModuleKey[]>(business.enabledModules);
  const [saving, setSaving] = useState(false);

  function toggle(m: ModuleKey, checked: boolean) {
    setEnabled((cur) => (checked ? [...new Set([...cur, m])] : cur.filter((x) => x !== m)));
  }

  async function handleSubmit() {
    setSaving(true);
    await onSave({ enabledModules: enabled }, 'Modules updated. The sidebar reflects this on next navigation.');
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modules</CardTitle>
        <CardDescription>Turn modules on or off. Disabled modules hide from the sidebar.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {MODULES.map((m) => (
          <label key={m} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm text-foreground">
            <Checkbox checked={enabled.includes(m)} disabled={!isOwner} onCheckedChange={(v) => toggle(m, !!v)} />
            {MODULE_LABELS[m]}
          </label>
        ))}
      </CardContent>
      <CardFooter className="justify-between">
        {isOwner ? <div /> : <ReadOnlyNotice />}
        {isOwner && (
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function NotificationsTab() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs>({ lowStock: true, overdueInvoices: true, dailyDigest: false });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_KEY);
      if (raw) setPrefs(JSON.parse(raw));
    } catch {
      // ignore — defaults stand
    }
  }, []);

  function update(patch: Partial<NotificationPrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
      toast({ title: 'Preference saved on this device.' });
    } catch {
      // localStorage unavailable (private browsing, etc.) — the UI still reflects the choice
      // for this session even though it won't persist across reloads.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification preferences</CardTitle>
        <CardDescription>
          Stored on this device only (there's no backend field for this yet) — they won't follow you to another browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center justify-between rounded-lg border border-border p-3">
          <span className="text-sm text-foreground">Low-stock alerts</span>
          <Switch checked={prefs.lowStock} onCheckedChange={(v) => update({ lowStock: v })} />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-border p-3">
          <span className="text-sm text-foreground">Overdue invoice alerts</span>
          <Switch checked={prefs.overdueInvoices} onCheckedChange={(v) => update({ overdueInvoices: v })} />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-border p-3">
          <span className="text-sm text-foreground">Daily digest email</span>
          <Switch checked={prefs.dailyDigest} onCheckedChange={(v) => update({ dailyDigest: v })} />
        </label>
      </CardContent>
    </Card>
  );
}

function BillingTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>Plan and payment management.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-foreground">Billing management coming soon</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This build doesn't include a payment processor integration (e.g. Stripe). SME Copilot is currently free to use.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
