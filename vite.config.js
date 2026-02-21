import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [cesium()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/plateau-proxy': {
        target: 'https://plateau.geospatial.jp',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/plateau-proxy/, ''),
        headers: {
          'Origin': 'https://plateau.geospatial.jp',
        },
      },
    },
  },
});
