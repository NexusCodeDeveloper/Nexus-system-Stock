import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AutenticacionProvider } from './context/AutenticacionContext'
import { ThemeProvider } from './context/ThemeContext'
import { LectorProvider } from './context/LectorContext'
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary'
import AlertProvider from './components/alerts'
import { registrarServiceWorker } from './services/GestorPush'
import { reportarError } from './utils/ReporteroErrores'
import './index.css'
import App from './App.jsx'

window.addEventListener('error', (event) => {
  reportarError(event.error || event.message, { lugar: 'window.onerror' })
})

window.addEventListener('unhandledrejection', (event) => {
  reportarError(event.reason, { lugar: 'unhandledrejection' })
})

registrarServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <LectorProvider>
        <ThemeProvider>
          <BrowserRouter>
            <AlertProvider>
              <AutenticacionProvider>
                <App />
              </AutenticacionProvider>
            </AlertProvider>
          </BrowserRouter>
        </ThemeProvider>
      </LectorProvider>
    </ErrorBoundary>
  </StrictMode>,
)
