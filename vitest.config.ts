import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit-test config for this app. With the Convex backend gone there is no
// edge-runtime project any more — everything under src/ is React code tested in
// jsdom via Testing Library.
//
// Keep tests hermetic: mock the Supabase client rather than hitting a real
// project, so tests never depend on network or environment state.
export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "./src"),
        },
    },
    plugins: [react()],
    test: {
        passWithNoTests: true,
        // Restore Vitest mocks before each test to reduce state leakage.
        restoreMocks: true,
        name: "frontend",
        environment: "jsdom",
        include: ["src/**/*.test.{ts,tsx}"],
        setupFiles: ["./src/vitest.setup.ts"],
    },
});
