import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import Shell from './marketing/Shell'
import Home from './marketing/Home'
import Product from './marketing/Product'
import Evidence from './marketing/Evidence'
import Security from './marketing/Security'
import About from './marketing/About'
import Console from './console/Console'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'product', element: <Product /> },
      { path: 'evidence', element: <Evidence /> },
      { path: 'security', element: <Security /> },
      { path: 'about', element: <About /> },
    ],
  },
  { path: '/console', element: <Console /> },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
