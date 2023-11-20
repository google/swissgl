import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl({ compress: true })],
  publicDir: false,
  build: {
    lib: { entry: 'src/swissgl.ts', formats: ['es'] },
    target: 'esnext',
  },
  esbuild: { legalComments: 'none' },
});
