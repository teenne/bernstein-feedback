import { describe, it, expect } from 'vitest';
import { generateSelector } from '../utils/dom';

describe('generateSelector', () => {
    it('returns #id when element has an id', () => {
        const el = document.createElement('button');
        el.id = 'my-button';
        expect(generateSelector(el)).toBe('#my-button');
    });

    it('returns data-testid selector when present', () => {
        const el = document.createElement('div');
        el.setAttribute('data-testid', 'feedback-form');
        expect(generateSelector(el)).toBe('[data-testid="feedback-form"]');
    });

    it('returns tag[name] when element has name attribute', () => {
        const el = document.createElement('input');
        el.setAttribute('name', 'email');
        expect(generateSelector(el)).toBe('input[name="email"]');
    });

    it('returns tag.class1.class2 with max 2 classes', () => {
        const el = document.createElement('div');
        el.className = 'card primary large extra';
        expect(generateSelector(el)).toBe('div.card.primary');
    });

    it('returns just the tag for elements with no identifiers', () => {
        const el = document.createElement('span');
        expect(generateSelector(el)).toBe('span');
    });

    it('prefers id over data-testid', () => {
        const el = document.createElement('div');
        el.id = 'my-id';
        el.setAttribute('data-testid', 'my-testid');
        expect(generateSelector(el)).toBe('#my-id');
    });

    it('prefers data-testid over name', () => {
        const el = document.createElement('input');
        el.setAttribute('data-testid', 'email-input');
        el.setAttribute('name', 'email');
        expect(generateSelector(el)).toBe('[data-testid="email-input"]');
    });
});
