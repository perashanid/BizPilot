import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseJson, withErrorHandling } from '@/lib/api-helpers';
import { zChatInput } from '@/lib/types';
import { runCopilotChat } from '@/lib/copilot/llm';

export const runtime = 'nodejs';

// Wire protocol (must match exactly - the frontend streams against this contract):
// raw UTF-8 text chunks of the assistant's reply, in order, with NO JSON wrapping and NO SSE
// framing, followed by the literal 8-character delimiter NUL + "BLOCKS" + NUL and then
// JSON.stringify(blocks) (an empty array "[]" when there are no blocks), then the stream closes.
const NUL = String.fromCharCode(0);
const BLOCKS_DELIMITER = `${NUL}BLOCKS${NUL}`;

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const input = await parseJson(req, zChatInput);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const events = runCopilotChat({
          businessId: session.businessId,
          message: input.message,
          // parseJson's generic inference can widen a defaulted schema field to include
          // `undefined` even though zod always fills it in at runtime — coalesce defensively.
          history: input.history ?? [],
        });
        for await (const event of events) {
          if (event.type === 'text') {
            controller.enqueue(encoder.encode(event.delta));
          } else if (event.type === 'blocks') {
            controller.enqueue(encoder.encode(BLOCKS_DELIMITER + JSON.stringify(event.blocks)));
          }
        }
      } catch {
        controller.enqueue(
          encoder.encode('Sorry, something went wrong while answering that. Please try again in a moment.')
        );
        controller.enqueue(encoder.encode(BLOCKS_DELIMITER + '[]'));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
});
