import React from 'react'
import ReactDOM from 'react-dom/client'
import { LucideProvider } from 'lucide-react'
import { App } from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {/* One stroke weight for every icon in the product. Size-specific tuning
        lives in global.css so no single call site can drift. */}
    <LucideProvider strokeWidth={1.75}>
      <App />
    </LucideProvider>
  </React.StrictMode>
)
