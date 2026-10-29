import type { ReactNode } from 'react';

/* Ikon dari prototipe (stroke 2px, 24x24). */
const S = (children: ReactNode, sw = 2) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const ICONS = {
  dashboard: S(<><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>),
  assets: S(<><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="m3 13 9 5 9-5" /><path d="m3 18 9 5 9-5" opacity=".5" /></>),
  tracking: S(<><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="10" r="2.5" /></>),
  opname: S(<><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="m8 12 3 3 5-6" /></>),
  laporan: S(<><path d="M3 3v18h18" /><path d="M7 15v2M11 11v6M15 13v4M19 7v10" /></>),
  health: S(<path d="M3 12h4l2-5 4 10 2-5h6" />),
  documents: S(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>),
  audit: S(<><path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>),
  spark: S(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />),
  search: S(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  plus: S(<path d="M12 5v14M5 12h14" />, 2.2),
  alert: S(<><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>),
  check: S(<><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>, 2.2),
  box: S(<><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>),
  user: S(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  stock: S(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>),
  wrench: S(<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.3-1.3a4 4 0 0 0-5-5L14 2" />),
  missing: S(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8.5 8.5l5 5M13.5 8.5l-5 5" /></>),
  close: S(<path d="M6 6l12 12M18 6 6 18" />, 2.2),
  download: S(<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>),
  info: S(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  qr: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 3h7v7H3V3Zm2 2v3h3V5H5Zm9-2h7v7h-7V3Zm2 2v3h3V5h-3ZM3 14h7v7H3v-7Zm2 2v3h3v-3H5Zm9-2h3v3h-3v-3Zm3 3h4v4h-3v-1h-1v-3Zm-3 1h2v3h-2v-3Zm5-4h2v2h-2v-2Z" />
    </svg>
  ),
  logo: S(<><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>, 2.2),
};

export type IconName = keyof typeof ICONS;
export const Icon = ({ name }: { name: IconName }) => ICONS[name];
