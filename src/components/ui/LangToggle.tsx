import { useLang } from '../../i18n/LanguageContext'
import type { Lang } from '../../i18n/translations'

const OPTIONS: { value: Lang; label: string; aria: string }[] = [
  { value: 'vi', label: 'VI', aria: 'Tiếng Việt' },
  { value: 'en', label: 'EN', aria: 'English' },
]

/** Segmented VI | EN switch, styled like the extension's dataset buttons. */
export default function LangToggle() {
  const { lang, setLang } = useLang()

  return (
    <div
      role="group"
      aria-label="Language / Ngôn ngữ"
      className="flex shrink-0 rounded-full bg-navy-800 p-0.5 ring-1 ring-navy-600/60"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          lang={opt.value}
          aria-label={opt.aria}
          aria-pressed={lang === opt.value}
          onClick={() => setLang(opt.value)}
          className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide transition-all duration-200 active:scale-95 ${
            lang === opt.value
              ? 'bg-gold-400 text-navy-900'
              : 'text-navy-200 hover:text-cream-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
