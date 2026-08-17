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
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
