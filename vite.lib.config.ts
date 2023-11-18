import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    lib: { entry: 'swissgl.js', formats: ['es'] },
    target: 'esnext',
  },
  esbuild: { legalComments: 'none' },
});
