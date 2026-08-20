// `defineConfig` comes from `vitest/config`, not from `vite`: that is what
// types the `test` key below. The Vite configuration itself is unchanged.
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  build: {
    rollupOptions: {
      // Two application entries, compiled separately: the editor code never
      // reaches the bundle OBS keeps loaded (spec §5.1). `home` joins them as a
      // scriptless static page — it produces no bundle and weighs on neither.
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        capture: resolve(import.meta.dirname, 'capture.html'),
        overlay: resolve(import.meta.dirname, 'overlay.html'),
      },
      output: {
        // Rollup names a shared chunk after one of the modules inside it, and
        // that name is chosen by the bundler, not by meaning: importing a
        // stylesheet from both entry points was enough to make the 47 kB
        // Svelte runtime appear as `fonts-broadcast.js`. Anyone reading a
        // network tab would have concluded the fonts weighed 47 kB.
        chunkFileNames: 'assets/shared-[hash].js',
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
