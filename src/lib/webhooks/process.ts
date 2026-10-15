import { Prisma, type PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { customerIdOfEvent, handlers, type Prefetched } from "./handlers";
import { idOf } from "./sync";

export type ProcessResult = "processed" | "ignored" | "stale" | "duplicate";

export interface ProcessDeps {
  db: PrismaClient;
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
}

/**
 * Applies one Stripe event to the read model, exactly once.
 *
 * The WebhookEvent row is inserted FIRST, inside the same transaction as the state change.
 * Two deliveries of the same event racing each other both try that INSERT; Postgres makes
 * the second one wait on the unique index until the first commits, then fails it with a
 * unique violation (P2002). The loser changes nothing and reports "duplicate". If the first
 * one fails, its transaction rolls back — ledger row included — and a retry can succeed.
 *
 * Throwing from here means "not applied": the route returns 500 and Stripe redelivers.
 */
export async function processEvent(event: Stripe.Event, deps: ProcessDeps): Promise<ProcessResult> {
  const handler = handlers[event.type];

  // Skip the network round trip for events already recorded. This is an optimisation only;
  // the unique constraint below is what actually guarantees exactly-once.
  if (await deps.db.webhookEvent.findUnique({ where: { stripeEventId: event.id }, select: { id: true } })) {
    return "duplicate";
  }

  const pre: Prefetched = {};
  if (event.type === "checkout.session.completed") {
    const subId = idOf((event.data.object as Stripe.Checkout.Session).subscription);
    if (subId) pre.subscription = await deps.retrieveSubscription(subId);
  }

  try {
    return await deps.db.$transaction(async (tx) => {
      const ledger = await tx.webhookEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          stripeCustomerId: customerIdOfEvent(event),
          outcome: "processing",
          payload: event as unknown as Prisma.InputJsonValue,
          stripeCreatedAt: new Date(event.created * 1000),
        },
      });

      // Unknown types are recorded and acknowledged. Never 500 on them, or Stripe retries forever.
      const outcome = handler ? await handler(tx, event, pre) : "ignored";

      await tx.webhookEvent.update({ where: { id: ledger.id }, data: { outcome } });
      return outcome;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = (err.meta?.target as string[] | string | undefined) ?? "";
      if (String(target).includes("stripeEventId")) return "duplicate";
    }
    throw err;
  }
}
