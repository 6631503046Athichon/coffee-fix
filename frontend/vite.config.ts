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

              if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
                return 'vendor-react';
              }

              if (id.includes('react-router') || id.includes('@remix-run')) {
                return 'vendor-router';
              }

              if (id.includes('recharts') || id.includes('/d3-') || id.includes('/internmap/')) {
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
