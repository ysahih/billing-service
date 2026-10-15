import { execSync } from "node:child_process";

// Bring the test database schema up to date once per run.
export default function setup() {
  const url = process.env.VITEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL for integration tests");
  execSync("pnpm prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: url } });
}
