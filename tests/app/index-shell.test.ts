import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('production document shell', () => {
  it('declares an embedded icon instead of triggering an implicit /favicon.ico request', () => {
    const html = readFileSync('index.html', 'utf8');
    const document = new DOMParser().parseFromString(html, 'text/html');
    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');

    expect(icon?.href).toMatch(/^data:image\/svg\+xml,/);
  });
});
