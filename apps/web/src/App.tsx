import { useState, useEffect } from 'react'
import './App.css'

interface User {
  id: string
  role: string
  name: string
}

interface ApiResponse {
  user: User
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const apiUrl = import.meta.env.VITE_EMBER_API_URL || 'http://localhost:8080'

  useEffect(() => {
    fetch(`${apiUrl}/me`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return response.json() as Promise<ApiResponse>
      })
      .then(data => {
        setUser(data.user)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [apiUrl])

  return (
    <div className="app">
      <header className="header">
        <h1>🔥 EMBER</h1>
        <p className="subtitle">Many eyes, one fire</p>
      </header>

      <main className="main">
        <div className="card">
          <h2>Phase 1 Walking Skeleton</h2>
          <p>
            Voice and camera AI fire commander for village volunteer firefighters.
          </p>

          <div className="status-section">
            <h3>API Connection</h3>
            {loading && <p className="status loading">Connecting to ember-api...</p>}
            {error && (
              <p className="status error">
                Failed to connect: {error}
                <br />
                <small>Endpoint: {apiUrl}/me</small>
              </p>
            )}
            {user && (
              <div className="status success">
                <p>✓ Connected to ember-api</p>
                <div className="user-info">
                  <p><strong>User:</strong> {user.name}</p>
                  <p><strong>Role:</strong> {user.role}</p>
                  <p><strong>ID:</strong> {user.id}</p>
                </div>
              </div>
            )}
          </div>

          <div className="status-section">
            <h3>Google Sign-In</h3>
            <button className="button" disabled>
              Sign in with Google (Coming Soon)
            </button>
            <p className="note">
              Firebase Authentication will be integrated in Phase 2.
            </p>
          </div>
        </div>

        <div className="info-card">
          <h3>What's Next?</h3>
          <ul>
            <li>Firebase Authentication (Google sign-in)</li>
            <li>Push-to-talk voice interface</li>
            <li>Camera frame streaming</li>
            <li>Incident map and task cards</li>
            <li>Supervisor console</li>
          </ul>
        </div>
      </main>

      <footer className="footer">
        <p>Built for Google Cloud AI Builder Cup 2026</p>
        <p>Apache-2.0 License</p>
      </footer>
    </div>
  )
}

export default App
