import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Plus, Search, Truck, X } from "lucide-react"
import { toast } from "sonner"
import { challanApi, poApi } from "../api/client"
import type { Challan, PendingLine } from "../api/types"
import { Button, Card, Input } from "../components/ui"

type NewAllocation = {
  line_item: number
  qty: string
}

export function ChallansPage() {
  const [challans, setChallans] = useState<Challan[]>([])
  const [pendingLines, setPendingLines] = useState<PendingLine[]>([])
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  // New challan form state
  const [challanNumber, setChallanNumber] = useState("")
  const [challanDate, setChallanDate] = useState(new Date().toISOString().slice(0, 10))
  const [deliverySource, setDeliverySource] = useState("")
  const [notes, setNotes] = useState("")
  const [allocations, setAllocations] = useState<NewAllocation[]>([])

  const loadData = async () => {
    try {
      const [challanRes, pendingRes] = await Promise.all([
        challanApi.list(),
        poApi.pending(),
      ])
      setChallans(challanRes.data)
      setPendingLines(pendingRes.data)
    } catch {
      setError("Could not load delivery challans.")
    }
  }

  useEffect(() => {
    let active = true
    async function init() {
      try {
        const [challanRes, pendingRes] = await Promise.all([
          challanApi.list(),
          poApi.pending(),
        ])
        if (!active) return
        setChallans(challanRes.data)
        setPendingLines(pendingRes.data)
      } catch {
        if (active) setError("Could not load delivery challans.")
      }
    }
    init()
    return () => { active = false }
  }, [])

  function addAllocationRow() {
    if (!pendingLines.length) return
    setAllocations(curr => [...curr, { line_item: pendingLines[0].id, qty: "1" }])
  }

  function removeAllocationRow(index: number) {
    setAllocations(curr => curr.filter((_, i) => i !== index))
  }

  function updateAllocation(index: number, key: keyof NewAllocation, value: string | number) {
    setAllocations(curr =>
      curr.map((alloc, i) => (i === index ? { ...alloc, [key]: value } : alloc))
    )
  }

  async function submitChallan(e: React.FormEvent) {
    e.preventDefault()
    if (!challanNumber.trim()) {
      setError("Challan number is required.")
      return
    }
    if (!allocations.length) {
      setError("Add at least one line item allocation.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await challanApi.create({
        challan_number: challanNumber,
        challan_date: challanDate,
        delivery_source: deliverySource,
        notes,
        allocations,
      })
      toast.success("Delivery challan created")
      setIsCreating(false)
      setChallanNumber("")
      setDeliverySource("")
      setNotes("")
      setAllocations([])
      await loadData()
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, string[]> } }
      setError(
        Object.values(e?.response?.data || { detail: "Could not create challan." })
          .flat()
          .join(" ")
      )
    } finally {
      setSaving(false)
    }
  }

  const visible = query
    ? challans.filter(c =>
        `${c.challan_number} ${c.client_name ?? ""} ${c.site_name ?? ""} ${c.delivery_source ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
    : challans

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Logistics & Materials</p>
          <h1>Delivery challans</h1>
          <p className="subtle">
            Track material shipments, partial deliveries, and cross-PO delivery challans.
          </p>
        </div>
        <Button onClick={() => setIsCreating(!isCreating)}>
          {isCreating ? <X size={16} /> : <Plus size={16} />}
          {isCreating ? "Cancel" : "Record challan"}
        </Button>
      </header>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      {isCreating && (
        <Card className="form-card">
          <div className="section-heading">
            <div>
              <h2>New delivery challan</h2>
              <p>Allocate delivered quantities against ordered PO items.</p>
            </div>
          </div>
          <form onSubmit={submitChallan}>
            <div className="form-grid">
              <label>
                Challan number
                <Input
                  value={challanNumber}
                  onChange={e => setChallanNumber(e.target.value)}
                  placeholder="e.g. CH-188/24-25"
                  required
                />
              </label>
              <label>
                Challan date
                <Input
                  type="date"
                  value={challanDate}
                  onChange={e => setChallanDate(e.target.value)}
                  required
                />
              </label>
              <label>
                Delivery source <span className="optional">optional</span>
                <Input
                  value={deliverySource}
                  onChange={e => setDeliverySource(e.target.value)}
                  placeholder="Vendor / Factory / Transporter"
                />
              </label>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>Item allocations</strong>
                <Button type="button" variant="outline" onClick={addAllocationRow}>
                  <Plus size={14} /> Add line
                </Button>
              </div>

              {allocations.map((alloc, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "0.75rem", alignItems: "center", marginBottom: "0.5rem" }}>
                  <select
                    value={alloc.line_item}
                    onChange={e => updateAllocation(idx, "line_item", Number(e.target.value))}
                    style={{ minHeight: "38px", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "0.4rem" }}
                  >
                    {pendingLines.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.po_number} · {p.description} (Ordered: {p.qty_ordered}, Del: {p.qty_delivered})
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step="any"
                    value={alloc.qty}
                    onChange={e => updateAllocation(idx, "qty", e.target.value)}
                    placeholder="Delivered qty"
                    required
                  />
                  <Button type="button" variant="outline" onClick={() => removeAllocationRow(idx)}>
                    <X size={16} />
                  </Button>
                </div>
              ))}

              {!allocations.length && (
                <p className="helper">Click &ldquo;Add line&rdquo; to select a PO line item to allocate delivery to.</p>
              )}
            </div>

            <div className="form-actions">
              <Button type="submit" disabled={saving || !allocations.length}>
                <Truck size={16} /> {saving ? "Saving…" : "Save delivery challan"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="table-card">
        <div className="table-toolbar">
          <strong>All challans ({visible.length})</strong>
          <div className="search-field">
            <Search size={16} />
            <Input
              aria-label="Search challans"
              placeholder="Search challan number, client..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="grid-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Challan number</th>
                <th scope="col">Date</th>
                <th scope="col">Client</th>
                <th scope="col">Allocations</th>
                <th scope="col">Source / Notes</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.challan_number}</strong></td>
                  <td>{c.challan_date}</td>
                  <td>{c.client_name || "—"}</td>
                  <td>
                    {c.allocations && c.allocations.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                        {c.allocations.map((a, i) => (
                          <span key={i} style={{ fontSize: "0.75rem" }}>
                            {a.po_id ? <Link to={`/po/${a.po_id}`}>{a.po_number}</Link> : a.po_number}: {a.qty} units ({a.line_item_description})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="subtle">No allocations</span>
                    )}
                  </td>
                  <td>{c.delivery_source || c.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!visible.length && (
          <div className="empty-state">
            <strong>No challans found</strong>
            <p>Record a delivery challan when materials are dispatched or received on site.</p>
          </div>
        )}
      </Card>
    </section>
  )
}
