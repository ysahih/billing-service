import { currentUser } from "@/lib/session";
import { setCancelAtPeriodEnd } from "@/lib/subscription-changes";
import { errorResponse, unauthorized } from "@/lib/http";

export async function POST() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    await setCancelAtPeriodEnd(user.id, true);
    return Response.json({ status: "requested" }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
