import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "billing-service",
  description: "Subscription billing on Stripe — portfolio project",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <main className="mx-auto max-w-4xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
