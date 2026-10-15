import "server-only";
import { notFound } from "next/navigation";
import { currentUser, isAdminEmail } from "./session";

/** 404 rather than 403: non-admins should not learn that /admin exists. */
export async function requireAdmin() {
  const user = await currentUser();
  if (!user || !isAdminEmail(user.email)) notFound();
  return user;
}
