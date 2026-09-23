import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The TV bootstrap is a standalone ES5 bundle for old TV browsers: the
    // Next/TypeScript rules here do not describe it.
    "tv/**",
    // esbuild output of app/polyfills.ts — minified artifact, not source.
    "public/polyfills-legacy.js",
    // Playwright smoke/visual artifacts.
    "test-results/**",
    "scripts/device-smoke.mjs",
    "scripts/visual-hero.mjs",
    "scripts/visual-hero-diag.mjs",
  ]),
]);

export default eslintConfig;
