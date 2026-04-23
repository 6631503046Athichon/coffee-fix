import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173, // Changed from 3000 to avoid conflict with backend
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      build: {
        // Manual chunk splitting was attempted here (vendor-react, vendor-charts,
        // vendor-router, vendor-ai, vendor-files, vendor-ui, vendor-misc) but
        // kept producing cross-chunk module-init bugs with React 19:
        //   - "Cannot set properties of undefined (setting 'Activity')"
        //     from react-is stranded in the wrong chunk
        //   - "Cannot read properties of undefined (reading 'useLayoutEffect')"
        //     from react-redux (pulled in by recharts) in the wrong chunk
        //   - "Cannot read properties of undefined (reading 'forwardRef')"
        //     from recharts itself when vendor-charts evaluated before the
        //     react namespace binding was populated
        // Each fix exposed the next failure. The root cause is that any
        // library importing React via `import * as React from 'react'` and
        // calling React.forwardRef / React.useLayoutEffect at module-init
        // time needs React fully initialized first, and manual chunks across
        // multiple `<script type="module">` tags is fragile about this.
        // Vite's default heuristic co-locates a dependency with its importers
        // and avoids these TDZ issues — letting it choose chunks reliably.
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});
