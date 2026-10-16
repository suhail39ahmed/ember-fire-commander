import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider'
import { LanguageProvider } from './pwa/LanguageProvider'
import { startInstallCapture } from './pwa/install/installPrompt'
import { getAppThemeStore } from './pwa/theme'
import './index.css'

getAppThemeStore() // sets data-theme from the saved choice before the first paint
startInstallCapture() // the browser offers installation once, early; keep it for the volunteer screen

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
)
