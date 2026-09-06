const stroke = {
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
}

/* --------------------------------------------------------------------------
   Social icons (hero + footer)
   -------------------------------------------------------------------------- */
export const socialIcons = {
  Email: (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M4 6.5H20V17.5H4V6.5Z" {...stroke} strokeWidth="1.7" />
      <path d="M5 7L12 12.4L19 7" {...stroke} strokeWidth="1.7" />
    </svg>
  ),
  GitHub: (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M15.5 19.2V16.6C15.55 15.98 15.35 15.38 14.95 14.9C17.1 14.66 19.35 13.84 19.35 10.1C19.35 9.14 18.99 8.22 18.35 7.5C18.65 6.66 18.61 5.74 18.22 4.92C18.22 4.92 17.4 4.68 15.5 5.92C13.9 5.5 12.22 5.5 10.62 5.92C8.72 4.68 7.9 4.92 7.9 4.92C7.51 5.74 7.47 6.66 7.77 7.5C7.13 8.22 6.77 9.14 6.77 10.1C6.77 13.82 9.01 14.66 11.15 14.9C10.75 15.38 10.55 15.98 10.6 16.6V19.2"
        {...stroke}
        strokeWidth="1.55"
      />
      <path d="M10.6 17.2C8.7 17.8 7.15 17.2 6.45 15.55" {...stroke} strokeWidth="1.55" />
    </svg>
  ),
  LinkedIn: (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M7.7 10.1V18" {...stroke} strokeWidth="1.8" />
      <path d="M12 18V13.75C12 11.35 17.1 10.75 17.1 14.65V18" {...stroke} strokeWidth="1.8" />
      <path d="M7.7 7.4V7.35" {...stroke} strokeWidth="2.4" />
      <path d="M4.75 4.75H19.25V19.25H4.75V4.75Z" {...stroke} strokeWidth="1.5" />
    </svg>
  ),
  LeetCode: (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M13.9 5.2 8.1 11a1.6 1.6 0 0 0 0 2.3l5.8 5.5" {...stroke} strokeWidth="1.7" />
      <path d="M16.6 8 13.9 5.2" {...stroke} strokeWidth="1.7" />
      <path d="M10.4 12.2h8.2" {...stroke} strokeWidth="1.7" />
    </svg>
  ),
}

/* --------------------------------------------------------------------------
   Journey icons
   -------------------------------------------------------------------------- */
