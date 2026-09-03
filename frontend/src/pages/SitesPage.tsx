import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { clientApi, siteApi } from "../api/client"
import type { ClientRecord } from "../api/types"
import { Button, Card, Input } from "../components/ui"

export function SitesPage() {
  const [sites, setSites] = useState<any[]>([])
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [selectedClient, setSelectedClient] = useState("")
  const [error, setError] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ client: "", code: "", name: "", address: "" })

  useEffect(() => {
    loadClients()
    loadSites()
  }, [selectedClient])

  function loadClients() {
    clientApi.list().then(r => setClients(r.data)).catch(() => setError("Could not load clients."))
  }

  function loadSites() {
    siteApi.list(selectedClient ? { client: selectedClient } : undefined).then(r => setSites(r.data)).catch(() => setError("Could not load sites."))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await siteApi.create(formData)
      setShowForm(false)
      setFormData({ client: "", code: "", name: "", address: "" })
      loadSites()
    } catch {
      setError("Could not create site.")
    }
  }

  return (
    <section className="page narrow-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Master data</p>
          <h1>Sites</h1>
          <p className="subtle">Manage delivery sites for your clients.</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus size={17} /> Add site</Button>
      </header>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      <Card className="form-card">
        <div className="table-toolbar">
          <strong>Filter by client</strong>
          <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
            <option value="">All clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </Card>

      {showForm && (
        <Card className="form-card">
          <div className="section-heading">
            <h2>New site</h2>
          </div>
          <form onSubmit={handleSubmit} className="form-grid">
            <label>
              Client
              <select value={formData.client} onChange={e => setFormData({ ...formData, client: e.target.value })} required>
                <option value="">Choose client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              Site code
              <Input value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="e.g., SITE001" required />
            </label>
            <label>
              Site name
              <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Main Office" required />
            </label>
            <label>
              Address
              <textarea value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Full address" rows={3} />
            </label>
            <div className="form-actions">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit">Create site</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="table-card">
        <div className="table-toolbar">
          <strong>Sites ({sites.length})</strong>
        </div>
        <div className="grid-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Code</th>
                <th scope="col">Name</th>
                <th scope="col">Address</th>
              </tr>
            </thead>
            <tbody>
              {sites.map(site => (
                <tr key={site.id}>
                  <td>{site.client_name}</td>
                  <td>{site.code || "—"}</td>
                  <td>{site.name}</td>
                  <td>{site.address || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!sites.length && (
          <div className="empty-state">
            <strong>No sites found</strong>
            <p>Add a site to get started.</p>
          </div>
        )}
      </Card>
    </section>
  )
}
