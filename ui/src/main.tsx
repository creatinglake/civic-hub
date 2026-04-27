import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted variable fonts. Bundled by Vite — no external CDN call.
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/manrope/index.css'
import './styles/theme.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
