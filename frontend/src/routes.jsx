import { Navigate } from 'react-router-dom'
import Shell from './marketing/Shell'
import Home from './marketing/Home'
import Product from './marketing/Product'
import Evidence from './marketing/Evidence'
import Deploy from './marketing/Deploy'
import Security from './marketing/Security'
import About from './marketing/About'
import NotFound from './marketing/NotFound'
import Console from './console/Console'
import SessionProvider from './auth/Session'

// The whole address space in one place, so it can be read and tested rather
// than inferred from where useState happens to live.
//
// The console's six sections used to be component state, which meant /console
// was one URL for all of them: no deep link, no bookmark, and the back button
// left the console entirely instead of going back a section. They are routes
// now, so a section can be linked to and the back button behaves.

const console_ = <SessionProvider><Console /></SessionProvider>

export const routes = [
  {
    path: '/',
    element: <Shell />,
    // Any path that matches nothing lands here rather than on the router's
    // own error screen, which is a stack trace with the product's name
    // nowhere on it.
    errorElement: <Shell><NotFound /></Shell>,
    children: [
      { index: true, element: <Home /> },
      { path: 'product', element: <Product /> },
      { path: 'evidence', element: <Evidence /> },
      { path: 'deploy', element: <Deploy /> },
      { path: 'security', element: <Security /> },
      { path: 'about', element: <About /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  { path: '/console', element: <Navigate to="/console/queue" replace /> },
  { path: '/console/:view', element: console_ },
]
