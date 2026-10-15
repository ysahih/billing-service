import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // `server-only` throws outside the React server runtime; tests are server-side by definition.
    alias: { "server-only": new URL("./tests/stubs/empty.ts", import.meta.url).pathname },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    passWithNoTests: true,
    // Integration tests share one database; run files serially.
    fileParallelism: false,
  },
});
