import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "../api/client"
import { useAuthStore } from "../stores/auth"
import { Button, Input } from "../components/ui"

export function ForcePasswordChangePage() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const user = useAuthStore((s) => s.user)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await api.post("/auth/change-password", { password })
      if (user) {
        setUser({ ...user, force_password_change: false })
      }
      navigate("/")
    } catch {
      setError("Could not change your password. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark">⬥</div>
        <h1>Change password</h1>
        <p>You must set a new password before continuing.</p>
        <label>
          New password
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
        <label>
          Confirm password
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Set password & continue"}
        </Button>
      </form>
    </main>
  )
}
