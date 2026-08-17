import { defineConfig } from 'tsdown'

/**
 * Build the package root and invariant companion as independent bundles.
 *
 * The override reuses `llm-pi-ai`'s profile resolver, pi-ai context
 * conversion, and event translation through the package's declared `./src/*`
 * export surface (those helpers are deliberately absent from its package
 * root). `alwaysBundle` inlines those modules into this package's own lib so
 * the published artifact does not depend on `llm-pi-ai` shipping source —
 * its `files` excludes `src/`. The public `@deepseek-ai/dsh-llm-pi-ai` entry
 * and every other peer dependency stay external.
 */
export default defineConfig([
  {
    entry: ['lib/types/index.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    deps: {
      alwaysBundle: [/@deepseek-ai\/dsh-llm-pi-ai\/src\//],
    },
  },
  {
    entry: ['lib/types/invariant.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
])