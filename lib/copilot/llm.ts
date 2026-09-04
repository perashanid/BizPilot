/**
 * Copilot chat LLM layer. Calls the Gemini API directly via `fetch` (no SDK dependency),
 * with a full function-calling loop, and falls back to a deterministic keyword-matched
 * answer with zero external calls when no API key is configured.
 *
 * `runCopilotChat` is implemented as an ASYNC GENERATOR (not a ReadableStream) — the route
 * handler drives it and writes chunks to its own ReadableStream.
 */
import type { ChatBlock } from '../types';
import { getBusiness } from '../business';
import type { Business } from '../types';
import {
  TOOL_DEFINITIONS,
  dispatchTool,
  getCashPosition,
  getProfitLoss,
  getOverdueInvoices,
  getTopProducts,
  getInventoryStatus,
  getExpenseBreakdown,
  type CopilotToolDefinition,
} from './tools';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TOOL_ROUNDS = 4;
const MAX_TOKENS = 2048;

export type CopilotEvent = { type: 'text'; delta: string } | { type: 'blocks'; blocks: ChatBlock[] };

export interface CopilotChatInput {
  businessId: string;
  message: string;
  history: { role: 'user' | 'assistant'; text: string }[];
}

export function isLlmConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

// ---------------------------------------------------------------------------
// Public entry point — picks the LLM path or the keyword fallback, same yielded shape.
// ---------------------------------------------------------------------------

export async function* runCopilotChat(input: CopilotChatInput): AsyncGenerator<CopilotEvent> {
  if (!isLlmConfigured()) {
    const result = await keywordFallback(input.businessId, input.message);
    if (result.text) yield { type: 'text', delta: result.text };
    yield { type: 'blocks', blocks: result.blocks };
    return;
  }
  yield* runLlmChat(input);
}

// ---------------------------------------------------------------------------
// LLM path (Gemini)
// ---------------------------------------------------------------------------

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: 'user' | 'model' | 'function';
  parts: GeminiPart[];
}

/** Converts the provider-agnostic JSON-Schema-shaped tool defs to Gemini's function-declaration shape. */
function toGeminiFunctionDeclarations(tools: CopilotToolDefinition[]) {
  const upperType = (t: string) => t.toUpperCase();
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: upperType(tool.input_schema.type),
      properties: Object.fromEntries(
        Object.entries(tool.input_schema.properties).map(([key, val]) => [
          key,
          { type: upperType(val.type), description: val.description },
        ])
      ),
      required: tool.input_schema.required,
    },
  }));
}

function buildSystemPrompt(business: Business | null): string {
  const name = business?.name ?? 'this business';
  const currency = business?.currency ?? 'USD';
  return (
    `You are BizPilot, an AI assistant embedded in a small-business management app for "${name}". ` +
    `Answer questions about this business using ONLY the data returned by the tools available to you — ` +
    `never invent, estimate, or guess a number. Always call a tool before answering any question that needs ` +
    `real figures (sales, inventory, invoices, cash, expenses, customers). All monetary amounts returned by ` +
    `tools are integers in the smallest currency unit (minor units, e.g. cents) in ${currency} — convert them ` +
    `to major units when you present them (e.g. 150000 minor units in USD is $1,500.00). Be concise and concrete. ` +
    `If a tool returns no data or an empty result, say so plainly instead of speculating.`
  );
}

