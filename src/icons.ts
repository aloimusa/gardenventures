// Outline icons, 24-unit viewBox drawn at 26 px, 1.8 stroke, round caps and joins.
const svg = (body: string, size = 26) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const SPROUT = '<path d="M12 20.5V12"/><path d="M12 12.5C12 9 9.6 6.5 5.5 6.5C5.5 10 7.9 12.5 12 12.5Z"/>' +
  '<path d="M12 14.5C12 11.3 14.2 8.8 18.2 8.8C18.2 12 16 14.5 12 14.5Z"/>';

export const ICONS = {
  winddown: svg('<path d="M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1Z"/>'),
  reflect: svg('<path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9.5A1.5 1.5 0 0 1 19 17h-8.5L6.5 20v-3H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5Z"/>' +
    '<path d="M7.8 9h8.4"/><path d="M7.8 12.5h5.6"/>'),
  home: svg(SPROUT),
  venture: svg('<circle cx="12" cy="12" r="8.6"/><path d="M15.4 8.6 13.4 13.4 8.6 15.4 10.6 10.6Z"/>'),
  toolkit: svg('<path d="M3.5 9.5h17v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M9 9.5V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5v3"/>' +
    '<path d="M3.5 13.5h17"/><path d="M10.5 12.3v2.4h3v-2.4"/>'),
};

/** the completion mark: the same two-leaf sprout, small */
export const MARK = svg(SPROUT, 13);
