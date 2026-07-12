import { useState } from 'react'
import DemoExtensionPanel, {
  type PanelDataset,
  type PanelMode,
} from '../demo/DemoExtensionPanel'

/**
 * Self-contained showcase of the extension popup. Same pixel-faithful replica
 * the live demo uses, but with its own state so it can sit anywhere on the
 * site as a clickable illustration. Defaults mirror a fresh install.
 */
export default function ExtensionPanel({ className = '' }: { className?: string }) {
  const [dataset, setDataset] = useState<PanelDataset>('SAT')
  const [intensity, setIntensity] = useState(2)
  const [mode, setMode] = useState<PanelMode>('highlight')
  const [vieEng, setVieEng] = useState(true)
  const [engEng, setEngEng] = useState(false)
  const [enabled, setEnabled] = useState(true)

  return (
    <div className={`w-[340px] max-w-full ${className}`}>
      <DemoExtensionPanel
        dataset={dataset}
        onDataset={setDataset}
        intensity={intensity}
        onIntensity={setIntensity}
        mode={mode}
        onMode={setMode}
        vieEng={vieEng}
        onVieEng={setVieEng}
        engEng={engEng}
        onEngEng={setEngEng}
        enabled={enabled}
        onToggleEnabled={() => setEnabled((v) => !v)}
        onRevert={() => {}}
      />
    </div>
  )
}
