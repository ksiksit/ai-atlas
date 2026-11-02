import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// KaTeX ships woff2 + woff + ttf for every face. Modern browsers only need woff2,
// so strip the rest to keep the single-file build small.
function katexWoff2Only(): Plugin {
  return {
    name: 'katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('katex') || !id.endsWith('.css')) return;
      return code.replace(/,\s*url\([^)]*\.woff\)\s*format\("woff"\)/g, '').replace(/,\s*url\([^)]*\.ttf\)\s*format\("truetype"\)/g, '');
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [katexWoff2Only(), react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 2000,
  },
}));
