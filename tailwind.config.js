/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
  // Prefix all classes to avoid conflicts with host app
  prefix: 'bf-',
};
