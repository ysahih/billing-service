import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  // Integration tests truncate tables: never point them at the dev database by accident.
  const DATABASE_URL = env.TEST_DATABASE_URL || env.DATABASE_URL;
  // Read by tests/setup/migrate.ts, which runs in this process before workers start.
  process.env.VITEST_DATABASE_URL = DATABASE_URL;

  return {
    plugins: [tsconfigPaths()],
    resolve: {
      // `server-only` throws outside the React server runtime; tests are server-side by definition.
      alias: { "server-only": new URL("./tests/stubs/empty.ts", import.meta.url).pathname },
    },
    test: {
      include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
      env: { ...env, DATABASE_URL },
      globalSetup: ["tests/setup/migrate.ts"],
      // Integration tests share one database; run files serially.
      fileParallelism: false,
    },
  };
});
