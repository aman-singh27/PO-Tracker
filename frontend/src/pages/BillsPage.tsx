import { useEffect, useState } from "react"
import { Check, FileText, Plus, Search, X } from "lucide-react"
import { toast } from "sonner"
import { billApi, poApi } from "../api/client"
import type { AribaState, Bill, PendingLine } from "../api/types"
import { Button, Card, Input } from "../components/ui"
import { formatMoney } from "../lib/money"

type NewAllocation = {
  line_item: number
  qty: string
  rate: string
  gst_rate: string
}

const ARIBA_LABELS: Record<AribaState, string> = {
  pending: "Pending upload",
  uploaded: "Uploaded",
  rejected: "Rejected",
  resubmitted: "Resubmitted",
  not_required: "Not required",
}

export function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [pendingLines, setPendingLines] = useState<PendingLine[]>([])
  const [query, setQuery] = useState("")
  const [aribaFilter, setAribaFilter] = useState<string>("all")
  const [error, setError] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  // Quick edit modal or state
  const [editingAribaBillId, setEditingAribaBillId] = useState<number | null>(null)
  const [newAribaState, setNewAribaState] = useState<AribaState>("uploaded")

  // Form state
  const [billNumber, setBillNumber] = useState("")
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10))
  const [aribaState, setAribaState] = useState<AribaState>("pending")
  const [allocations, setAllocations] = useState<NewAllocation[]>([])

  const loadData = async () => {
    try {
      const [billRes, pendingRes] = await Promise.all([
        billApi.list(),
        poApi.pending(),
      ])
      setBills(billRes.data)
      setPendingLines(pendingRes.data)
    } catch {
      setError("Could not load bills.")
    }
  }

  useEffect(() => {
    let active = true
    async function init() {
      try {
        const [billRes, pendingRes] = await Promise.all([
          billApi.list(),
          poApi.pending(),
        ])
        if (!active) return
        setBills(billRes.data)
        setPendingLines(pendingRes.data)
      } catch {
        if (active) setError("Could not load bills.")
      }
    }
    init()
    return () => { active = false }
  }, [])

  function addAllocationRow() {
    if (!pendingLines.length) return
    const first = pendingLines[0]
    setAllocations(curr => [
      ...curr,
      { line_item: first.id, qty: "1", rate: "100", gst_rate: "0.18" },
    ])
  }

  function removeAllocationRow(index: number) {
    setAllocations(curr => curr.filter((_, i) => i !== index))
  }

  function updateAllocation(index: number, key: keyof NewAllocation, value: string | number) {
    setAllocations(curr =>
      curr.map((alloc, i) => (i === index ? { ...alloc, [key]: value } : alloc))
    )
  }

  async function submitBill(e: React.FormEvent) {
    e.preventDefault()
    if (!billNumber.trim()) {
      setError("Bill number is required.")
      return
    }
    if (!allocations.length) {
      setError("Add at least one line item allocation.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await billApi.create({
        bill_number: billNumber,
        bill_date: billDate,
        ariba_state: aribaState,
        allocations,
      })
      toast.success("Bill created")
      setIsCreating(false)
      setBillNumber("")
      setAllocations([])
      await loadData()
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, string[]> } }
      setError(
        Object.values(e?.response?.data || { detail: "Could not create bill." })
          .flat()
          .join(" ")
      )
    } finally {
      setSaving(false)
    }
  }

  async function updateAribaStatus(billId: number) {
    try {
      await billApi.update(billId, { ariba_state: newAribaState })
      toast.success("Ariba state updated")
      setEditingAribaBillId(null)
      await loadData()
    } catch {
      toast.error("Could not update Ariba state")
    }
  }

  const visible = bills
    .filter(b => {
      if (aribaFilter !== "all" && b.ariba_state !== aribaFilter) return false
      if (!query) return true
      return `${b.bill_number} ${b.client_name ?? ""} ${(b.po_numbers ?? []).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase())
    })

  const totalBilled = bills.reduce((acc, b) => acc + Number(b.total_amount || 0), 0)
  const totalOutstanding = bills.reduce((acc, b) => acc + Number(b.outstanding_amount || 0), 0)
  const aribaBacklogCount = bills.filter(b => b.ariba_state === "pending" || b.ariba_state === "rejected").length

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Invoicing & Compliance</p>
          <h1>Bills & Ariba</h1>
          <p className="subtle">
            Manage tax invoices, GST calculations, Ariba upload status, and bill settlements.
          </p>
        </div>
        <Button onClick={() => setIsCreating(!isCreating)}>
          {isCreating ? <X size={16} /> : <Plus size={16} />}
          {isCreating ? "Cancel" : "Record bill"}
        </Button>
      </header>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      <div className="stat-grid">
        <Card>
          <p>Total billed</p>
          <strong className="stat-num">{formatMoney(String(totalBilled))}</strong>
          <small>{bills.length} bills recorded</small>
        </Card>
        <Card>
          <p>Receivables outstanding</p>
          <strong className="stat-num money-outstanding">{formatMoney(String(totalOutstanding))}</strong>
          <small>Awaiting client payment</small>
        </Card>
        <Card>
          <p>Ariba backlog</p>
          <strong className="stat-num">{aribaBacklogCount}</strong>
          <small>Bills pending portal upload / rejected</small>
        </Card>
      </div>

      {isCreating && (
        <Card className="form-card">
          <div className="section-heading">
            <div>
              <h2>Record new bill</h2>
              <p>Allocate billed amounts against PO line items.</p>
            </div>
          </div>
          <form onSubmit={submitBill}>
            <div className="form-grid">
              <label>
                Bill number
                <Input
                  value={billNumber}
                  onChange={e => setBillNumber(e.target.value)}
                  placeholder="e.g. UP/000045/24-25"
                  required
                />
              </label>
              <label>
                Bill date
                <Input
                  type="date"
                  value={billDate}
                  onChange={e => setBillDate(e.target.value)}
                  required
                />
              </label>
              <label>
                Ariba status
                <select
                  value={aribaState}
                  onChange={e => setAribaState(e.target.value as AribaState)}
                  style={{ minHeight: "38px", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "0.4rem" }}
                >
                  {Object.entries(ARIBA_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>Line item billing allocations</strong>
                <Button type="button" variant="outline" onClick={addAllocationRow}>
                  <Plus size={14} /> Add line
                </Button>
              </div>

              {allocations.map((alloc, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr 1fr auto", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                  <select
                    value={alloc.line_item}
                    onChange={e => updateAllocation(idx, "line_item", Number(e.target.value))}
                    style={{ minHeight: "38px", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "0.4rem" }}
                  >
                    {pendingLines.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.po_number} · {p.description} (Ordered: {p.qty_ordered}, Billed: {p.qty_billed})
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step="any"
                    value={alloc.qty}
                    onChange={e => updateAllocation(idx, "qty", e.target.value)}
                    placeholder="Qty"
                    required
                  />
                  <Input
                    type="number"
                    step="any"
                    value={alloc.rate}
                    onChange={e => updateAllocation(idx, "rate", e.target.value)}
                    placeholder="Rate"
                    required
                  />
                  <Input
                    type="number"
                    step="any"
                    value={alloc.gst_rate}
                    onChange={e => updateAllocation(idx, "gst_rate", e.target.value)}
                    placeholder="GST rate (0.18)"
                    required
                  />
                  <Button type="button" variant="outline" onClick={() => removeAllocationRow(idx)}>
                    <X size={16} />
                  </Button>
                </div>
              ))}

              {!allocations.length && (
                <p className="helper">Click &ldquo;Add line&rdquo; to select a PO line item to allocate billing to.</p>
              )}
            </div>

            <div className="form-actions">
              <Button type="submit" disabled={saving || !allocations.length}>
                <FileText size={16} /> {saving ? "Saving…" : "Save bill"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="table-card">
        <div className="table-toolbar" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <strong>All bills ({visible.length})</strong>
            <select
              value={aribaFilter}
              onChange={e => setAribaFilter(e.target.value)}
              style={{ padding: "0.3rem 0.5rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", fontSize: "0.8125rem" }}
            >
              <option value="all">All Ariba states</option>
              <option value="pending">Pending upload</option>
              <option value="uploaded">Uploaded</option>
              <option value="rejected">Rejected</option>
              <option value="resubmitted">Resubmitted</option>
              <option value="not_required">Not required</option>
            </select>
          </div>

          <div className="search-field">
            <Search size={16} />
            <Input
              aria-label="Search bills"
              placeholder="Search bill number, client, PO..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="grid-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Bill number</th>
                <th scope="col">Date</th>
                <th scope="col">Client / POs</th>
                <th scope="col" className="num">Basic</th>
                <th scope="col" className="num">GST</th>
                <th scope="col" className="num">Total</th>
                <th scope="col" className="num">Outstanding</th>
                <th scope="col">Ariba status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(b => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.bill_number}</strong>
                    {b.needs_review && (
                      <span style={{ marginLeft: "0.4rem", fontSize: "0.6875rem", background: "#fef3c7", color: "#92400e", padding: "0.15rem 0.35rem", borderRadius: "3px" }}>
                        Format review
                      </span>
                    )}
                  </td>
                  <td>{b.bill_date}</td>
                  <td>
                    {b.client_name}
                    {b.po_numbers && b.po_numbers.length > 0 && (
                      <span className="subtle" style={{ display: "block", fontSize: "0.75rem" }}>
                        POs: {b.po_numbers.join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="num">{formatMoney(b.basic_amount)}</td>
                  <td className="num">{formatMoney(b.gst_amount)}</td>
                  <td className="num"><strong>{formatMoney(b.total_amount)}</strong></td>
                  <td className="num">
                    <span className={Number(b.outstanding_amount || 0) > 0 ? "money-outstanding" : "subtle"}>
                      {formatMoney(b.outstanding_amount || "0")}
                    </span>
                  </td>
                  <td>
                    {editingAribaBillId === b.id ? (
                      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                        <select
                          value={newAribaState}
                          onChange={e => setNewAribaState(e.target.value as AribaState)}
                          style={{ fontSize: "0.75rem", padding: "0.2rem", borderRadius: "var(--radius)" }}
                        >
                          {Object.entries(ARIBA_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        <Button variant="outline" onClick={() => updateAribaStatus(b.id)}>
                          <Check size={12} />
                        </Button>
                        <Button variant="outline" onClick={() => setEditingAribaBillId(null)}>
                          <X size={12} />
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAribaBillId(b.id)
                          setNewAribaState(b.ariba_state)
                        }}
                        style={{
                          background: "none",
                          border: "1px solid var(--border)",
                          borderRadius: "999px",
                          padding: "0.2rem 0.5rem",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          color: b.ariba_state === "rejected" ? "#b91c1c" : b.ariba_state === "uploaded" ? "#15803d" : "inherit",
                        }}
                        title="Click to change Ariba state"
                      >
                        {ARIBA_LABELS[b.ariba_state] ?? b.ariba_state}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!visible.length && (
          <div className="empty-state">
            <strong>No bills found</strong>
            <p>Create bills when materials are delivered or service milestones are achieved.</p>
          </div>
        )}
      </Card>
    </section>
  )
}
