import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { login, register, registerAdmin } from '../api/endpoints'
import toast from 'react-hot-toast'
import { Activity, LogIn, UserPlus, ArrowLeft } from 'lucide-react'

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isAdminRegister, setIsAdminRegister] = useState(false)
  const [adminKey, setAdminKey] = useState('')
  const { loginUser } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    setLoading(true)
    try {
      let res
      if (isRegister) {
        if (isAdminRegister) {
          if (!adminKey.trim()) {
            toast.error('Please enter the admin key')
            setLoading(false)
            return
          }
          res = await registerAdmin(username, password, adminKey)
        } else {
          res = await register(username, password)
        }
      } else {
        res = await login(username, password)
      }
      loginUser(res.data.access_token)
      toast.success(isRegister ? 'Account created!' : 'Welcome back!')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card slide-up">
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 24, textDecoration: 'none' }}>
          <ArrowLeft size={14} /> Back to Home
        </Link>
        <div className="login-header">
          <div className="login-logo">
            <Activity size={28} />
          </div>
          <h1>SpikeIQ</h1>
          <p>Real-time market intelligence platform</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Username</label>
            <input
              id="login-username"
              className="input"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input
              id="login-password"
              className="input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {isRegister && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  style={{ width: 14, height: 14 }}
                  checked={isAdminRegister}
                  onChange={(e) => setIsAdminRegister(e.target.checked)}
                />
                Register as Administrator
              </label>
            </div>
          )}

          {isRegister && isAdminRegister && (
            <div className="input-group">
              <label>Admin Access Key</label>
              <input
                id="admin-key"
                className="input"
                type="password"
                placeholder="Enter admin verification key"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
              />
            </div>
          )}

          <button
            id="login-submit"
            className="btn btn-primary btn-lg"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
            ) : isRegister ? (
              <><UserPlus size={18} /> Create Account</>
            ) : (
              <><LogIn size={18} /> Sign In</>
            )}
          </button>
        </form>

        <div className="login-divider">or</div>

        <button
          className="btn btn-ghost"
          style={{ width: '100%' }}
          onClick={() => {
            setIsRegister(!isRegister)
            setIsAdminRegister(false)
            setAdminKey('')
          }}
        >
          {isRegister ? 'Already have an account? Sign In' : 'New here? Create Account'}
        </button>
      </div>
    </div>
  )
}
