// SVG stroke icons (no emoji) + drawn fallbacks for menu photos.

const PATHS = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  back: 'M15 5l-7 7 7 7',
  cart: 'M3 4h2.5l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.3M10 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  receipt: 'M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21zM9 8h6M9 12h6M9 16h3',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  sound: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  mute: 'M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  printer: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  alert: 'M12 3l10 18H2zM12 10v4M12 17.5v.01',
  cash: 'M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6 10v.01M18 14v.01',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2',
  pencil: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  chef: 'M7 14v6h10v-6M7 14a4 4 0 0 1-.5-7.9A5 5 0 0 1 12 3a5 5 0 0 1 5.5 3.1A4 4 0 0 1 17 14zM7 17h10',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  wifiOff: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M12 20h.01M19 13a10 10 0 0 0-2.1-1.6M2 9.5a15 15 0 0 1 4.2-2.6M22 9.5A15 15 0 0 0 11 5.1',
}

export function Icon({ name, size = 24, label, className = '', strokeWidth = 2 }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

// Drawn placeholders, 16:10
function Bowl() {
  return (
    <svg className="art" viewBox="0 0 160 100" aria-hidden="true">
      <rect width="160" height="100" fill="var(--surface-2)" />
      <ellipse cx="80" cy="54" rx="50" ry="10" fill="#E9C46A" opacity=".55" />
      <path d="M30 54h100a50 30 0 0 1-100 0z" fill="var(--surface)" stroke="var(--leaf)" strokeWidth="3" />
      <path d="M44 52c6-6 10 4 16-2s10 4 16-2 10 4 16-2 10 4 14-1" fill="none" stroke="#C9822B" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 40c3-6-1-10 2-16M80 40c3-6-1-10 2-16M100 40c3-6-1-10 2-16" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" opacity=".7" />
      <path d="M118 44l26-22" stroke="var(--curry)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function Plate() {
  return (
    <svg className="art" viewBox="0 0 160 100" aria-hidden="true">
      <rect width="160" height="100" fill="var(--surface-2)" />
      <ellipse cx="80" cy="60" rx="56" ry="20" fill="var(--surface)" stroke="var(--leaf)" strokeWidth="3" />
      <ellipse cx="80" cy="58" rx="38" ry="12" fill="none" stroke="var(--line)" strokeWidth="2" />
      <circle cx="68" cy="54" r="9" fill="#C9822B" />
      <circle cx="86" cy="52" r="9" fill="#B36E22" />
      <circle cx="78" cy="62" r="9" fill="#D69440" />
      <path d="M100 50c6-4 14-2 16 4" fill="none" stroke="var(--leaf)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function Glass() {
  return (
    <svg className="art" viewBox="0 0 160 100" aria-hidden="true">
      <rect width="160" height="100" fill="var(--surface-2)" />
      <path d="M62 22h36l-5 64H67z" fill="var(--surface)" stroke="var(--leaf)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M65 44h30l-3 40H68z" fill="#E3A019" opacity=".55" />
      <path d="M86 12l-6 40" stroke="var(--chili)" strokeWidth="3" strokeLinecap="round" />
      <rect x="70" y="50" width="8" height="8" rx="2" fill="#fff" opacity=".7" />
      <rect x="80" y="58" width="8" height="8" rx="2" fill="#fff" opacity=".7" />
    </svg>
  )
}

export function MenuArt({ item }) {
  if (item.image_url) return <img src={item.image_url} alt="" loading="lazy" />
  if (item.category === 'drink') return <Glass />
  if (item.category === 'side') return <Plate />
  return <Bowl />
}
