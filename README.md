# billing-service

Subscription billing on Stripe: three plans (two with metered overage), webhook-driven state,
proration previews, failed-payment handling and an admin view with a webhook event log.
**This is a portfolio project, not client work.** It runs against Stripe test mode only.

Stack: Next.js 15 (App Router) · TypeScript (strict) · PostgreSQL + Prisma · Stripe · Tailwind ·
Vitest · Playwright · GitHub Actions.

---

## 1. The one rule: Stripe is the source of truth

The database is a **read model** of Stripe. Subscription `status`, `plan`, `priceId`,
`currentPeriodStart/End` and `cancelAtPeriodEnd`, and every Invoice field, are written by
webhook handlers only ([`src/lib/webhooks`](src/lib/webhooks)). Request handlers read them, but
they never write them.

The rule shows up in a few places:

- `POST /api/checkout` creates a Checkout Session and redirects. It does **not** mark anyone
  subscribed. A completed checkout means the customer got through a payment form. It doesn't mean
  a subscription is active. The success page waits for the webhook
  ([`checkout/success/page.tsx`](src/app/checkout/success/page.tsx)).
- Plan change, cancel and resume call Stripe and return `202 Accepted`. The UI shows "requested"
  until `customer.subscription.updated` arrives and the read model changes.
- `checkout.session.completed` only carries a subscription *id*. The handler fetches the
  subscription from Stripe before opening the transaction, instead of guessing its state from the
  session.

**Why.** Subscription state changes when nobody is making a request: renewals, Smart Retries,
dunning, trial ends, Dashboard edits, disputes. If the app also writes state from API responses,
there are two writers, and sooner or later they disagree. When they do, the database is the one
that's wrong. With a single writer that consumes Stripe's own event stream, the read model can
lag but it cannot diverge.

The one thing request handlers do write is the **User → Stripe Customer mapping**
([`customers.ts`](src/lib/customers.ts)). That's identity, not billing state. It's created
before checkout with a Stripe idempotency key, so two concurrent first checkouts still produce
one Stripe customer.

## 2. Idempotency: one ledger row per event, in the same transaction

```
WebhookEvent.stripeEventId  UNIQUE
```

[`processEvent`](src/lib/webhooks/process.ts) opens a transaction, **inserts the WebhookEvent row
first**, then applies the state change, then commits both together.

**The race it prevents.** Stripe delivers at least once. It retries on timeouts and 5xx
responses, and it sometimes sends the same event twice at almost the same moment. The naive
version is:

```
if (!await seen(event.id)) { apply(event); markSeen(event.id) }   // broken
```

That's a check-then-act race. Two concurrent deliveries can both pass `seen()` and both
`apply()`. The handler double-counts, or replays an old state over a newer one.

With the insert-first approach, both deliveries try `INSERT … stripeEventId`. Postgres makes the
second one wait on the unique index until the first commits, then fails it with a unique
violation. The loser rolls back, having changed nothing, and returns `200 duplicate`. If the
first delivery fails instead, its whole transaction rolls back (including the ledger row), so
Stripe's retry processes the event from scratch. The integration tests fire 8 copies of one event
concurrently and assert exactly one is processed
([`idempotency.test.ts`](tests/integration/idempotency.test.ts)).

Idempotency is half the problem. The other half is **ordering**: Stripe does not guarantee it.
Each Subscription and Invoice row stores `lastEventAt`, the `created` time of the newest event
applied to it. Older events are recorded with outcome `stale` and change nothing, so a delayed
`customer.subscription.updated` can't roll a plan change back. Invoice-driven status changes
(`past_due` on failure, back to `active` on payment) are a fast path. They apply only if no newer
subscription snapshot exists, and they never advance the watermark. Subscription events are the
authoritative, ordered snapshots, and Stripe emits one whenever status really changes.

Other webhook properties:

- **API version pinned.** Events in any API version other than the SDK's are rejected with a
  400 before processing, because payload shapes differ between versions.
