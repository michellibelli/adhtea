// Warm the HTTP cache with the heavy images the first post-login screen (Focus)
// paints, while the user is still typing credentials. The backend is woken in
// parallel (App.jsx warmUp); this covers the *asset* half so the app doesn't
// pop in image-by-image right after login. Best-effort and idempotent — a
// prefetch that fails or 404s just doesn't warm that entry; nothing blocks.
//
// Paths (query strings included) must match the real references exactly, or the
// browser caches under a different key and the warm-up is wasted.

// Focus + tea-box art, used by both themes.
const SHARED = [
  '/flowers/teabag-watercolor.jpg',   // ~395KB — the biggest single win
  '/flowers/tea-cup-desat.png',
  '/flowers/tea-cup-desat.png?v=2',
  '/flowers/tea-kettle-desat.png?v=2',
  '/flowers/brush-wipe.webp',
  '/adhTeaLogo.png',
]

// Theme-specific backgrounds/frames. Keyed on ThemeContext's `aria_theme` ids.
const BY_THEME = {
  'aria-cafe': [
    '/bookshelf-bg.svg',
  ],
  'aria-linen': [
    '/linen-botanicals.svg',
    '/linen-flower-banner.png',
    '/flowers/wood-box-linen.png?v=5',
    '/flowers/wood-drawer-linen.png?v=3',
  ],
}

let _done = false

export function prefetchFirstScreenAssets() {
  if (_done || typeof Image === 'undefined') return
  _done = true

  const theme = localStorage.getItem('aria_theme')
  const list = [...SHARED, ...(BY_THEME[theme] || BY_THEME['aria-linen'])]

  for (const src of list) {
    // Assigning .src kicks off a background fetch the browser caches; the
    // Image is never attached to the DOM. Held only until load, then GC'd.
    const img = new Image()
    img.src = src
  }
}
