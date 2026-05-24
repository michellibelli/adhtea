// Input primitive — all text inputs and textareas go through here.
// To restyle inputs app-wide, edit this file only.
// Lifted-paper feel: thin border + layered drop shadow + top-edge
// highlight so the field reads as a card sitting above the cafe page
// background instead of fading into it.

const BASE = `
  w-full px-4 py-3.5 rounded-2xl
  bg-ui-input border border-ui-input-border
  text-ui-text placeholder:text-ui-subtext
  outline-none text-sm
  transition-colors duration-150
  focus:border-ui-input-focus
  pixel-input-lift
`

export function Input({ className = '', ...props }) {
  return (
    <input
      className={`${BASE} ${className}`}
      {...props}
    />
  )
}

export function Textarea({ className = '', rows = 3, ...props }) {
  return (
    <textarea
      rows={rows}
      className={`${BASE} resize-none leading-relaxed ${className}`}
      {...props}
    />
  )
}
