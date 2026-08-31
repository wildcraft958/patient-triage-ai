import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import SessionProvider from './Session'
import SignIn from './SignIn'
import { useSession } from './sessionContext'

function Gate() {
  const { signOut } = useSession()
  const navigate = useNavigate()

  useEffect(() => { signOut() }, [signOut])

  return <SignIn onAuthenticated={() => navigate('/console/queue')} />
}

export default function SignInRoute() {
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  )
}
