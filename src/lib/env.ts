import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  STRIPE_SECRET_KEY: z
    .string()
    .refine((k) => k.startsWith("sk_test_") || k.startsWith("rk_test_"), {
      message: "STRIPE_SECRET_KEY must be a TEST mode key (sk_test_…). Live keys are refused.",
    }),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PORTAL_CONFIGURATION_ID: z.string().optional(),
  APP_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  ADMIN_EMAILS: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Validated lazily so `next build` does not need secrets present.
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
