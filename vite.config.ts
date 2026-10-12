import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work at ANY URL (user.github.io/<repo>/, custom domain, local preview),
// so renaming the repository never breaks the site.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 4000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