/** Parses the raw SSE body of a Gemini streamGenerateContent response into decoded JSON chunks. */
async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, any>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        const jsonStr = dataLine.slice(5).trim();
        if (!jsonStr) continue;
        try {
          yield JSON.parse(jsonStr);
        } catch {
          // ignore malformed SSE chunk
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

interface ToolCallRecord {
  name: string;
  result: unknown;
}

async function* runLlmChat(input: CopilotChatInput): AsyncGenerator<CopilotEvent> {
  const apiKey = process.env.GEMINI_API_KEY as string;
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const business = await getBusiness(input.businessId).catch(() => null);
  const systemPrompt = buildSystemPrompt(business);
  const functionDeclarations = toGeminiFunctionDeclarations(TOOL_DEFINITIONS);

  let contents: GeminiContent[] = [
    ...input.history.map((h) => ({
      role: h.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: h.text }],
    })),
    { role: 'user', parts: [{ text: input.message }] },
  ];

  const calls: ToolCallRecord[] = [];
  let finalText = '';
  let round = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const forceFinal = round >= MAX_TOOL_ROUNDS;

    const response = await fetch(`${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: MAX_TOKENS },
        ...(forceFinal
          ? {}
          : { tools: [{ functionDeclarations }], toolConfig: { functionCallingConfig: { mode: 'AUTO' } } }),
      }),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 500)}`);
    }
    const responseBody = response.body;

    const roundText: GeminiPart[] = [];
    const functionCalls: { name: string; args: Record<string, unknown> }[] = [];

    for await (const event of sseEvents(responseBody)) {
      const parts: GeminiPart[] = event.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (typeof part.text === 'string') {
          roundText.push({ text: part.text });
          finalText += part.text;
          yield { type: 'text', delta: part.text };
        } else if (part.functionCall) {
          functionCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} });
        }
      }
    }

    if (forceFinal || functionCalls.length === 0) {
      break;
    }

    contents = [
      ...contents,
      { role: 'model', parts: [...roundText, ...functionCalls.map((fc) => ({ functionCall: fc }))] },
    ];

    const functionResponseParts: GeminiPart[] = [];
    for (const fc of functionCalls) {
      let resultPayload: unknown;
      try {
        resultPayload = await dispatchTool(fc.name, fc.args, input.businessId);
      } catch (err) {
        resultPayload = { error: err instanceof Error ? err.message : 'Tool execution failed.' };
      }
      calls.push({ name: fc.name, result: resultPayload });
      functionResponseParts.push({
        functionResponse: { name: fc.name, response: { content: resultPayload } },
      });
    }
    contents = [...contents, { role: 'function', parts: functionResponseParts }];

    round += 1;
  }

  yield { type: 'blocks', blocks: synthesizeBlocks(calls, finalText) };
}

// ---------------------------------------------------------------------------
// Block synthesis — shared by the LLM path and the keyword fallback so both surfaces
// produce the same block shapes from the same underlying tool data.
// ---------------------------------------------------------------------------

