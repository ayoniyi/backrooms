import { defineConfig } from 'vite';

export default defineConfig({
  // Model files live in /public/model and are served as static assets.
  // Increase the warning limit since three.js + a building GLB can be large.
  build: {
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true, // allows testing from other devices on your network
  },
});
