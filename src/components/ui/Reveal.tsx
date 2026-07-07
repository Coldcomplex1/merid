import type { ReactNode } from 'react'
import { useInView } from '../../hooks/useInView'

interface RevealProps {
  children: ReactNode
  delay?: number
  className?: string
}

/** Fades content up once it scrolls into view. */
export default function Reveal({ children, delay = 0, className = '' }: RevealProps) {
  const { ref, inView } = useInView()

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        inView ? 'translate-y-0 opacity-100' : 'translate-y-7 opacity-0'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}
