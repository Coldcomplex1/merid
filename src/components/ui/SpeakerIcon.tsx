/** Same glyph the extension injects for its pronunciation button
 *  (SPEAKER_SVG in merid-extension-final/content.js), so the replica card and
 *  the deck show one recognisable "listen" mark. */
export default function SpeakerIcon({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4z" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        d="M15.2 9.4a3.6 3.6 0 0 1 0 5.2"
      />
    </svg>
  )
}
