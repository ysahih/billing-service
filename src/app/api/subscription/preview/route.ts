import { z } from "zod";
import { isPlanKey } from "@/lib/plans";
import { currentUser } from "@/lib/session";
import { previewPlanChange } from "@/lib/subscription-changes";
import { errorResponse, unauthorized } from "@/lib/http";

const body = z.object({ plan: z.string() });

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isPlanKey(parsed.data.plan)) {
    return Response.json({ error: "Unknown plan" }, { status: 400 });
  }
  try {
    return Response.json(await previewPlanChange(user.id, parsed.data.plan));
  } catch (err) {
    return errorResponse(err);
  }
}
