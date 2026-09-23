// Ícones SVG de traço (24x24, currentColor) para a interface.
// Emojis ficam só no conteúdo divertido (tickets, caos); a moldura usa ícones.
const P = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  cart: '<path d="M3 4h2.5l2.2 10.5a1.5 1.5 0 001.5 1.2h8.3a1.5 1.5 0 001.5-1.1L21 8H6.3"/><circle cx="10" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.3.2 4 1.8 4.5 4.3"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 3.6 5.4 3.6 8.5s-1 5.9-3.6 8.5c-2.6-2.6-3.6-5.4-3.6-8.5s1-5.9 3.6-8.5z"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 015.5 4H11v15.5H5.5A1.5 1.5 0 014 18z"/><path d="M20 5.5A1.5 1.5 0 0018.5 4H13v15.5h5.5a1.5 1.5 0 001.5-1.5z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"/><circle cx="12" cy="12" r="6.2"/>',
  map: '<path d="M9 4.5l-5 2v13l5-2 6 2 5-2v-13l-5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  coins: '<ellipse cx="9" cy="7" rx="5" ry="2.5"/><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7"/><path d="M10 15.4c.9 1.2 3 2.1 5.5 2.1 2.8 0 5-1.1 5-2.5v-4c0-1.2-1.6-2.2-3.8-2.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H4.5v1.5A3 3 0 008 10.3M16 6h3.5v1.5a3 3 0 01-3.5 2.8"/><path d="M12 13v3.5M8.5 20h7M9.5 20l.6-3.5h3.8l.6 3.5"/>',
  star: '<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-3.9 5.6-.8z" fill="currentColor"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 00-1.5-1.5H6A1.5 1.5 0 004.5 6v8A1.5 1.5 0 006 15.5h2.5"/>',
  exit: '<path d="M14 4.5h4a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 102.2-5.3"/><path d="M4.5 4.5v4h4"/>',
  flag: '<path d="M5.5 20.5V4M5.5 4.5h11l-2 4 2 4h-11"/>',
  building: '<rect x="4.5" y="3.5" width="10" height="17" rx="1"/><path d="M14.5 9.5h4a1 1 0 011 1v10h-5M8 7.5h3M8 11h3M8 14.5h3M9.5 20.5v-3"/>',
  key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5L19 4M16 7l2.5 2.5M14 9l2 2"/>',
  volume: '<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/>',
  mute: '<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  door: '<path d="M6 20.5V4.5A1 1 0 017 3.5h10a1 1 0 011 1v16M4 20.5h16"/><circle cx="14.5" cy="12.5" r="1" fill="currentColor"/>',
  chart: '<path d="M4 20h16M7 16v-4M11 16V8M15 16v-6M19 16V5"/>',
  zap: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
};

export function icon(name, size = 20, cls = '') {
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
