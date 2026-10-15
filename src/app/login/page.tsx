import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { endSession, startSession } from "@/lib/session";

async function signIn(formData: FormData) {
  "use server";
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) redirect("/login?error=email");
  const user = await db.user.upsert({
    where: { email: email.data },
    update: {},
    create: { email: email.data },
  });
  await startSession(user.id);
  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/account");
}

async function signOut() {
  "use server";
  await endSession();
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Demo sign-in: enter any email. There is no password. Real auth is out of scope for this
        project.
      </p>
      <form action={signIn} className="mt-6 space-y-3">
        <input type="hidden" name="next" value={next ?? ""} />
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="w-full rounded border border-neutral-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">Enter a valid email.</p>}
        <button className="w-full rounded bg-neutral-900 px-3 py-2 text-white">Continue</button>
      </form>
      <form action={signOut} className="mt-4">
        <button className="text-sm text-neutral-500 underline">Sign out</button>
      </form>
    </div>
  );
}
