import { z } from "zod";
import { unauthorized } from "@/lib/http";
import { currentUser } from "@/lib/session";
import { recordUsage } from "@/lib/usage";

const body = z.object({ quantity: z.number().int().min(1).max(10_000).default(1) });

const STATUS_FOR = { no_subscription: 403, payment_required: 402, quota_exceeded: 429 } as const;

/** Records API calls for the signed-in customer. Stands in for a real product API's usage hook. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "quantity must be an integer 1–10000" }, { status: 400 });

  const result = await recordUsage(user.id, parsed.data.quantity);
  if (!result.ok) return Response.json({ error: result.reason }, { status: STATUS_FOR[result.reason] });
  return Response.json(
    { id: result.record.id, quantity: result.record.quantity, usedThisPeriod: result.usedThisPeriod, reported: result.reported },
    { status: 201 },
  );
}
