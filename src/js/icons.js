// Ícones SVG inline (stroke), no mesmo espírito dos do GymRats.
const s = (d, extra = "") =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const icons = {
  // topbar
  menu: s('<path d="M3 7h13"/><path d="M3 13h7"/>', 'stroke-width="2.4"'),
  bell: s('<path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.5 20a2 2 0 0 0 3 0"/>'),
  dots: s('<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
  back: s('<path d="M15 5l-7 7 7 7"/>', 'stroke-width="2.2"'),
  chevron: s('<path d="M9 5l7 7-7 7"/>'),
  chevronDown: s('<path d="M6 9l6 6 6-6"/>'),
  gear: s('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>', 'stroke-width="1.6"'),
  refresh: s('<path d="M20 11a8 8 0 1 0-1.6 5.4"/><path d="M20 4v6h-6"/>'),

  // tabbar
  details: s('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="10" r="2"/><path d="M5.5 16.2c.6-1.5 1.7-2.2 3-2.2s2.4.7 3 2.2"/><path d="M15 9.5h4M15 13h4"/>', 'stroke-width="1.7"'),
  medal: s('<circle cx="12" cy="9" r="5.2"/><path d="M9.4 13.6L8 21l4-2.2L16 21l-1.4-7.4"/>', 'stroke-width="1.7"'),
  chat: s('<path d="M21 11.5a8 8 0 0 1-8.5 8 9 9 0 0 1-3.4-.6L4 21l1.4-4.2A8 8 0 0 1 12.5 3.5 8 8 0 0 1 21 11.5z"/>', 'stroke-width="1.7"'),

  // ações
  plus: s('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.6"'),
  check: s('<path d="M4 12.5l5.2 5.2L20 7"/>', 'stroke-width="2.4"'),
  checkSmall: s('<path d="M5 12.5l4.4 4.4L19 7.5"/>', 'stroke-width="3"'),
  close: s('<path d="M6 6l12 12M18 6L6 18"/>', 'stroke-width="2.2"'),
  pencil: s('<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/>', 'stroke-width="1.9"'),
  trash: s('<path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/>', 'stroke-width="1.8"'),
  share: s('<path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"/>', 'stroke-width="1.9"'),
  exit: s('<path d="M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14"/><path d="M17 8l4 4-4 4"/><path d="M21 12H10"/>', 'stroke-width="1.9"'),
  clipboard: s('<rect x="5" y="4.5" width="14" height="16" rx="2"/><rect x="9" y="2.5" width="6" height="4" rx="1.4"/><path d="M9 11h6M9 15h4"/>', 'stroke-width="1.7"'),
  copy: s('<rect x="9" y="9" width="12" height="12" rx="2.4"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>', 'stroke-width="1.8"'),

  // câmera / mídia
  camera: s('<path d="M4 8h3l1.6-2.4h6.8L17 8h3a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 8z"/><circle cx="12" cy="13.5" r="3.6"/>', 'stroke-width="1.8"'),
  image: s('<rect x="3" y="5" width="18" height="14" rx="2.2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 17l4.8-4.5a1.6 1.6 0 0 1 2.2 0L16 17"/><path d="M14.5 14.8l1.6-1.5a1.6 1.6 0 0 1 2.2 0L21 16"/>', 'stroke-width="1.8"'),
  flip: s('<path d="M20 11a8 8 0 0 0-13.7-5.3L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 13.7 5.3L20 16"/><path d="M20 20v-4h-4"/>', 'stroke-width="1.9"'),
  flashOff: s('<path d="M13 2L5 13h5l-1 9 5-7"/><path d="M3 3l18 18"/>', 'stroke-width="1.9"'),

  // dados
  clock: s('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/>', 'stroke-width="1.9"'),
  calendar: s('<rect x="3.5" y="5" width="17" height="16" rx="2.2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', 'stroke-width="1.8"'),
  pin: s('<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>', 'stroke-width="1.8"'),
  filter: s('<path d="M3 5h18l-7 8v6l-4-2v-4z"/>', 'stroke-width="1.9"'),
  sort: s('<path d="M4 7h16M6 12h12M9 17h6"/>', 'stroke-width="2.1"'),
  bolt: s('<path d="M13 2L5 13h5l-1 9 8-11h-5l1-9z"/>', 'stroke-width="1.8"'),
  target: s('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>', 'stroke-width="1.8"'),
  fire: s('<path d="M12 22c4 0 6.5-2.6 6.5-6 0-4.4-4.2-6.4-3.4-11-2.6.9-4.2 3-4.2 5.2 0 1.3-.7 2-1.6 2-.8 0-1.4-.6-1.6-1.6C6.4 12 5.5 13.6 5.5 16c0 3.4 2.5 6 6.5 6z"/>', 'stroke-width="1.8"'),
  emojiPlus: s('<path d="M20.9 13a9 9 0 1 1-8.4-9.9"/><path d="M8.5 14.5a4.6 4.6 0 0 0 6.2.9"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="10" r="1" fill="currentColor" stroke="none"/><path d="M18 3v5M20.5 5.5h-5"/>', 'stroke-width="1.8"'),

  // marca
  fork: s('<path d="M7 3v6a2.5 2.5 0 0 0 5 0V3"/><path d="M9.5 11v10"/><path d="M17.5 3c-1.6 1-2.5 3-2.5 5.5s.9 3.5 2.5 3.5V21"/>', 'stroke-width="2"'),
  chevrons: s('<path d="M5 6l6 6-6 6"/><path d="M13 6l6 6-6 6"/>', 'stroke-width="2.6"'),
};

export function icon(name, size) {
  const svg = icons[name] || "";
  if (!size) return svg;
  return svg.replace('width="24" height="24"', `width="${size}" height="${size}"`);
}
