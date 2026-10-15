import { z } from "zod";
import { isPlanKey } from "@/lib/plans";
import { isQuoteFresh } from "@/lib/proration";
import { currentUser } from "@/lib/session";
import { confirmPlanChange } from "@/lib/subscription-changes";
import { errorResponse, unauthorized } from "@/lib/http";

const body = z.object({ plan: z.string(), prorationDate: z.number().int() });

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isPlanKey(parsed.data.plan)) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (!isQuoteFresh(parsed.data.prorationDate, Math.floor(Date.now() / 1000))) {
    return Response.json({ error: "This quote has expired. Preview the change again." }, { status: 409 });
  }
  try {
    await confirmPlanChange(user.id, parsed.data.plan, parsed.data.prorationDate);
    // 202: Stripe accepted the change; the account page reflects it once the webhook lands.
    return Response.json({ status: "requested" }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
