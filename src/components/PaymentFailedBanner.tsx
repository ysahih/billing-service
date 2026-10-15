import type { Invoice } from "@prisma/client";
import { formatMoney } from "@/lib/plans";

export function PaymentFailedBanner({ invoice }: { invoice: Invoice | null }) {
  return (
    <div role="alert" data-testid="payment-failed-banner" className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-medium">Your last payment failed. API access is paused until it is paid.</p>
      {invoice ? (
        <p className="mt-1">
          {formatMoney(invoice.amountDue - invoice.amountPaid, invoice.currency)} is outstanding
          {invoice.nextPaymentAttempt && <> · Stripe will retry on {invoice.nextPaymentAttempt.toLocaleDateString()}</>}
          {invoice.hostedInvoiceUrl && (
            <>
              {" · "}
              <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                Pay invoice now
              </a>
            </>
          )}
        </p>
      ) : (
        <p className="mt-1">Update your payment method below.</p>
      )}
    </div>
  );
}
