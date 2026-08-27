import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['apps/**/*.test.tsx', 'scripts/**/*.test.mjs'],
    setupFiles: ['./vitest.setup.ts']
  }
});
