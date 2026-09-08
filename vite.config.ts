import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
    server: {
        host: "0.0.0.0",
        port: 5173,
        allowedHosts: true,
        hmr: {
            overlay: false,
        },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "./src"),
        },
        dedupe: [
            "react",
            "react-dom",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
        ],
    },
    // Vite's default 500 kB warning is left in place deliberately: the app was
    // shipping as one ~975 kB chunk with the limit raised just above it, which
    // suppressed the very warning that would have flagged it. Routes are now
    // lazy-loaded (see App.tsx); if a chunk trips this again, split it rather
    // than raising the limit.
});
