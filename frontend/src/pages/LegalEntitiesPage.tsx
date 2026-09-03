import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { legalEntityApi } from "../api/client"
import { Button, Card, Input } from "../components/ui"
import { toast } from "sonner"

type LegalEntity = {
  id: number
  name: string
  gstin: string
  state_code: string
  state_name: string
  invoice_prefix: string
  is_active: boolean
}

export function LegalEntitiesPage() {
  const [entities, setEntities] = useState<LegalEntity[]>([])
  const [error, setError] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: "", gstin: "", state_code: "", state_name: "", invoice_prefix: "" })

  useEffect(() => {
    loadEntities()
  }, [])

  function loadEntities() {
    legalEntityApi.list().then(r => setEntities(r.data)).catch(() => setError("Could not load legal entities."))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await legalEntityApi.create(formData)
      setShowForm(false)
      setFormData({ name: "", gstin: "", state_code: "", state_name: "", invoice_prefix: "" })
      loadEntities()
      toast.success("Legal entity created successfully")
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, string[]> } }
      setError(
        Object.values(e?.response?.data || { detail: "Could not create legal entity." })
          .flat()
          .join(" ")
      )
    }
  }

  return (
    <section className="page narrow-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Master data</p>
          <h1>Legal Entities</h1>
          <p className="subtle">Manage billing entities for invoicing.</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus size={17} /> Add entity</Button>
      </header>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      {showForm && (
        <Card className="form-card">
          <div className="section-heading">
            <h2>New legal entity</h2>
          </div>
          <form onSubmit={handleSubmit} className="form-grid">
            <label>
              Entity name
              <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., ABC Corporation" required />
            </label>
            <label>
              GSTIN
              <Input value={formData.gstin} onChange={e => setFormData({ ...formData, gstin: e.target.value })} placeholder="15-digit GST number" />
            </label>
            <label>
              State code
              <Input value={formData.state_code} onChange={e => setFormData({ ...formData, state_code: e.target.value })} placeholder="e.g., UP" maxLength={2} />
            </label>
            <label>
              State name
              <Input value={formData.state_name} onChange={e => setFormData({ ...formData, state_name: e.target.value })} placeholder="e.g., Uttar Pradesh" />
            </label>
            <label>
              Invoice prefix
              <Input value={formData.invoice_prefix} onChange={e => setFormData({ ...formData, invoice_prefix: e.target.value.toUpperCase() })} placeholder="e.g., ABC" maxLength={10} required />
            </label>
            <div className="form-actions">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit">Create entity</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="table-card">
        <div className="table-toolbar">
          <strong>Legal entities ({entities.length})</strong>
        </div>
        <div className="grid-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">GSTIN</th>
                <th scope="col">State</th>
                <th scope="col">Invoice prefix</th>
              </tr>
            </thead>
            <tbody>
              {entities.map(entity => (
                <tr key={entity.id}>
                  <td>{entity.name}</td>
                  <td>{entity.gstin || "—"}</td>
                  <td>{entity.state_name || entity.state_code || "—"}</td>
                  <td>{entity.invoice_prefix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!entities.length && (
          <div className="empty-state">
            <strong>No legal entities found</strong>
            <p>Add a legal entity to get started with billing.</p>
          </div>
        )}
      </Card>
    </section>
  )
}
