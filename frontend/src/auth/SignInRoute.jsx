import { Navigate, useNavigate } from 'react-router-dom'
import SessionProvider from './Session'
import SignIn from './SignIn'
import { useSession } from './sessionContext'

function Gate() {
  const { user } = useSession()
  const navigate = useNavigate()

  if (user) return <Navigate to="/console/queue" replace />

  return <SignIn onAuthenticated={() => navigate('/console/queue')} />
}

export default function SignInRoute() {
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  )
}
