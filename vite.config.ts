// `defineConfig` vient de `vitest/config` et non de `vite` : c'est ce qui type
// la clé `test` ci-dessous. La configuration Vite reste identique.
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  build: {
    rollupOptions: {
      // Deux entrées applicatives compilées séparément : le code de l'éditeur
      // n'entre jamais dans le bundle chargé en permanence par OBS (spec §5.1).
      // `home` s'y ajoute : page statique sans script, elle ne produit aucun
      // bundle et n'alourdit donc ni l'une ni l'autre.
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
