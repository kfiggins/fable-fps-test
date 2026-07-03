import { defineConfig } from 'vite';

// base path matches the GitHub Pages project URL: kfiggins.github.io/fable-fps-test/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/fable-fps-test/' : '/',
  build: {
    sourcemap: false,
    minify: 'esbuild',
  },
  esbuild: {
    drop: ['debugger'],
  },
});
