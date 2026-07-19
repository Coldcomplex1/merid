import { useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'

type Stage = 'studio' | 'modal' | 'copied' | 'merid' | 'done'

const FAKE_KEY = 'AIzaSyD3m0Key–•••••••••••••••••••'

/**
 * A click-through rehearsal of the real flow: Google AI Studio's "Create API
 * key" → copy the key → paste + save inside Merid's settings. Nothing real is
 * created; the point is that the visitor's hands already know the three
 * clicks before they do them for real.
 */
export default function AiStudioSimulator() {
  const { t } = useLang()
  const s = t.apiKeyGuide.sim
  const [stage, setStage] = useState<Stage>('studio')

  const stepIndex = stage === 'studio' ? 0 : stage === 'modal' || stage === 'copied' ? 1 : 2
  const hints = [s.step1Hint, s.step2Hint, s.step3Hint]
  const inMerid = stage === 'merid' || stage === 'done'

  return (
    <div className="w-full">
      {/* Progress dots + hint */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i < stepIndex ? 'w-2 bg-success' : i === stepIndex ? 'w-6 bg-gold-400' : 'w-2 bg-line-strong'
              }`}
            />
          ))}
        </div>
        <p className="text-xs font-bold text-accent" role="status">
          {stage === 'done' ? s.done : hints[stepIndex]}
        </p>
      </div>

      {/* Fake browser */}
      <div className="overflow-hidden rounded-2xl shadow-card ring-1 ring-navy-600/40">
        <div className="flex items-center gap-2 bg-cream-100 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f26d5f]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f5c14e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#5ec269]" />
          <div className="ml-2 flex-1 truncate rounded-full bg-white/85 px-3 py-1 text-[11px] text-navy-500">
            {inMerid ? 'chrome-extension://merid/options.html' : 'aistudio.google.com/apikey'}
          </div>
        </div>

        {/* ── Google AI Studio ── */}
        {!inMerid && (
          <div className="relative bg-white px-5 py-6">
            <p className="text-[11px] font-bold tracking-wide text-[#5f6368] uppercase">Google AI Studio</p>
            <h4 className="mt-1 text-lg font-bold text-[#202124]">API keys</h4>
            <p className="mt-1 text-[12px] text-[#5f6368]">
              Quickly test the Gemini API in your apps.
            </p>
            <button
              type="button"
              onClick={() => stage === 'studio' && setStage('modal')}
              disabled={stage !== 'studio'}
              className={`mt-4 cursor-pointer rounded-lg bg-[#1a73e8] px-4 py-2 text-[13px] font-bold text-white transition-all hover:bg-[#1765cc] active:scale-95 disabled:cursor-default disabled:opacity-50 ${
                stage === 'studio' ? 'animate-pulse-soft' : ''
              }`}
            >
              + Create API key
            </button>

            {/* Key-created dialog */}
            {(stage === 'modal' || stage === 'copied') && (
              <div className="animate-card-in absolute inset-x-4 top-3 z-10 rounded-xl bg-white p-4 shadow-pop ring-1 ring-black/15">
                <h5 className="text-[14px] font-bold text-[#202124]">API key created</h5>
                <p className="mt-1 text-[11px] text-[#5f6368]">
                  Keep it secret - anyone with this key can use your quota.
                </p>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#f1f3f4] px-3 py-2">
                  <code className="min-w-0 flex-1 truncate text-[11px] text-[#202124]">{FAKE_KEY}</code>
                  <button
                    type="button"
                    onClick={() => {
                      if (stage !== 'modal') return
                      setStage('copied')
                      window.setTimeout(() => setStage('merid'), 900)
                    }}
                    className={`shrink-0 cursor-pointer rounded-md px-3 py-1.5 text-[11px] font-bold transition-all active:scale-95 ${
                      stage === 'copied'
                        ? 'bg-[#188038] text-white'
                        : 'animate-pulse-soft bg-[#1a73e8] text-white hover:bg-[#1765cc]'
                    }`}
                  >
                    {stage === 'copied' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Merid settings ── */}
        {inMerid && (
          <div className="bg-[#0a192f] px-5 py-6">
            <p className="text-[11px] font-extrabold tracking-[0.12em] text-[#f4be37] uppercase">
              AI context check (beta)
            </p>
            <label className="mt-3 block text-[12px] font-semibold text-[#e6f1ff]">
              Gemini API key
              <span className="mt-1.5 flex items-center gap-2 rounded-lg bg-[#1d2d50] px-3 py-2">
                <code className="animate-word-swap min-w-0 flex-1 truncate text-[11px] text-[#e6f1ff]">
                  {FAKE_KEY}
                </code>
              </span>
            </label>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => stage === 'merid' && setStage('done')}
                disabled={stage === 'done'}
                className={`cursor-pointer rounded-md bg-[#f4be37] px-4 py-1.5 text-[12px] font-extrabold text-[#020c1b] transition-all hover:brightness-105 active:scale-95 disabled:cursor-default ${
                  stage === 'merid' ? 'animate-pulse-soft' : ''
                }`}
              >
                Save key
              </button>
              {stage === 'done' && (
                <span className="animate-pop-in rounded-full bg-[#188038]/20 px-3 py-1.5 text-[11px] font-extrabold text-[#7ee2a8]">
                  AI Context Check: ON ✓
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {stage === 'done' && (
        <div className="mt-3 text-right">
          <button
            type="button"
            onClick={() => setStage('studio')}
            className="cursor-pointer text-xs font-bold text-muted underline-offset-2 hover:text-heading hover:underline"
          >
            {s.replay}
          </button>
        </div>
      )}
    </div>
  )
}
