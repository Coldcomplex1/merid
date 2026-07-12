/** Simplified Chrome mark in the site's line-icon style (inherits currentColor,
 *  so it adapts to light/dark and to whatever button it sits in). */
export default function ChromeIcon({ className = '', size = 18 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="9.25" />
      <circle cx="12" cy="12" r="3.5" />
      {/* Spokes run tangent from the hub and stop exactly on the outer ring. */}
      <path d="M12 8.5h8.56M15.03 13.75l-4.28 7.42M8.97 13.75 4.69 6.34" />
    </svg>
  )
}
