import { NextRequest } from 'next/server';
import { z } from 'zod';

import { requireSession, requireRole } from '@/lib/auth';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { updateBusinessSettings } from '@/lib/business';
import { MODULES, zTaxRate, type Business } from '@/lib/types';

export const runtime = 'nodejs';

// Started as the minimal PATCH the onboarding wizard needed (currency/timezone/address/
// enabledModules + onboardingComplete); grown additively to cover the Settings page's
// business-profile, tax-rate, and invoice-numbering tabs too. Keep it additive.
const zBusinessPatch = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  legalName: z.string().trim().max(200).optional(),
  industry: z.string().trim().max(100).optional(),
  currency: z.string().trim().length(3).optional(),
  timezone: z.string().trim().min(1).optional(),
  address: z.string().trim().max(500).optional(),
  enabledModules: z.array(z.enum(MODULES)).optional(),
  onboardingComplete: z.boolean().optional(),
  allowBackorders: z.boolean().optional(),
  taxSettings: z.object({ rates: z.array(zTaxRate), pricesIncludeTax: z.boolean() }).optional(),
  invoiceSettings: z
    .object({
      prefix: z.string().trim().min(1).max(20),
      nextNumber: z.number().int().min(1),
      terms: z.string().trim().max(2000).optional(),
      footer: z.string().trim().max(2000).optional(),
    })
    .optional(),
});

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  requireRole(session, ['owner']);
  const { currency, ...rest } = await parseJson(req, zBusinessPatch);

  const patch: Partial<Business> = { ...rest };
  if (currency) patch.currency = currency.toUpperCase();

  const business = await updateBusinessSettings(session.businessId, patch);
  return ok(business);
});
