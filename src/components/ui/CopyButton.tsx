import { useEffect, useRef, useState } from 'react'

interface CopyButtonProps {
  /** Text placed on the clipboard when clicked. */
  text: string
  label: string
  copiedLabel: string
  className?: string
}

/** Gold-pill button that copies `text` to the clipboard and confirms inline
 *  for a couple of seconds. Falls back to a hidden textarea + execCommand for
 *  browsers where the async clipboard API is unavailable. */
export default function CopyButton({ text, label, copiedLabel, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-6 py-2.5 text-sm font-bold text-navy-900 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-gold-300 hover:shadow-lift active:scale-95 ${className}`}
    >
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? copiedLabel : label}
    </button>
  )
}