const journeyPaths = {
  steps: <path d="M5 18h3.5v-4H12v-4h3.5V6H19" {...stroke} strokeWidth="1.7" />,
  markup: <path d="m9 8-4 4 4 4M15 8l4 4-4 4M13 6l-2 12" {...stroke} strokeWidth="1.7" />,
  javascript: (
    <>
      <path
        d="M7.5 6.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"
        {...stroke}
        strokeWidth="1.6"
      />
      <path d="M11 10v3.6a1 1 0 0 1-1.9.4" {...stroke} strokeWidth="1.5" />
      <path d="M15.4 10.2a1.4 1.4 0 0 0-2.1 1.6c.5.9 2.1.7 2.3 1.8a1.4 1.4 0 0 1-2.2 1.2" {...stroke} strokeWidth="1.5" />
    </>
  ),
  dsa: (
    <>
      <path d="M12 4.6v3.2M7.2 12.6l2.6-2.2M16.8 12.6l-2.6-2.2" {...stroke} strokeWidth="1.6" />
      <circle cx="12" cy="6.2" r="1.9" {...stroke} strokeWidth="1.6" />
      <circle cx="6" cy="14.6" r="1.9" {...stroke} strokeWidth="1.6" />
      <circle cx="18" cy="14.6" r="1.9" {...stroke} strokeWidth="1.6" />
    </>
  ),
  react: (
    <>
      <circle cx="12" cy="12" r="1.7" {...stroke} strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="8" ry="3.2" {...stroke} strokeWidth="1.4" />
      <ellipse cx="12" cy="12" rx="8" ry="3.2" {...stroke} strokeWidth="1.4" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="8" ry="3.2" {...stroke} strokeWidth="1.4" transform="rotate(120 12 12)" />
    </>
  ),
  node: (
    <>
      <path d="M12 4.4 19 8.3v7.4L12 19.6 5 15.7V8.3l7-3.9Z" {...stroke} strokeWidth="1.6" />
      <path d="M9.6 14.2c0 .9.9 1.4 2.2 1.4 1.4 0 2.4-.5 2.4-1.6 0-2-4.4-1-4.4-3 0-1 .9-1.6 2.2-1.6 1.2 0 2.1.5 2.1 1.4" {...stroke} strokeWidth="1.5" />
    </>
  ),
  briefcase: (
    <>
      <path d="M4.5 8.5h15v10h-15v-10Z" {...stroke} strokeWidth="1.6" />
      <path d="M9 8.5V6.8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.7" {...stroke} strokeWidth="1.6" />
      <path d="M4.5 12.5h15" {...stroke} strokeWidth="1.4" />
    </>
  ),
  rocket: (
    <>
      <path
        d="M13.8 5.4c2.6-1 4.8-.8 4.8-.8s.2 2.2-.8 4.8c-.8 2.1-2.5 4-4.2 5.4l-3.1.6-2.1-2.1.6-3.1c1.4-1.7 3.3-3.4 5.4-4.2Z"
        {...stroke}
        strokeWidth="1.6"
      />
      <circle cx="14.4" cy="9.1" r="1.3" {...stroke} strokeWidth="1.5" />
      <path d="M8.4 15.6 6 18" {...stroke} strokeWidth="1.6" />
    </>
  ),
  graduation: (
    <>
      <path d="m12 5.5 8 3.6-8 3.6-8-3.6 8-3.6Z" {...stroke} strokeWidth="1.6" />
      <path d="M7.5 11v4.2c0 1 2 2.3 4.5 2.3s4.5-1.3 4.5-2.3V11" {...stroke} strokeWidth="1.6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 4.6 18.5 7v5c0 3.4-2.6 6-6.5 7.4C8.1 18 5.5 15.4 5.5 12V7L12 4.6Z" {...stroke} strokeWidth="1.6" />
      <path d="m9.5 12 1.8 1.8 3.4-3.6" {...stroke} strokeWidth="1.6" />
    </>
  ),
  today: (
    <>
      <circle cx="12" cy="12" r="7.2" {...stroke} strokeWidth="1.6" />
      <path d="M12 8.4V12l2.4 1.6" {...stroke} strokeWidth="1.6" />
    </>
  ),
}

export function JourneyIcon({ kind }) {
  return (
    <svg aria-hidden="true" className="about-journey__icon" fill="none" focusable="false" viewBox="0 0 24 24">
      {journeyPaths[kind] ?? journeyPaths.today}
    </svg>
  )
}

/* --------------------------------------------------------------------------
   Skills-tree icons
   -------------------------------------------------------------------------- */
