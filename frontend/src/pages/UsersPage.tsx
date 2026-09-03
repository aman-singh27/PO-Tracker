import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { usersApi } from "../api/client"
import { Button, Card, Input } from "../components/ui"
import { toast } from "sonner"

type User = {
  id: number
  email: string
  name: string
  role: string
  is_active: boolean
  force_password_change: boolean
}

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ email: "", password: "", name: "", role: "staff" })

  useEffect(() => {
    loadUsers()
  }, [])

  function loadUsers() {
    usersApi.list().then(r => setUsers(r.data)).catch(() => setError("Could not load users."))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await usersApi.create(formData)
      setShowForm(false)
      setFormData({ email: "", password: "", name: "", role: "staff" })
      loadUsers()
      toast.success("User created successfully")
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, string[]> } }
      setError(
        Object.values(e?.response?.data || { detail: "Could not create user." })
          .flat()
          .join(" ")
      )
    }
  }

  return (
    <section className="page narrow-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Users</h1>
          <p className="subtle">Manage team access and roles.</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus size={17} /> Add user</Button>
      </header>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      {showForm && (
        <Card className="form-card">
          <div className="section-heading">
            <h2>New user</h2>
          </div>
          <form onSubmit={handleSubmit} className="form-grid">
            <label>
              Email
              <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="user@example.com" required />
            </label>
            <label>
              Password
              <Input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="Minimum 8 characters" required />
            </label>
            <label>
              Full name
              <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="John Doe" required />
            </label>
            <label>
              Role
              <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                <option value="staff">Staff</option>
                <option value="accounts">Accounts</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <div className="form-actions">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit">Create user</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="table-card">
        <div className="table-toolbar">
          <strong>Users ({users.length})</strong>
        </div>
        <div className="grid-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{user.name || "—"}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>
                    <span className={user.is_active ? "" : "subtle"}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                    {user.force_password_change && <span className="helper">· Password change required</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!users.length && (
          <div className="empty-state">
            <strong>No users found</strong>
            <p>Add a user to get started.</p>
          </div>
        )}
      </Card>
    </section>
  )
}