function synthesizeBlocks(calls: ToolCallRecord[], finalText: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  const byName = new Map(calls.map((c) => [c.name, c.result]));

  const cash = byName.get('getCashPosition') as Awaited<ReturnType<typeof getCashPosition>> | undefined;
  if (cash) {
    blocks.push({
      type: 'stat',
      data: {
        title: 'Cash position',
        stats: [
          { label: 'Current cash', value: cash.currentCash },
          { label: 'Projected cash', value: cash.projectedCash },
          { label: 'Avg monthly burn', value: cash.averageMonthlyBurn },
          { label: 'Runway (months)', value: cash.runwayMonths },
        ],
      },
    });
  }

  const pl = byName.get('getProfitLoss') as Awaited<ReturnType<typeof getProfitLoss>> | undefined;
  if (pl) {
    blocks.push({
      type: 'stat',
      data: {
        title: `Profit & loss (last ${pl.days} days)`,
        stats: [
          { label: 'Revenue', value: pl.current.revenue },
          { label: 'COGS', value: pl.current.cogs },
          { label: 'Expenses', value: pl.current.expenses },
          { label: 'Net profit', value: pl.current.netProfit },
          { label: 'Prior net profit', value: pl.prior.netProfit },
        ],
      },
    });
  }

  const overdue = byName.get('getOverdueInvoices') as Awaited<ReturnType<typeof getOverdueInvoices>> | undefined;
  if (overdue && overdue.length > 0) {
    blocks.push({
      type: 'table',
      data: {
        title: 'Overdue invoices',
        columns: ['Invoice', 'Customer', 'Amount due', 'Days overdue'],
        rows: overdue.map((i) => ({
          invoiceNumber: i.invoiceNumber,
          customerName: i.customerName,
          amountDue: i.amountDue,
          daysOverdue: i.daysOverdue,
        })),
      },
    });

    // Conservative: only propose the one action a tool actually supplied data for
    // (an invoiceId), and only when the model/text is clearly talking about reminders.
    if (/remind/i.test(finalText)) {
      const top = [...overdue].sort((a, b) => b.amountDue - a.amountDue)[0];
      blocks.push({
        type: 'action',
        data: {
          type: 'send_invoice_reminder',
          label: `Send reminder for ${top.invoiceNumber}`,
          payload: { invoiceId: top.invoiceId },
        },
      });
    }
  }

  const topProducts = byName.get('getTopProducts') as Awaited<ReturnType<typeof getTopProducts>> | undefined;
  if (topProducts && topProducts.length > 0) {
    blocks.push({
      type: 'table',
      data: {
        title: 'Top products',
        columns: ['Product', 'Units sold', 'Revenue'],
        rows: topProducts.map((p) => ({ name: p.name, unitsSold: p.unitsSold, revenue: p.revenue })),
      },
    });
  }

  const inventory = byName.get('getInventoryStatus') as Awaited<ReturnType<typeof getInventoryStatus>> | undefined;
  if (inventory && inventory.products.length > 0) {
    blocks.push({
      type: 'table',
      data: {
        title: 'Low / out-of-stock products',
        columns: ['Product', 'SKU', 'Available', 'Reorder point'],
        rows: inventory.products.map((p) => ({
          name: p.name,
          sku: p.sku,
          available: p.available,
          reorderPoint: p.reorderPoint,
        })),
      },
    });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Keyword fallback — zero external calls, never throws for a normal business.
// ---------------------------------------------------------------------------

export async function keywordFallback(
  businessId: string,
  message: string
): Promise<{ text: string; blocks: ChatBlock[] }> {
  const lower = message.toLowerCase();

  try {
    if (/(profit|margin)/.test(lower)) {
      const pl = await getProfitLoss(businessId, 30);
      const direction = pl.current.netProfit >= pl.prior.netProfit ? 'up' : 'down';
      const text =
        `Over the last ${pl.days} days: revenue ${pl.current.revenue}, COGS ${pl.current.cogs}, ` +
        `expenses ${pl.current.expenses}, net profit ${pl.current.netProfit} (${pl.current.netMarginPercent}% margin). ` +
        `That's ${direction} from a net profit of ${pl.prior.netProfit} in the prior ${pl.days}-day period.`;
      return { text, blocks: synthesizeBlocks([{ name: 'getProfitLoss', result: pl }], text) };
    }

    if (/(reorder|stock|inventory)/.test(lower)) {
      const inv = await getInventoryStatus(businessId);
      const text =
        inv.count === 0
          ? 'All tracked products are above their reorder point — nothing needs restocking right now.'
          : `${inv.count} product${inv.count === 1 ? ' is' : 's are'} at or below its reorder point: ` +
            inv.products
              .slice(0, 5)
              .map((p) => `${p.name} (${p.available} left, reorder point ${p.reorderPoint})`)
              .join('; ') +
            '.';
      return { text, blocks: synthesizeBlocks([{ name: 'getInventoryStatus', result: inv }], text) };
    }

    if (/(owe|overdue|unpaid)/.test(lower)) {
      const overdue = await getOverdueInvoices(businessId);
      const text =
        overdue.length === 0
          ? 'No invoices are currently overdue.'
          : `There ${overdue.length === 1 ? 'is' : 'are'} ${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'}, ` +
            `totalling ${overdue.reduce((s, i) => s + i.amountDue, 0)}. The largest: ${overdue[0].customerName} owes ` +
            `${overdue[0].amountDue} on ${overdue[0].invoiceNumber}, ${overdue[0].daysOverdue} days overdue.`;
      return { text, blocks: synthesizeBlocks([{ name: 'getOverdueInvoices', result: overdue }], text) };
    }

    if (/(afford|hire|cash)/.test(lower)) {
      const cash = await getCashPosition(businessId);
      const text =
        `Current cash on hand is ${cash.currentCash}, projected to ${cash.projectedCash} over the next ` +
        `${cash.horizonDays} days. ` +
        (cash.runwayMonths !== null
          ? `At the current burn rate of ${cash.averageMonthlyBurn}/month, that's about ${cash.runwayMonths} months of runway.`
          : 'There is no net burn right now, so runway is not a concern.');
      return { text, blocks: synthesizeBlocks([{ name: 'getCashPosition', result: cash }], text) };
    }

    if (/(top|best-selling|best seller)/.test(lower)) {
      const top = await getTopProducts(businessId);
      const text =
        top.length === 0
          ? 'No sales were recorded in the last 30 days.'
          : `Top sellers over the last 30 days: ` +
            top
              .slice(0, 5)
              .map((p, i) => `${i + 1}. ${p.name} (${p.unitsSold} units, ${p.revenue} revenue)`)
              .join('; ') +
            '.';
      return { text, blocks: synthesizeBlocks([{ name: 'getTopProducts', result: top }], text) };
    }

    if (/expense/.test(lower)) {
      const breakdown = await getExpenseBreakdown(businessId);
      const text =
        breakdown.length === 0
          ? 'No expenses were recorded in the last 90 days.'
          : `Expense breakdown over the last 90 days: ` +
            breakdown
              .slice(0, 5)
              .map((b) => `${b.category}: ${b.total} (${b.count} entries)`)
              .join('; ') +
            '.';
      return { text, blocks: synthesizeBlocks([{ name: 'getExpenseBreakdown', result: breakdown }], text) };
    }
  } catch {
    return {
      text: "I couldn't pull that information right now. Please try again in a moment.",
      blocks: [],
    };
  }

  return {
    text:
      'I can answer questions about sales, inventory, invoices, cash flow, and expenses for this business — ' +
      'try asking about profit, stock levels, overdue invoices, cash flow, top products, or expenses.',
    blocks: [],
  };
}
