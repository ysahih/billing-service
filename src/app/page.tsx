import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">billing-service</h1>
      <p className="mt-2 max-w-xl text-neutral-600">
        Subscription billing on Stripe (test mode). Stripe is the source of truth; this app keeps a
        webhook-fed read model of it.
      </p>
      <Link href="/pricing" className="mt-6 inline-block rounded bg-neutral-900 px-4 py-2 text-white">
        See plans
      </Link>
    </div>
  );
}
