import type { ReactNode } from "react";

/**
 * Set de iconos propio: SVG en rejilla de 16×16, trazo uniforme y `currentColor`.
 * Sustituye a la mezcla de emoji y glifos unicode que teníamos — cada uno traía
 * su propio ancho y línea base, así que nada alineaba con su texto.
 *
 * Uso: `<Icon name="settings" />` dentro de un contenedor flex con `gap-2`,
 * nunca con un espacio literal en la cadena de texto.
 */
export type IconName =
  | "settings"
  | "sync"
  | "bell"
  | "device"
  | "today"
  | "map"
  | "grid"
  | "search"
  | "refresh"
  | "help"
  | "close"
  | "check"
  | "plus"
  | "trash"
  | "calendar"
  | "clock"
  | "flag"
  | "folder"
  | "chevronLeft"
  | "chevronRight"
  | "chevronDown"
  | "arrowLeft"
  | "external"
  | "jira"
  | "planner"
  | "ai"
  | "branch"
  | "dot"
  | "note"
  | "priority"
  | "qr"
  | "terminal"
  | "cube"
  | "star"
  | "orbit"
  | "inbox";

const PATHS: Record<IconName, ReactNode> = {
  // controles deslizantes: a 14px se lee mucho mejor que una rueda dentada
  settings: (
    <>
      <path d="M2.4 4.4h11.2M2.4 11.6h11.2" />
      <circle cx="6" cy="4.4" r="1.7" />
      <circle cx="10.4" cy="11.6" r="1.7" />
    </>
  ),
  sync: (
    <>
      <path d="M13.5 7A5.5 5.5 0 0 0 3.6 4.2" />
      <path d="M2.5 9a5.5 5.5 0 0 0 9.9 2.8" />
      <path d="M2.5 1.8v2.6h2.6M13.5 14.2v-2.6h-2.6" />
    </>
  ),
  bell: (
    <>
      <path d="M4 6.6a4 4 0 0 1 8 0c0 3 1.2 4 1.2 4H2.8S4 9.6 4 6.6Z" />
      <path d="M6.6 13.2a1.6 1.6 0 0 0 2.8 0" />
    </>
  ),
  device: (
    <>
      <rect x="4.5" y="1.8" width="7" height="12.4" rx="1.4" />
      <path d="M7.2 12.2h1.6" />
    </>
  ),
  today: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.4V8l2.6 1.6" />
    </>
  ),
  map: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M3.4 5.6C1.6 6.6.6 7.8 1 8.6c.7 1.4 4.4 1 8.3-1 3.9-2 6.5-4.8 5.8-6.2-.4-.8-1.9-.8-3.8-.2" />
    </>
  ),
  grid: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </>
  ),
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="4.6" />
      <path d="M10.6 10.6 14 14" />
    </>
  ),
  refresh: (
    <>
      <path d="M13.6 8a5.6 5.6 0 1 1-1.7-4" />
      <path d="M13.8 2.2v3.4h-3.4" />
    </>
  ),
  help: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M6.3 6.2a1.8 1.8 0 0 1 3.5.6c0 1.2-1.8 1.6-1.8 2.8" />
      <path d="M8 12.1h.01" />
    </>
  ),
  close: <path d="m3.6 3.6 8.8 8.8M12.4 3.6l-8.8 8.8" />,
  check: <path d="m3 8.4 3.4 3.4L13 4.6" />,
  plus: <path d="M8 3v10M3 8h10" />,
  trash: (
    <>
      <path d="M2.8 4.4h10.4M6 4.4V2.9h4v1.5" />
      <path d="M4.2 4.4 4.9 13a1 1 0 0 0 1 .9h4.2a1 1 0 0 0 1-.9l.7-8.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="2.2" y="3.2" width="11.6" height="10.6" rx="1.4" />
      <path d="M2.2 6.6h11.6M5.4 1.8v2.6M10.6 1.8v2.6" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.6V8l2.4 1.4" />
    </>
  ),
  flag: (
    <>
      <path d="M3.6 14V2.4" />
      <path d="M3.6 3.1h7.9l-1.4 2.6 1.4 2.6H3.6" />
    </>
  ),
  folder: <path d="M1.8 12.4V3.6a1 1 0 0 1 1-1h3.1l1.6 2h5.7a1 1 0 0 1 1 1v6.8a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1Z" />,
  chevronLeft: <path d="M10 3.2 5.2 8l4.8 4.8" />,
  chevronRight: <path d="m6 3.2 4.8 4.8L6 12.8" />,
  chevronDown: <path d="M3.2 6 8 10.8 12.8 6" />,
  arrowLeft: <path d="M13 8H3M7 3.6 2.6 8 7 12.4" />,
  external: (
    <>
      <path d="M9.2 2.6h4.2v4.2" />
      <path d="M13.4 2.6 7.8 8.2" />
      <path d="M12.2 9.6v3a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V4.8a1 1 0 0 1 1-1h3" />
    </>
  ),
  jira: <path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" />,
  planner: (
    <>
      <rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1.4" />
      <path d="m5 7.6 1.5 1.5 3.4-3.4" />
    </>
  ),
  ai: (
    <>
      <path d="M6 2.2 7 5l2.8 1-2.8 1L6 9.8 5 7 2.2 6 5 5Z" />
      <path d="M11.6 8.4l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6Z" />
    </>
  ),
  branch: (
    <>
      <circle cx="4.4" cy="3.6" r="1.8" />
      <circle cx="4.4" cy="12.4" r="1.8" />
      <circle cx="11.6" cy="6" r="1.8" />
      <path d="M4.4 5.4v5.2M9.8 7.2c0 2-1.6 2.6-3.2 3" />
    </>
  ),
  dot: <circle cx="8" cy="8" r="3.4" fill="currentColor" stroke="none" />,
  note: (
    <>
      <path d="M3.2 2.4h9.6v11.2H3.2z" />
      <path d="M5.6 5.6h4.8M5.6 8h4.8M5.6 10.4h3" />
    </>
  ),
  priority: <path d="M4 11.5 8 7l4 4.5" />,
  qr: (
    <>
      <rect x="2.2" y="2.2" width="4.4" height="4.4" rx="0.8" />
      <rect x="9.4" y="2.2" width="4.4" height="4.4" rx="0.8" />
      <rect x="2.2" y="9.4" width="4.4" height="4.4" rx="0.8" />
      <path d="M9.4 9.4h2v2h-2zM12.6 12.6h1.2v1.2h-1.2z" />
    </>
  ),
  terminal: (
    <>
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.4" />
      <path d="m4.8 6.4 2 1.8-2 1.8M8.6 10.4h3" />
    </>
  ),
  cube: (
    <>
      <path d="M8 1.8 14 5v6l-6 3.2L2 11V5Z" />
      <path d="M2 5l6 3.2L14 5M8 8.2v6" />
    </>
  ),
  star: <path d="m8 1.8 1.9 4 4.3.6-3.1 3 .7 4.3L8 11.7l-3.8 2 .7-4.3-3.1-3 4.3-.6Z" />,
  orbit: (
    <>
      <circle cx="8" cy="8" r="2.6" />
      <ellipse cx="8" cy="8" rx="6.2" ry="2.8" transform="rotate(-28 8 8)" />
    </>
  ),
  inbox: (
    <>
      <path d="M2 9.4h3.2l1 1.8h3.6l1-1.8H14" />
      <path d="M3.4 3.2h9.2l1.4 6.2v2.6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9.4Z" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  className = "",
  strokeWidth = 1.4,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
