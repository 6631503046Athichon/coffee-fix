import type { Config } from 'tailwindcss'

/**
 * Mirrors the window.tailwindConfig block that used to live inline in
 * index.html (Tailwind via CDN). Keep the two in sync until the CDN
 * <script src="https://cdn.tailwindcss.com"> is retired entirely.
 */
const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx,html}',
  ],
  theme: {
    extend: {
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out',
      },
      colors: {
        coffee: {
          '50': '#faf5f1',
          '100': '#efe3dc',
          '200': '#dcc4b6',
          '300': '#c6a28f',
          '400': '#a9705a',
          '500': '#8d5540',
          '600': '#723e29',
          '700': '#5a3520',
          '800': '#40241a',
          '900': '#2b1710',
          '950': '#1a0e07',
        },
        indigo: {
          '50': '#eef2ff',
          '100': '#e0e7ff',
          '200': '#c7d2fe',
          '300': '#a5b4fc',
          '400': '#818cf8',
          '500': '#6366f1',
          '600': '#4f46e5',
          '700': '#4338ca',
          '800': '#3730a3',
          '900': '#312e81',
          '950': '#1e1b4b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Thai', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
