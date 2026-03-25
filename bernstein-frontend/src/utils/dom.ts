export function generateSelector(el: HTMLElement): string {
    if (el.id) {
        return `#${el.id}`;
    }

    const tag = el.tagName.toLowerCase();
    const classes =
        el.className && typeof el.className === 'string'
            ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.')
            : '';

    // Try to find a unique identifier
    if (el.getAttribute('data-testid')) {
        return `[data-testid="${el.getAttribute('data-testid')}"]`;
    }

    if (el.getAttribute('name')) {
        return `${tag}[name="${el.getAttribute('name')}"]`;
    }

    return `${tag}${classes}`;
}
