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
      <path d="M12 8.5h9M8.6 10.1 4.2 5.6M11 15.2 6.6 22" />
    </svg>
  )
}
