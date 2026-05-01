import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Brand selection happens at config time so the alias points directly
  // at the active brand barrel. This sidesteps Vite's inability to tree-
  // shake CSS side-effect imports across `import * as inactive from
  // './inactive'` in `client/src/brand/index.ts`. The active barrel imports
  // its brand-specific CSS as a side-effect; the inactive barrel is never
  // resolved.
  //
  // We load env from the repo root (one level up from `client/`) so the
  // root `.env` reaches Vite's config phase regardless of `root: client/`.
  const env = loadEnv(mode, path.resolve(import.meta.dirname), "");
  const brand = env.VITE_BRAND ?? process.env.VITE_BRAND;
  if (brand !== "alphax" && brand !== "brainlift") {
    throw new Error(
      `[vite.config] VITE_BRAND must be 'alphax' or 'brainlift'; got: ${JSON.stringify(brand)}.`,
    );
  }

  return {
  plugins: [react()],
  resolve: {
    alias: [
      // ORDER MATTERS: the most specific alias (`@/brand`) is listed first
      // so it is tested before the catch-all `@` alias. `@/brand` resolves
      // to the active brand barrel directly (skipping the runtime dispatch
      // selector at `client/src/brand/index.ts`). Both barrels expose the
      // same surface (`config`, `Wordmark`, `Avatar`, `LoginIllustration`,
      // `chatAvatar`, and a `brand` namespace) plus a side-effect CSS
      // import; only the active brand's CSS ships in the bundle.
      {
        find: /^@\/brand$/,
        replacement: path.resolve(
          import.meta.dirname,
          "client",
          "src",
          "brand",
          brand,
        ),
      },
      { find: "@shared", replacement: path.resolve(import.meta.dirname, "shared") },
      { find: "@assets", replacement: path.resolve(import.meta.dirname, "attached_assets") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "client", "src") },
    ],
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          'vendor-react': ['react', 'react-dom', 'react/jsx-runtime'],
          // UI framework
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-accordion',
            '@radix-ui/react-toast',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-progress',
            '@radix-ui/react-switch',
            '@radix-ui/react-label',
          ],
          // Data fetching
          'vendor-query': ['@tanstack/react-query'],
          // Icons
          'vendor-icons': ['lucide-react', 'react-icons'],
          // Heavy utilities
          'vendor-utils': ['html2canvas', 'dompurify'],
          // Validation
          'vendor-zod': ['zod'],
        },
      },
    },
  },
  server: {
    host: true, // Expose on local network
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  };
});
