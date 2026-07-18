import { useState } from 'react'
import Reveal from '../components/ui/Reveal'
import InstallButton from '../components/ui/InstallButton'
import { useLang, usePageTitle } from '../i18n/LanguageContext'
import {
  FEEDBACK_COMMENT_MAX,
  submitUninstallFeedback,
  type FeedbackReason,
} from '../lib/feedback'

type SubmitState = 'idle' | 'sending' | 'done' | 'error' | 'empty'

/**
 * /goodbye - opened by Chrome right after the extension is uninstalled
 * (chrome.runtime.setUninstallURL). An anonymous exit survey: reasons +
 * optional comment, written once to the write-only `feedback` collection.
 */
export default function Goodbye() {
  const { t, lang } = useLang()
  const s = t.goodbye
  usePageTitle(t.meta.goodbyeTitle)

  const [picked, setPicked] = useState<Set<FeedbackReason>>(new Set())
  const [comment, setComment] = useState('')
  const [state, setState] = useState<SubmitState>('idle')

  const toggle = (id: FeedbackReason) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    if (state === 'empty') setState('idle')
  }

  const submit = async () => {
    if (state === 'sending' || state === 'done') return
    const reasons = [...picked]
    if (reasons.length === 0 && !comment.trim()) {
      setState('empty')
      return
    }
    setState('sending')
    try {
      await submitUninstallFeedback({ reasons, comment, lang })
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(640px circle at 50% 0%, rgb(245 197 66 / 0.08), transparent 62%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-3xl px-5 py-20 sm:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-extrabold tracking-[0.22em] text-accent uppercase">{s.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance text-heading sm:text-5xl">
            {s.title}
          </h1>
          <p className="mt-4 text-lg text-body">{s.sub}</p>
        </div>

        {/* Survey */}
        <Reveal>
          <section className="mt-14 rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
            {state === 'done' ? (
              <div className="py-6 text-center" role="status">
                <h2 className="text-3xl font-extrabold tracking-tight text-heading">{s.thanksTitle}</h2>
                <p className="mx-auto mt-4 max-w-md text-body">{s.thanksBody}</p>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
                  {s.surveyTitle}
                </h2>
                <p className="mt-2 text-sm text-body">{s.surveyIntro}</p>

                <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {s.reasons.map((reason) => {
                    const on = picked.has(reason.id)
                    return (
                      <label
                        key={reason.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors ${
                          on
                            ? 'border-accent bg-accent/10 text-heading'
                            : 'border-line text-body hover:border-line-strong'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(reason.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-gold-400,#f5c542)]"
                        />
                        <span>{reason.label}</span>
                      </label>
                    )
                  })}
                </div>

                <label className="mt-6 block">
                  <span className="text-sm font-bold text-heading">{s.commentLabel}</span>
                  <textarea
                    value={comment}
                    onChange={(e) => {
                      setComment(e.target.value)
                      if (state === 'empty') setState('idle')
                    }}
                    maxLength={FEEDBACK_COMMENT_MAX}
                    rows={4}
                    placeholder={s.commentPlaceholder}
                    className="mt-2 w-full resize-y rounded-xl border-2 border-line bg-canvas p-3 text-sm text-heading placeholder:text-body/50 focus:border-accent focus:outline-none"
                  />
                </label>

                {state === 'empty' && (
                  <p className="mt-3 text-sm font-semibold text-accent" role="alert">{s.pickOne}</p>
                )}
                {state === 'error' && (
                  <p className="mt-3 text-sm font-semibold text-red-500" role="alert">{s.error}</p>
                )}

                <button
                  type="button"
                  onClick={submit}
                  disabled={state === 'sending'}
                  className="mt-6 inline-flex items-center justify-center rounded-full bg-gold-400 px-7 py-3 text-base font-bold text-navy-900 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-gold-300 hover:shadow-lift active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {state === 'sending' ? s.submitting : s.submit}
                </button>
              </>
            )}
          </section>
        </Reveal>

        {/* The three features that answer the top uninstall reasons */}
        <Reveal>
          <section className="mt-8 rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-10">
            <h2 className="text-2xl font-extrabold tracking-tight text-heading">{s.tipsTitle}</h2>
            <ul className="mt-5 space-y-3 text-[15px] leading-relaxed text-body">
              {s.tips.map((tip) => (
                <li key={tip.term} className="flex gap-3">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
                  <span>
                    <span className="font-bold text-heading">{tip.term}</span> {tip.text}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>

        {/* Reinstall CTA */}
        <Reveal>
          <div className="mt-16 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-heading">{s.reinstallTitle}</h2>
            <p className="mx-auto mt-3 max-w-md text-body">{s.reinstallBody}</p>
            <div className="mt-6">
              <InstallButton label={s.ctaReinstall} variant="primary" />
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
