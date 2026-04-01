/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}', './example/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        feedback: {
          bg: 'var(--feedback-bg, #ffffff)',
          'bg-secondary': 'var(--feedback-bg-secondary, #f9fafb)',
          text: 'var(--feedback-text, #111827)',
          'text-muted': 'var(--feedback-text-muted, #6b7280)',
          border: 'var(--feedback-border, #e5e7eb)',
          primary: 'var(--feedback-primary, #3b82f6)',
          'primary-hover': 'var(--feedback-primary-hover, #2563eb)',
          error: 'var(--feedback-error, #ef4444)',
          success: 'var(--feedback-success, #22c55e)',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translate(-50%, -48%) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
  prefix: 'bf-',
};
