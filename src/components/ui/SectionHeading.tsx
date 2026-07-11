interface SectionHeadingProps {
  eyebrow: string
  title: string
  sub?: string
  align?: 'center' | 'left'
}

export default function SectionHeading({ eyebrow, title, sub, align = 'center' }: SectionHeadingProps) {
  return (
    <div className={`max-w-2xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
      <p className="text-xs font-extrabold tracking-[0.22em] text-accent uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance text-heading sm:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-4 text-base text-body sm:text-lg">{sub}</p>}
    </div>
  )
}