- **Raw body.** The App Router has no body parser to disable (the Pages Router's
  `config.api.bodyParser = false` doesn't apply). The route reads `request.text()` and passes those
  exact bytes to `stripe.webhooks.constructEvent`. It never calls `request.json()` first.
- **Unknown event types** are recorded with outcome `ignored` and get a 200. A 500 would make
  Stripe retry them for days.
- **Real failures** return 500 with nothing committed, so Stripe redelivers with backoff.
- **No network calls inside the transaction.** Anything that has to be fetched is fetched first.

## 3. Proration: preview, then confirm

Changing plan is a two-step flow ([`subscription-changes.ts`](src/lib/subscription-changes.ts)):

1. **Preview.** `stripe.invoices.createPreview` with the new items and
   `proration_behavior: 'create_prorations'`. The UI shows each proration line (credit for unused
   time on the old plan, charge for the rest of the period on the new one), the net adjustment,
   and the next invoice total.
2. **Confirm.** `subscriptions.update` with the same items and the **same `proration_date`** the
   preview used. Without it, Stripe recomputes the proration at confirm time and the amount
   drifts from what the user saw. Quotes expire after 15 minutes. The update carries an
   idempotency key, so a double-click can't apply the change twice.

The preview is what makes this credible. Billing someone an amount they've never seen is how you
get chargebacks and support tickets.

Plan items are swapped **in place by subscription item id**
([`proration.ts`](src/lib/proration.ts)), which is what makes Stripe prorate instead of starting a
new billing cycle. Moving to or from Starter adds or removes the metered item.

> **API note.** The original design called for `stripe.invoices.retrieveUpcoming` and usage
> records. Stripe removed both in API version `2025-03-31.basil`. This project is pinned to the
> current API (`2026-09-30.endive`, stripe-node 23), so it uses their replacements:
> `invoices.createPreview` and Billing Meters (`billing.meterEvents.create`). In the same API,
> `current_period_*` moved from the subscription to its items, and an invoice's subscription lives
> under `invoice.parent.subscription_details`. The webhook projection reads them from there.

Cancel sets `cancel_at_period_end`. Resume clears it while the period is still running.

## 4. Failed payments: what Stripe does, what this app does

| Concern | Owner |
|---|---|
| Retrying the charge (Smart Retries schedule) | **Stripe** |
| Dunning emails, card-expiry reminders | **Stripe** (Dashboard settings) |
| Hosted page where the customer pays an open invoice | **Stripe** (`hosted_invoice_url`) |
| Updating the payment method | **Stripe** Billing Portal |
| What happens once retries run out (cancel / mark unpaid) | **Stripe**, configured in Dashboard; arrives here as a subscription event |
| Recording that a payment failed, and when the next retry is | **App**: `invoice.payment_failed` → Invoice row with `attemptCount`, `nextPaymentAttempt` |
| Moving the subscription to `past_due` in the read model | **App** |
| Telling the user, with a link to pay | **App**: banner in the account area |
| Restricting what an unpaid account can do | **App**: [`entitlements.ts`](src/lib/entitlements.ts) |
| Restoring access when the invoice is paid | **App**: `invoice.paid` clears `past_due` |

The app doesn't implement retries, schedules or dunning email. Stripe already does those well, and
a second retry loop would fight the first one. The app's job is to reflect state accurately and
gate access on it. While `past_due`, the metered API returns `402 Payment Required`, and the
billing pages keep working so the customer can fix it.

## 5. Usage metering

`POST /api/usage` records API calls ([`usage.ts`](src/lib/usage.ts)):

- The quota check and the insert run under a per-customer `pg_advisory_xact_lock`, so concurrent
  calls can't jointly overshoot Starter's hard cap (tested).
- Pro and Scale send each record to a Stripe Billing Meter. Their metered prices are graduated
  tiers, with the included quota at $0 and overage per call after that. The local record id is
  the meter event `identifier`, so retries are deduplicated by Stripe.
- Reporting happens after commit. If Stripe is down, the record stays with `reportedAt = null`, and
  `pnpm usage:report` re-sends it (run it on a schedule in production).

The account page shows usage this period against the plan's included calls.

## 6. Admin

`/admin` is gated by the `ADMIN_EMAILS` allowlist. Everyone else gets a 404, not a 403.

- **Customers:** status and MRR contribution per customer, plus total MRR. `active` and
  `past_due` count toward MRR; trials don't, and neither does metered overage.
- **Customer detail:** subscription history, invoices with retry attempts, and every webhook event
  received for that customer.
- **Webhook event log:** filter by type, outcome (`processed` / `ignored` / `stale`), customer or
  event id. Each row shows when Stripe created the event and when we committed it, and expands to
  the full payload. A large gap between the two times is the first thing to check when state looks
  wrong.

## 7. Deliberately out of scope

Naming these is part of the design:

- **Tax.** No Stripe Tax, no tax IDs, no VAT/GST logic. A real deployment turns on
  `automatic_tax` and collects addresses.
- **Multi-currency.** USD only. Prices have no `currency_options`, and amounts are shown in
  the invoice's currency without FX.
- **Enterprise invoicing.** No `send_invoice` collection, net terms, POs, quotes or manual
  invoices. Everything is card on file, charged automatically.
- **Usage rollover and mid-period metered changes.** Unused calls don't carry over. Moving between
  metered plans mid-period swaps the metered price, and overage for the period is whatever Stripe
  computes at invoice time. The preview covers the flat fee only and says so.
- **Annual plans, coupons, trials at signup, seat-based pricing, pausing.** The handlers would
  cope (trials are already handled), but there's no UI for them.
- **Real authentication.** Sign-in is a demo: enter an email, get an HMAC-signed cookie
  ([`session.ts`](src/lib/session.ts)). The brief excluded auth providers. Swap the module for a
  real one.
- **Email and notifications.** Stripe sends the billing emails. The app sends none.
- **Async webhook processing.** Events are processed inline. Each handler is a few indexed writes,
  well inside Stripe's timeout. At higher volume you'd acknowledge immediately and process from a
  queue, with the same ledger.
- **Reconciliation.** There's no periodic job comparing the read model with Stripe to catch events
  missed beyond Stripe's 3-day retry window. In production I'd add one before anything else on
  this list.

## 8. Running it

Prerequisites: Node 20+, pnpm, Docker, the [Stripe CLI](https://docs.stripe.com/stripe-cli), and a
Stripe account in **test mode**.

```bash
cp .env.example .env             # add sk_test_… key; set SESSION_SECRET and ADMIN_EMAILS
docker compose up -d             # Postgres on localhost:5433 (+ billing_test database)
pnpm install
pnpm prisma migrate dev          # apply migrations
pnpm stripe:setup                # create meter, products, prices, portal config (idempotent)
                                 # → copy the printed STRIPE_PORTAL_CONFIGURATION_ID into .env

stripe listen --latest \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.trial_will_end,invoice.paid,invoice.payment_failed \
  --forward-to localhost:3000/api/webhooks/stripe
                                 # → copy the printed whsec_… into STRIPE_WEBHOOK_SECRET
pnpm dev                         # http://localhost:3000
```

Sign in with any email, pick a plan, and pay with `4242 4242 4242 4242` (any future date, any
CVC). To try a failed payment, switch the customer's card in the Billing Portal to
`4000 0000 0000 0341` (attaches, then declines), then advance the subscription with a
[test clock](https://docs.stripe.com/billing/testing/test-clocks) or the Dashboard.

`--latest` matters. Without it, events are rendered in your account's default API version,
which can be years older than the one this code is pinned to (`2026-09-30.endive`), with a
different payload shape. The webhook route rejects mismatched versions with a 400 rather than
misreading them. For a deployed endpoint, set its API version when you create it.

The app refuses to start with a live key: `STRIPE_SECRET_KEY` must start with `sk_test_`.

### Tests

```bash
pnpm test          # unit + integration (Vitest, against TEST_DATABASE_URL)
pnpm typecheck
pnpm lint
E2E=1 pnpm test:e2e   # Playwright: needs real test keys and `stripe listen` running
```

- **Unit:** proration item diff and preview arithmetic, feature gating by status, MRR.
- **Integration:** every webhook handler through the real route (raw body, real signature check)
  into Postgres. Covers idempotency (sequential and concurrent), out-of-order events, rollback on
  failure, unknown types, and usage caps. Fixtures in [`tests/fixtures`](tests/fixtures) follow
  the API `2026-09-30.endive` payload shape, trimmed to the fields the handlers read.
- **E2E:** pricing → Stripe Checkout with the 4242 card → webhook → account shows `active`.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs typecheck, lint, unit and
integration tests against a Postgres service on every push. The E2E test isn't run in CI because
it needs a Stripe account.

## Layout

```
src/lib/webhooks/     process.ts (ledger + transaction), handlers.ts, sync.ts (projection)
src/lib/              plans, prices, proration, entitlements, usage, mrr, session, stripe, env
src/app/api/          checkout, webhooks/stripe, subscription/{preview,change,cancel,resume}, usage, portal
src/app/              pricing, checkout/{success,cancel}, account, admin, health
scripts/              stripe-setup.ts, report-usage.ts
tests/                unit/, integration/, fixtures/
e2e/                  checkout.spec.ts
```
