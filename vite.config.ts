import { defineConfig } from 'vite';

const { ESBUILD, TERSER } = process.env;
const minify = ESBUILD ? 'esbuild' : TERSER ? 'terser' : false;

export default defineConfig({
  resolve: { alias: [{ find: '@', replacement: '/dist' }] },
  build: {
    target: 'esnext',
    modulePreload: false,
    minify,
    terserOptions: minify === 'terser' ? { format: { comments: false } } : undefined,
  },
  esbuild: { legalComments: 'none' },
});
