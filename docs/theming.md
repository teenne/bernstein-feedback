# Theming

The feedback widget uses CSS custom properties (variables) for theming, allowing easy customization without modifying source files.

## CSS Variables

Override these variables in your CSS to customize the appearance:

```css
:root {
  /* Primary colors */
  --feedback-primary: #0066cc;
  --feedback-primary-hover: #0055aa;

  /* Background colors */
  --feedback-bg: #ffffff;
  --feedback-bg-secondary: #f5f5f5;

  /* Text colors */
  --feedback-text: #333333;
  --feedback-text-secondary: #666666;

  /* Border colors */
  --feedback-border: #e0e0e0;

  /* Status colors */
  --feedback-success: #22c55e;
  --feedback-error: #ef4444;
}
```

## Dark Mode

Add dark mode support by targeting the `data-theme` attribute:

```css
[data-theme="dark"] {
  --feedback-primary: #3b82f6;
  --feedback-primary-hover: #2563eb;
  --feedback-bg: #1a1a1a;
  --feedback-bg-secondary: #2a2a2a;
  --feedback-text: #f5f5f5;
  --feedback-text-secondary: #a0a0a0;
  --feedback-border: #404040;
}
```

Then set the attribute on your HTML element:

```tsx
// Toggle dark mode
document.documentElement.setAttribute('data-theme', 'dark')
```

## CSS Class Prefix

All component classes are prefixed with `bf-` to avoid conflicts with your application's styles. For example:

- `.bf-button`
- `.bf-dialog`
- `.bf-input`

This means you can safely include the feedback styles without worrying about CSS conflicts.

## Custom Positioning

The feedback button position can be adjusted with CSS:

```css
/* Move to bottom-left */
.bf-feedback-button {
  left: 1rem;
  right: auto;
}

/* Adjust spacing */
.bf-feedback-button {
  bottom: 2rem;
  right: 2rem;
}
```
