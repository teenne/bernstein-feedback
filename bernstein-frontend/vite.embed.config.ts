import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist/embed',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/embed.tsx'),
      name: 'BernsteinWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    rollupOptions: {
      // Don't externalize React/ReactDOM because we want the embedded widget
      // to be completely standalone and zero-dependency for users dropping it in.
      external: [],
      output: {
        assetFileNames: 'widget.css',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
