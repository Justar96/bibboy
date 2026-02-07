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
        // Paper palette - warm paper tones from lightest cream to manila
        paper: {
          50: '#fdfcfa',   // Lightest cream
          100: '#fbf9f4',  // Light paper
          200: '#f5f1eb',  // Warm white
          300: '#efe9e0',  // Aged paper
          400: '#e8dfd0',  // Parchment
          500: '#d4c8b8',  // Manila
        },
        // Ink palette - from light to deep black
        ink: {
          50: '#f5f3f0',
          100: '#e8e4de',
          200: '#c9c2b8',
          300: '#a69d90',
          400: '#8b7355',  // Faded ink
          500: '#6b5a47',  // Medium ink
          600: '#4a3a2a',  // Dark ink
          700: '#3d2f22',  // Rich ink
          800: '#2d231a',  // Deep ink
          900: '#1a1510',  // Black ink
        },
        // Accent colors
        accent: {
          rust: '#a65d3f',
          sage: '#7a8b6e',
          navy: '#3d4f5f',
          gold: '#b8963e',
        },
      },
      boxShadow: {
        'paper': '0 1px 3px rgba(74, 58, 42, 0.08), 0 1px 2px rgba(74, 58, 42, 0.06)',
        'paper-md': '0 4px 6px rgba(74, 58, 42, 0.07), 0 2px 4px rgba(74, 58, 42, 0.06)',
        'paper-lg': '0 10px 15px rgba(74, 58, 42, 0.08), 0 4px 6px rgba(74, 58, 42, 0.05)',
        'paper-lift': '0 12px 20px rgba(74, 58, 42, 0.1), 0 4px 8px rgba(74, 58, 42, 0.06)',
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
