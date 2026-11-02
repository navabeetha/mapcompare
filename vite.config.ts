/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    // Leaflet touches `window` at import time, so even the pure geometry
    // modules need a DOM to be importable.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