export const skillIcons = {
  engineering: (
    <>
      <path d="m6.2 7.6-2-2 1.5-1.5 2 2" />
      <path d="M13.8 6.2a3.4 3.4 0 0 1-4.6 4.4l-4.5 4.5a1.4 1.4 0 0 0 2 2l4.5-4.5a3.4 3.4 0 0 0 4.4-4.6l-2 2-1.8-1.8 2-2Z" />
    </>
  ),
  terminal: (
    <>
      <path d="M2.8 4.4h14.4v11.2H2.8z" />
      <path d="m6 8 2.2 2L6 12" />
      <path d="M10.6 12.4h3.2" />
    </>
  ),
  'code-quality': (
    <>
      <path d="m6.6 7 -2.6 3 2.6 3" />
      <path d="m13.4 7 2.6 3-2.6 3" />
      <path d="m11.4 5.6-2.8 8.8" />
    </>
  ),
  backend: (
    <>
      <path d="M3.4 5.2h13.2v3.4H3.4z" />
      <path d="M3.4 11.4h13.2v3.4H3.4z" />
      <path d="M6.2 6.9h.01M6.2 13.1h.01" />
    </>
  ),
  api: (
    <>
      <path d="M4.1 5.2h11.8c.9 0 1.6.7 1.6 1.6v5c0 .9-.7 1.6-1.6 1.6H9.5L6 16v-2.6H4.1c-.9 0-1.6-.7-1.6-1.6v-5c0-.9.7-1.6 1.6-1.6Z" />
      <path d="M6.3 8.2h7.4" />
      <path d="M6.3 10.5h5.1" />
    </>
  ),
  security: (
    <>
      <path d="M10 2.8 16 5v4.4c0 3.1-2.4 5.6-6 6.8-3.6-1.2-6-3.7-6-6.8V5l6-2.2Z" />
      <path d="m7.7 9.7 1.6 1.6 3-3.2" />
    </>
  ),
  product: (
    <>
      <path d="M10 2.6 17 6.3v7.4L10 17.4 3 13.7V6.3l7-3.7Z" />
      <path d="M3 6.3 10 10l7-3.7M10 10v7.4" />
    </>
  ),
  'product-mindset': (
    <>
      <path d="M10 3.2a4.4 4.4 0 0 1 2.7 7.9c-.5.4-.8 1-.8 1.6v.5H8.1v-.5c0-.6-.3-1.2-.8-1.6A4.4 4.4 0 0 1 10 3.2Z" />
      <path d="M8.4 15.6h3.2M8.8 17.4h2.4" />
    </>
  ),
  delivery: (
    <>
      <path d="M2.6 6.4h8.6v7.2H2.6z" />
      <path d="M11.2 8.8h2.9l2.3 2.4v2.4h-5.2z" />
      <circle cx="6" cy="15.2" r="1.5" />
      <circle cx="13.6" cy="15.2" r="1.5" />
    </>
  ),
}

export function SkillIcon({ icon }) {
  if (!icon) return <span aria-hidden="true" className="skills-tree__folder" />
  return (
    <span aria-hidden="true" className={`skills-tree__icon skills-tree__icon--${icon}`}>
      <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
        {skillIcons[icon]}
      </svg>
    </span>
  )
}

/* --------------------------------------------------------------------------
   Small utility icons
   -------------------------------------------------------------------------- */
export const ChevronDown = ({ className }) => (
  <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 20 20">
    <path d="m5 7.5 5 5 5-5" {...stroke} strokeWidth="1.8" />
  </svg>
)

export const ArrowDown = () => (
  <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
    <path d="M10 5v10M10 15l-4.5-4.5M10 15l4.5-4.5" {...stroke} strokeWidth="1.8" />
  </svg>
)

export const ArrowUp = () => (
  <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 20 20" width="20">
    <path d="M10 15V5M10 5L5.5 9.5M10 5l4.5 4.5" {...stroke} strokeWidth="1.8" />
  </svg>
)

export const DownloadIcon = () => (
  <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
    <path d="M10 3.5v8.5M10 12l-3-3M10 12l3-3M4 14.5v1.5h12v-1.5" {...stroke} strokeWidth="1.7" />
  </svg>
)

export const SunIcon = () => (
  <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
    <circle cx="10" cy="10" r="3.6" {...stroke} strokeWidth="1.5" />
    <path d="M10 2.4v1.8M10 15.8v1.8M2.4 10h1.8M15.8 10h1.8M4.6 4.6l1.3 1.3M14.1 14.1l1.3 1.3M15.4 4.6l-1.3 1.3M5.9 14.1l-1.3 1.3" {...stroke} strokeWidth="1.5" />
  </svg>
)

export const MoonIcon = () => (
  <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
    <path d="M16 11.6A6.6 6.6 0 0 1 8.4 4a6.6 6.6 0 1 0 7.6 7.6Z" {...stroke} strokeWidth="1.5" />
  </svg>
)
