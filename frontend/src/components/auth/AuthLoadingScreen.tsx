import React, { useEffect, useState } from 'react'

/** After this long the screen says why it is still waiting. */
export const AUTH_SLOW_HINT_MS = 2500

// Shown while the session is being restored. A backend waking from idle can
// take several seconds to answer, so after a moment the screen says so
// instead of looking stuck (the check gives up after
// AUTH_RESTORE_TIMEOUT_MS, see AuthContext).
const AuthLoadingScreen: React.FC = () => {
  const [isSlow, setIsSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), AUTH_SLOW_HINT_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="text-center" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
        {isSlow && (
          <p className="mt-2 text-sm text-gray-500 max-w-xs mx-auto">
            Connecting to the server. This can take a few seconds when it has been idle.
          </p>
        )}
      </div>
    </div>
  )
}

export default AuthLoadingScreen
