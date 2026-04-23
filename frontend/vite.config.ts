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
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return undefined;

              // Keep the entire React module graph in one chunk. React 19's
              // shared internals (e.g. React.Activity) must be set before any
              // helper touches them at module-init time — splitting react-is or
              // use-sync-external-store into vendor-misc causes
              // "Cannot set properties of undefined (setting 'Activity')" when
              // the browser loads vendor-misc before vendor-react finishes.
              if (
                id.includes('/node_modules/react/') ||
                id.includes('/node_modules/react-dom/') ||
                id.includes('/node_modules/react-is/') ||
                id.includes('/node_modules/scheduler/') ||
                id.includes('/node_modules/use-sync-external-store/')
              ) {
                return 'vendor-react';
              }

              if (id.includes('react-router') || id.includes('@remix-run')) {
                return 'vendor-router';
              }

              // Keep recharts and its full transitive graph together. recharts
              // 3.x ships with @reduxjs/toolkit, react-redux, redux,
              // redux-thunk, reselect, and immer as internal state plumbing —
              // if react-redux lands in vendor-misc instead, its module-init
              // code (`const useLayoutEffect = React.useLayoutEffect`) runs
              // before React's namespace is populated and crashes with
              // "Cannot read properties of undefined (reading 'useLayoutEffect')".
              if (
                id.includes('/node_modules/recharts/') ||
                id.includes('/node_modules/d3-') ||
                id.includes('/node_modules/internmap/') ||
                id.includes('/node_modules/@reduxjs/') ||
                id.includes('/node_modules/react-redux/') ||
                id.includes('/node_modules/redux/') ||
                id.includes('/node_modules/redux-thunk/') ||
                id.includes('/node_modules/reselect/') ||
                id.includes('/node_modules/immer/')
              ) {
                return 'vendor-charts';
              }

              if (id.includes('@google/genai')) {
                return 'vendor-ai';
              }

              if (id.includes('qrcode') || id.includes('jszip') || id.includes('file-saver')) {
                return 'vendor-files';
              }

              if (id.includes('lucide-react')) {
                return 'vendor-ui';
              }

              return 'vendor-misc';
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});
