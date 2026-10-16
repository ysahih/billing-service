import "server-only";
import { notFound } from "next/navigation";
import { env } from "./env";
import { maskEmail, redactPayload } from "./redact";
import { currentUser, isAdminEmail } from "./session";

export interface AdminView {
  /** Shown in the admin header. */
  viewer: string;
  /** Formats a customer email for display. */
  email: (email: string) => string;
  /** Prepares a webhook payload for display. */
  payload: (payload: unknown) => unknown;
}

/**
 * Gate for every admin page. Called by each page, not only the layout: in the App Router a
 * layout is not guaranteed to re-run for every page render.
 *
 * Normal mode: allowlisted emails only, 404 for everyone else (do not reveal /admin exists).
 * Demo mode (DEMO_ADMIN_OPEN=true): open to every visitor, read-only, personal data masked.
 * In demo mode masking applies to everyone, including allowlisted emails: sign-in is
 * passwordless, so being "signed in as the admin" proves nothing.
 */
export async function adminView(): Promise<AdminView> {
  if (env().DEMO_ADMIN_OPEN) {
    return { viewer: "Public demo · read-only · personal data masked", email: maskEmail, payload: redactPayload };
  }
  const user = await currentUser();
  if (!user || !isAdminEmail(user.email)) notFound();
  return { viewer: user.email, email: (e) => e, payload: (p) => p };
}
