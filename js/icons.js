// Phosphor Icons (Regular 1.5px / Bold 2.25px on 24x24 grid, currentColor, offline inline SVG)
(() => {
  'use strict';

  const ICONS = {
    house: '<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    'shield-check': '<path d="M4.5 5.25A.75.75 0 0 1 5.25 4.5h13.5a.75.75 0 0 1 .75.75V11c0 5.15-4.3 8.15-7.17 9.5a.75.75 0 0 1-.66 0C8.8 19.15 4.5 16.15 4.5 11z"/><path d="M9 12l2 2 4-4"/>',
    'note-pencil': '<path d="M12 4.5H5.25A1.5 1.5 0 0 0 3.75 6v12.75a1.5 1.5 0 0 0 1.5 1.5H18a1.5 1.5 0 0 0 1.5-1.5V12"/><path d="M18.38 3.62a1.5 1.5 0 0 1 2.12 2.12L12 14.25l-3 .75.75-3z"/>',
    'first-aid': '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8.5 6V4.5A1.5 1.5 0 0 1 10 3h4a1.5 1.5 0 0 1 1.5 1.5V6"/><path d="M12 10v6"/><path d="M9 13h6"/>',
    'chart-bar': '<path d="M4.5 19.5V12h3.75v7.5"/><path d="M10.125 19.5V7.5h3.75v12"/><path d="M15.75 19.5V4.5h3.75v15"/><path d="M3 19.5h18"/>',
    cards: '<rect x="3.5" y="7" width="14" height="13.5" rx="1.5"/><path d="M7 4h11.5A1.5 1.5 0 0 1 20 5.5V17"/>',
    lightning: '<path d="M13.5 2.5L5.25 13h6l-1 8.5 8.5-10.5h-6z"/>',
    microphone: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/><path d="M8.5 21h7"/>',
    'book-open': '<path d="M12 6.5a3.5 3.5 0 0 0-3.5-2.5H3.75a.75.75 0 0 0-.75.75v13.5a.75.75 0 0 0 .75.75H8.5A3.5 3.5 0 0 1 12 21a3.5 3.5 0 0 1 3.5-2h4.75a.75.75 0 0 0 .75-.75V4.75a.75.75 0 0 0-.75-.75H15.5A3.5 3.5 0 0 0 12 6.5z"/><path d="M12 6.5V21"/>',
    timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 13l3-3"/><path d="M9.5 3h5"/>',
    'list-numbers': '<path d="M10 6h10"/><path d="M10 12h10"/><path d="M10 18h10"/><path d="M4.5 7V4.5L3.5 5.25"/><path d="M3.75 11.25a1.25 1.25 0 0 1 2.25.75c0 1-2.25 2.5-2.25 2.5h2.5"/><path d="M3.75 16.75a1.25 1.25 0 1 1 1.5 1.5 1.25 1.25 0 1 1-1.5 1.5"/>',
    'clipboard-text': '<rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9 11h6"/><path d="M9 15h6"/>',
    'file-text': '<path d="M6 3.5h8l5 5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8.5h5"/><path d="M8.5 13h7"/><path d="M8.5 16.5h7"/>',
    play: '<path d="M7 5.25a.75.75 0 0 1 1.15-.63l10.5 6.75a.75.75 0 0 1 0 1.26l-10.5 6.75A.75.75 0 0 1 7 18.75z"/>',
    stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/>',
    'speaker-high': '<path d="M4.5 9.5H8l5-4v13l-5-4H4.5a.75.75 0 0 1-.75-.75v-3.5a.75.75 0 0 1 .75-.75z"/><path d="M16 9.25a4 4 0 0 1 0 5.5"/><path d="M18.5 6.75a7.5 7.5 0 0 1 0 10.5"/>',
    'pencil-simple': '<path d="M4 20h4l11.2-11.2a1.5 1.5 0 0 0 0-2.12l-1.88-1.88a1.5 1.5 0 0 0-2.12 0L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M4.5 12.75l5 5 10-10.5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.25l2.5 2.5 4.75-5"/>',
    x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
    'x-circle': '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>',
    triangle: '<path d="M12 4.5L3.5 19.5h17z"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    'caret-left': '<path d="M15 18.5L8.5 12 15 5.5"/>',
    'caret-right': '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
    'arrows-down-up': '<path d="M7.5 5v14"/><path d="M4.5 8l3-3 3 3"/><path d="M16.5 19V5"/><path d="M13.5 16l3 3 3-3"/>',
    lightbulb: '<path d="M8 14.5a6 6 0 1 1 8 0c-.8.7-1.25 1.5-1.5 2.5h-5c-.25-1-.7-1.8-1.5-2.5z"/><path d="M9.5 20h5"/><path d="M10.5 22h3"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    megaphone: '<path d="M4.5 10.5v3a1 1 0 0 0 1 1H8l8 3.5V6L8 9.5H5.5a1 1 0 0 0-1 1z"/><path d="M8 14.5l1.5 5h2.25l-1.25-4"/>',
    'user-check': '<circle cx="9.5" cy="8.5" r="3.75"/><path d="M3.5 19.5a6.5 6.5 0 0 1 12 0"/><path d="M16.5 12l1.75 1.75 3.25-3.5"/>',
    trophy: '<path d="M6.5 4.5h11v5a5.5 5.5 0 0 1-11 0z"/><path d="M6.5 6H4a1 1 0 0 0-1 1v1a3.5 3.5 0 0 0 3.5 3.5"/><path d="M17.5 6H20a1 1 0 0 1 1 1v1a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 15v4.5"/><path d="M8.5 19.5h7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    siren: '<path d="M6 16v-4a6 6 0 0 1 12 0v4"/><path d="M4.5 19.5h15a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 0-.75-.75h-15a.75.75 0 0 0-.75.75v2c0 .41.34.75.75.75z"/><path d="M12 3v1.5"/><path d="M4.5 6.5l1 1"/><path d="M19.5 6.5l-1 1"/>',
    flask: '<path d="M9.5 3.5h5"/><path d="M10.5 3.5v5.2l-5.2 8.8A1.5 1.5 0 0 0 6.6 19.75h10.8a1.5 1.5 0 0 0 1.3-2.25l-5.2-8.8V3.5"/><path d="M7.5 15h9"/>',
    syringe: '<path d="M17.5 3.5l3 3"/><path d="M19 5l-3.5 3.5"/><path d="M13 6l5 5-8.5 8.5H4.5v-5z"/><path d="M3.5 20.5L5.5 18.5"/><path d="M10.5 10.5l2 2"/><path d="M8 13l2 2"/>',
    shield: '<path d="M4.5 5.25A.75.75 0 0 1 5.25 4.5h13.5a.75.75 0 0 1 .75.75V11c0 5.15-4.3 8.15-7.17 9.5a.75.75 0 0 1-.66 0C8.8 19.15 4.5 16.15 4.5 11z"/>',
    warning: '<path d="M10.7 4.5L3.3 17.5a1.5 1.5 0 0 0 1.3 2.25h14.8a1.5 1.5 0 0 0 1.3-2.25L13.3 4.5a1.5 1.5 0 0 0-2.6 0z"/><path d="M12 10v4"/><circle cx="12" cy="16.75" r=".5" fill="currentColor" stroke="none"/>',
    radiation: '<circle cx="12" cy="12" r="2.25"/><path d="M9.75 12H4.25a7.75 7.75 0 0 1 3.88-6.71l2.75 4.76"/><path d="M14.25 12h5.5a7.75 7.75 0 0 0-3.88-6.71l-2.75 4.76"/><path d="M10.88 13.95l-2.75 4.76a7.75 7.75 0 0 0 7.74 0l-2.75-4.76"/>',
    tray: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 14h4.5l1.5 2h5l1.5-2h4.5"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 16.5l.75 2.25 2.25.75-2.25.75-.75 2.25-.75-2.25-2.25-.75 2.25-.75z"/>'
  };

  const icon = (name, { weight = 'regular', size = 20, cls = '' } = {}) => {
    const body = ICONS[name] || ICONS.circle;
    const sw = weight === 'bold' ? '2.25' : '1.5';
    return `<svg class="ph-icon ph-${weight}${cls ? ' ' + cls : ''}" data-icon="${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  };

  window.ICONS = ICONS;
  window.icon = icon;
})();
