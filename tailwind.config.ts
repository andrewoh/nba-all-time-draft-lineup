import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        court: {
          50: '#f8fafc',
          100: '#eef2ff',
          200: '#dbeafe',
          700: '#1d4ed8',
          900: '#0f172a'
        }
      }
    }
  },
  plugins: []
};

export default config;
