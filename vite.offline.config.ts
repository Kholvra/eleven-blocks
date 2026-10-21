import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [
    viteSingleFile({
      outputFileName: 'eleven-blocks-offline.html',
      removeViteModuleLoader: true,
    }),
  ],
  build: {
    outDir: 'offline',
    emptyOutDir: true,
    copyPublicDir: false,
  },
});
