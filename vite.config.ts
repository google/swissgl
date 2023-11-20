import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

const { ESBUILD, TERSER } = process.env;
const minify = ESBUILD ? 'esbuild' : TERSER ? 'terser' : false;

export default defineConfig({
  resolve: { alias: [{ find: '@', replacement: '/dist' }] },
  plugins: [glsl({ compress: true })],
  build: {
    outDir: 'build',
    target: 'esnext',
    modulePreload: false,
    minify,
    terserOptions: minify === 'terser' ? { format: { comments: false } } : undefined,
  },
  esbuild: { legalComments: 'none' },
});
