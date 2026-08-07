import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are self-hosted, so no third-party request on page load. Each weight
// file already carries every subset it needs, Vietnamese included.
//
// The italic faces are imported because we actually use italics - parts of
// speech, example sentences, learning-card hints - and until now none was
// loaded. A missing italic does not fall back to another font; the browser
// slants the upright one instead, and a mechanical slant does visible damage
// to Vietnamese, where the tone marks shear away from the vowels they belong to.
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/500.css'
import '@fontsource/be-vietnam-pro/600.css'
import '@fontsource/be-vietnam-pro/700.css'
import '@fontsource/be-vietnam-pro/800.css'
import '@fontsource/be-vietnam-pro/400-italic.css'
import '@fontsource/lora/600.css'
import '@fontsource/lora/700.css'
import '@fontsource/lora/400-italic.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
