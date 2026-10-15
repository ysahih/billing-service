import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Checkout cancelled</h1>
      <p className="mt-2 text-neutral-600">Nothing was charged.</p>
      <Link href="/pricing" className="mt-6 inline-block underline">Back to pricing</Link>
    </div>
  );
}
