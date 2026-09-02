import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { authApi } from "../api/client"
import { useAuthStore } from "../stores/auth"
import { Button, Input } from "../components/ui"

export function LoginPage() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false)
  const navigate = useNavigate(); const location = useLocation(); const setUser = useAuthStore(s => s.setUser)
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const { data } = await authApi.login(email, password); const { user: u, role, force_password_change } = data; setUser({ ...u, role, force_password_change }); navigate((location.state as { from?: string } | null)?.from || "/") } catch { setError("We could not sign you in. Check your email and password.") } finally { setBusy(false) } }
  return <main className="login-page"><form className="login-card" onSubmit={submit}><div className="brand-mark">⬥</div><h1>PO TRACK</h1><p>Sign in to manage purchase orders.</p><label>Email<Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label><label>Password<Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button></form></main>
}
