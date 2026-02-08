import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../phaser-chat/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Inter - clean, highly readable sans-serif for body text
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Lora - warm serif for headings, editorial paper feel
        display: ['Lora', 'Georgia', 'serif'],
        // Crisp monospace for code - sharp and modern
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Monaco', 'monospace'],
        // Lora as primary serif
        serif: ['Lora', 'Georgia', 'Cambria', 'serif'],
      },
      fontSize: {
        // Typography scale (1.25 ratio)
        'xs': ['0.75rem', { lineHeight: '1.5' }],
        'sm': ['0.875rem', { lineHeight: '1.5' }],
        'base': ['1rem', { lineHeight: '1.75' }],
        'lg': ['1.125rem', { lineHeight: '1.75' }],
        'xl': ['1.25rem', { lineHeight: '1.6' }],
        '2xl': ['1.5rem', { lineHeight: '1.4' }],
        '3xl': ['1.875rem', { lineHeight: '1.3' }],
        '4xl': ['2.25rem', { lineHeight: '1.2' }],
        '5xl': ['3rem', { lineHeight: '1.1' }],
      },
      letterSpacing: {
        tighter: '-0.05em',
        tight: '-0.025em',
        normal: '0',
        wide: '0.025em',
        wider: '0.05em',
        widest: '0.1em',
        'uppercase': '0.15em',  // For uppercase labels and section headers
      },
      colors: {
        // Paper palette - dark gray surfaces (darkest to lightest)
        paper: {
          50: '#1C1C20',   // Deepest background
          100: '#222226',  // Panel background
          200: '#2A2A2E',  // Elevated surface
          300: '#333338',  // Border / divider
          400: '#3E3E44',  // Strong border
          500: '#4A4A52',  // Muted surface
        },
        // Ink palette - light text on dark (muted to bright)
        ink: {
          50: '#2A2A2E',   // Subtle bg tint
          100: '#3A3A3E',  // Faint border
          200: '#55555C',  // Disabled text
          300: '#7A7A82',  // Muted text
          400: '#9A9AA0',  // Secondary text
          500: '#ADADB4',  // Body text
          600: '#C4C4CC',  // Primary text
          700: '#DCDCE2',  // Heading text
          800: '#EBEBF0',  // Bright text
          900: '#F5F5FA',  // White text
        },
        // Accent colors (adjusted for dark bg)
        accent: {
          rust: '#D4785A',
          sage: '#8FA87E',
          navy: '#5D7A8F',
          gold: '#D4AD4A',
        },
      },
      boxShadow: {
        'paper': '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
        'paper-md': '0 4px 6px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)',
        'paper-lg': '0 10px 15px rgba(0, 0, 0, 0.35), 0 4px 6px rgba(0, 0, 0, 0.2)',
        'paper-lift': '0 12px 20px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.25)',
      },
      borderRadius: {
        'paper': '3px',
        'paper-lg': '6px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
