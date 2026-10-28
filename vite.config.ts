import { defineConfig } from 'vite';

export default defineConfig({
  build: { rolldownOptions: { input: { game: 'index.html', workshop: 'workshop.html' } } },
  server: {
    proxy: { '/api': 'http://127.0.0.1:3030' },
  },
});
