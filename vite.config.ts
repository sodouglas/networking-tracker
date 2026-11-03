import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// TARGET=gas builds release/app.js + release/app.css for the Apps Script web app (loaded via jsDelivr).
// Default builds the self-contained dist/index.html (local file version).
export default defineConfig(() => process.env.TARGET === 'gas'
  ? {
      plugins: [preact()],
      define: { 'process.env.NODE_ENV': '"production"' },
      build: {
        outDir: 'release', emptyOutDir: true,
        lib: { entry: 'src/main.tsx', formats: ['iife'], name: 'NetworkingTracker', fileName: () => 'app.js', cssFileName: 'app' },
      },
    }
  : { plugins: [preact(), viteSingleFile()], build: { outDir: 'dist', assetsInlineLimit: 100000000 } });
