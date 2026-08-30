import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import Shell from './marketing/Shell'
import Home from './marketing/Home'
import Product from './marketing/Product'
import Evidence from './marketing/Evidence'
import Deploy from './marketing/Deploy'
import Security from './marketing/Security'
import About from './marketing/About'
import Console from './console/Console'
import SessionProvider from './auth/Session'
import ThemeProvider from './theme/ThemeProvider'
import AppBoundary from './AppBoundary'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'product', element: <Product /> },
      { path: 'evidence', element: <Evidence /> },
      { path: 'deploy', element: <Deploy /> },
      { path: 'security', element: <Security /> },
      { path: 'about', element: <About /> },
    ],
  },
  {
    path: '/console',
    element: <SessionProvider><Console /></SessionProvider>,
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppBoundary>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </AppBoundary>
  </StrictMode>,
)
