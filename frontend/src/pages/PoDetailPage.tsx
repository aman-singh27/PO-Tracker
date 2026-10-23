import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Paperclip, Save, Upload, RefreshCw, X } from "lucide-react"
import { toast } from "sonner"
import { activityApi, attachmentApi, poApi } from "../api/client"
import type { LifecycleStage, LineItem, PurchaseOrder } from "../api/types"
import { Button, Card } from "../components/ui"
import { LineItemGrid } from "../components/LineItemGrid"
import { formatMoney } from "../lib/money"

const STAGES: Record<LifecycleStage, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_built: "Partially built",
  partially_billed: "Partially billed",
  partially_paid: "Partially paid",
  closed: "Closed",
  on_hold: "On hold",
  cancelled: "Cancelled",
}

type Bill = { id: number; bill_number: string; total_amount: string; ariba_state: string }
type Attachment = { id: number; label: string; file: string }
type ActivityForm = {
  kind: string
  items: { line_item_id: number; qty: string; rate: string; gst_rate: string }[]
  bill_id: string
  number: string
  date: string
  amount: string
  ariba_state: string
}

const defaultActivity = (): ActivityForm => ({
  kind: "delivery",
  items: [],
  bill_id: "",
  number: "",
  date: new Date().toISOString().slice(0, 10),
  amount: "",
  ariba_state: "uploaded",
})

export function PoDetailPage() {
  const { id = "" } = useParams()
  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [activity, setActivity] = useState<ActivityForm>(defaultActivity)
  const [revising, setRevising] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showRevisionDialog, setShowRevisionDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [revisionReason, setRevisionReason] = useState("")
  const [cancelReason, setCancelReason] = useState("")
  const [isEditingItems, setIsEditingItems] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await poApi.get(id)
        if (cancelled) return
        setPo(r.data)
        const [attachRes, billRes] = await Promise.all([
          attachmentApi.list(r.data.id),
          activityApi.list(r.data.id),
        ])
        if (cancelled) return
        setAttachments(attachRes.data)
        setBills(billRes.data)
      } catch {
        if (!cancelled) setError("This PO could not be loaded. Return to the list and try again.")
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const lines = useMemo(() => po?.lines || [], [po])

  const change = (key: "lifecycle_stage" | "notes", value: string) =>
    setPo(cur => cur ? { ...cur, [key]: value } : cur)

  const updateLines = (next: LineItem[]) =>
    setPo(cur => cur ? { ...cur, lines: next } : cur)

  const refresh = async () => {
    if (!po) return
    const [updated, billResult] = await Promise.all([
      poApi.get(String(po.id)),
      activityApi.list(po.id),
    ])
    setPo(updated.data)
    setBills(billResult.data)
  }

  async function save() {
    if (!po) return
    setSaving(true)
    setError("")
    try {
      const result = await poApi.update(po.id, {
        lifecycle_stage: po.lifecycle_stage,
        notes: po.notes || "",
        lines: po.lines,
        updated_at: po.updated_at,
      })
      setPo(result.data)
      toast.success("PO saved")
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } }
      setError(
        e?.response?.status === 409
          ? "Someone updated this PO first. Reload before saving your changes."
          : "The PO could not be saved. Your edits are still on screen."
      )
    } finally {
      setSaving(false)
    }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !po) return
    setUploading(true)
    try {
      const result = await attachmentApi.upload(po.id, file)
      setAttachments(cur => [result.data as Attachment, ...cur])
      toast.success("Document attached")
    } catch {
      setError("That file could not be uploaded. Use a file smaller than 20 MB.")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function record() {
    if (!po) return
    const isBillAction = ["payment", "ariba"].includes(activity.kind)
    if (isBillAction && !activity.bill_id) return
    if (!isBillAction && (activity.items.length === 0 || !activity.number || activity.items.some(i => !i.qty))) return
    if (activity.kind === "payment" && !activity.amount) return
    setRecording(true)
    setError("")
    try {
      await activityApi.create(po.id, activity)
      await refresh()
      const messages: Record<string, string> = {
        delivery: "Delivery recorded",
        bill: "Bill recorded",
        payment: "Payment recorded",
        ariba: "Ariba status updated",
      }
      toast.success(messages[activity.kind] ?? "Activity recorded")
      setActivity(cur => ({ ...cur, number: "", amount: "", items: [] }))
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, string[]> } }
      setError(
        Object.values(e?.response?.data || { detail: "Could not record the activity." })
          .flat()
          .join(" ")
      )
    } finally {
      setRecording(false)
    }
  }

  async function handleRevise() {
    if (!po || !revisionReason.trim()) return
    setRevising(true)
    setError("")
    try {
      const result = await poApi.revise(po.id, {
        lines: (po.lines ?? []).map(line => ({
          ...line,
          carries_from_line_id: line.id,
        })),
        reason: revisionReason,
      })
      toast.success("PO revised successfully")
      setShowRevisionDialog(false)
      setRevisionReason("")
      // Navigate to the new revision
      window.location.href = `/po/${result.data.id}`
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, string[]> } }
      setError(
        Object.values(e?.response?.data || { detail: "Could not revise PO." })
          .flat()
          .join(" ")
      )
    } finally {
      setRevising(false)
    }
  }

  async function handleCancel() {
    if (!po || !cancelReason.trim()) return
    setCancelling(true)
    setError("")
    try {
      await poApi.cancel(po.id, { reason: cancelReason })
      toast.success("PO cancelled successfully")
      setShowCancelDialog(false)
      setCancelReason("")
      await refresh()
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, string[]> } }
      setError(
        Object.values(e?.response?.data || { detail: "Could not cancel PO." })
          .flat()
          .join(" ")
      )
    } finally {
      setCancelling(false)
    }
  }

  const isBillAction = ["payment", "ariba"].includes(activity.kind)
  const recordDisabled =
    recording ||
    (isBillAction ? !activity.bill_id : activity.items.length === 0 || !activity.number || activity.items.some(i => !i.qty)) ||
    (activity.kind === "payment" && !activity.amount)

  if (error && !po) {
    return (
      <section className="page">
        <Link className="back-link" to="/po"><ArrowLeft size={16} /> Purchase orders</Link>
        <div className="inline-alert" role="alert">{error}</div>
      </section>
    )
  }
  if (!po) {
    return <section className="page"><p>Loading purchase order…</p></section>
  }

  const totals = po.totals || {
    amount_ordered: po.total_amount,
    amount_billed: po.amount_billed || "0",
    amount_paid: "0",
    outstanding_amount: po.amount_billed || "0",
  }

  return (
    <section className="page">
      <Link className="back-link" to="/po"><ArrowLeft size={16} /> Purchase orders</Link>

      <header className="page-header">
        <div>
          <p className="eyebrow">Working order</p>
          <h1>{po.po_number}</h1>
          <p className="subtle">Update the order, attach documents, and record work as it moves forward.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {po.status === 'active' && (
            <>
              <Button variant="outline" onClick={() => setShowRevisionDialog(true)} disabled={revising}>
                <RefreshCw size={16} />{revising ? "Revising…" : "Revise"}
              </Button>
              <Button variant="outline" onClick={() => setShowCancelDialog(true)} disabled={cancelling}>
                <X size={16} />{cancelling ? "Cancelling…" : "Cancel"}
              </Button>
            </>
          )}
          <Button onClick={save} disabled={saving}>
            <Save size={16} />{saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </header>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      <Card className="metadata">
        <div><small>Client</small><strong>{po.client_name}</strong></div>
        <div><small>Site</small><strong>{po.site_name || "Not specified"}</strong></div>
        <div><small>PO date</small><strong>{po.po_date || "Not specified"}</strong></div>
      </Card>

      <Card className="form-card lifecycle-card">
        <label>
          Team lifecycle
          <select value={po.lifecycle_stage} onChange={e => change("lifecycle_stage", e.target.value)}>
            {Object.entries(STAGES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <textarea
            value={po.notes || ""}
            onChange={e => change("notes", e.target.value)}
            placeholder="Add an internal note about this PO"
          />
        </label>
      </Card>

      <Card className="money-strip">
        <div><small>Ordered</small><strong className="num">{formatMoney(totals.amount_ordered)}</strong><span>{lines.length} items</span></div>
        <div><small>Billed</small><strong className="num">{formatMoney(totals.amount_billed)}</strong><span>From bill entries</span></div>
        <div><small>Paid</small><strong className="num">{formatMoney(totals.amount_paid)}</strong><span>Recorded receipts</span></div>
        <div><small>Outstanding</small><strong className="num money-outstanding">{formatMoney(totals.outstanding_amount)}</strong><span>Needs follow-up</span></div>
      </Card>

      <Card className="form-card">
        <div className="section-heading">
          <div>
            <h2>Record activity</h2>
            <p>Record delivery, billing, payment received, or an Ariba update without leaving this PO.</p>
          </div>
        </div>
        <div className="activity-grid">
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            {[
              { id: "delivery", label: "Delivery challan" },
              { id: "bill", label: "Bill" },
              { id: "payment", label: "Payment received" },
              { id: "ariba", label: "Ariba status" }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivity({ ...activity, kind: tab.id, items: [] })}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  border: activity.kind === tab.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: activity.kind === tab.id ? "var(--accent-muted)" : "var(--surface)",
                  color: activity.kind === tab.id ? "var(--accent)" : "inherit",
                  fontWeight: activity.kind === tab.id ? 600 : 400,
                  cursor: "pointer"
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {isBillAction ? (
            <label>
              Bill
              <select value={activity.bill_id} onChange={e => setActivity({ ...activity, bill_id: e.target.value })}>
                <option value="">Choose bill</option>
                {bills.map(b => (
                  <option key={b.id} value={b.id}>{b.bill_number} · {formatMoney(b.total_amount)}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              {activity.kind === "delivery" ? "Challan number" : "Bill number"}
              <input value={activity.number} onChange={e => setActivity({ ...activity, number: e.target.value })} />
            </label>
          )}

          <label>
            Date
            <input type="date" value={activity.date} onChange={e => setActivity({ ...activity, date: e.target.value })} />
          </label>

          {activity.kind === "payment" && (
            <label>
              Received amount
              <input inputMode="decimal" value={activity.amount} onChange={e => setActivity({ ...activity, amount: e.target.value })} />
            </label>
          )}

          {activity.kind === "ariba" && (
            <label>
              Ariba state
              <select value={activity.ariba_state} onChange={e => setActivity({ ...activity, ariba_state: e.target.value })}>
                <option value="uploaded">Uploaded</option>
                <option value="rejected">Rejected</option>
                <option value="resubmitted">Resubmitted</option>
                <option value="pending">Pending</option>
                <option value="not_required">Not required</option>
              </select>
            </label>
          )}
        </div>
        {!isBillAction && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Select items to include in {activity.kind === 'delivery' ? 'challan' : 'bill'}</p>
            {lines.map(line => {
              const selected = activity.items.find(i => i.line_item_id === line.id)
              const isChecked = !!selected
              return (
                <div key={line.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem', background: 'var(--surface-sunken)', padding: '0.5rem 1rem', borderRadius: '4px' }}>
                  <input 
                    type="checkbox" 
                    checked={isChecked}
                    onChange={e => {
                      if (e.target.checked) {
                        const rem = parseFloat(line.qty_ordered) - parseFloat(activity.kind === 'bill' ? (line.derived_status?.qty_billed || '0') : (line.derived_status?.qty_delivered || '0'))
                        setActivity({ ...activity, items: [...activity.items, { line_item_id: line.id!, qty: String(Math.max(0, rem)), rate: line.rate, gst_rate: line.gst_rate }] })
                      } else {
                        setActivity({ ...activity, items: activity.items.filter(i => i.line_item_id !== line.id) })
                      }
                    }}
                  />
                  <span style={{ flex: 1, fontWeight: 500 }}>{line.description}</span>
                  {isChecked && (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '0.85rem' }}>
                        Qty
                        <input style={{ width: '80px', padding: '0.25rem' }} inputMode="decimal" value={selected.qty} onChange={e => setActivity({ ...activity, items: activity.items.map(i => i.line_item_id === line.id ? { ...i, qty: e.target.value } : i) })} />
                      </label>
                      {activity.kind === "bill" && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '0.85rem' }}>
                          Rate
                          <input style={{ width: '80px', padding: '0.25rem' }} inputMode="decimal" value={selected.rate} onChange={e => setActivity({ ...activity, items: activity.items.map(i => i.line_item_id === line.id ? { ...i, rate: e.target.value } : i) })} />
                        </label>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div className="form-actions" style={{ marginTop: '1.5rem' }}>
          <Button onClick={record} disabled={recordDisabled}>
            {recording ? "Recording…" : "Record activity"}
          </Button>
          {bills.length > 0 && (
            <span className="helper">{bills.length} bill{bills.length !== 1 ? "s" : ""} on this PO</span>
          )}
        </div>
      </Card>

      <Card className="form-card">
        <div className="section-heading">
          <div>
            <h2>Source documents</h2>
            <p>Keep the PO, challans and bills with the working record.</p>
          </div>
          <label className="upload-button">
            <Upload size={16} />{uploading ? "Uploading…" : "Attach document"}
            <input ref={fileRef} type="file" onChange={upload} disabled={uploading} />
          </label>
        </div>
        {attachments.length ? (
          <ul className="attachment-list">
            {attachments.map(file => (
              <li key={file.id}>
                <Paperclip size={15} />
                <a href={file.file} target="_blank" rel="noreferrer">{file.label}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="helper">No source documents attached yet.</p>
        )}
      </Card>

      <Card className="form-card">
        <div className="section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Items</h2>
            <p>Item status is derived from actual delivery and billing records.</p>
          </div>
          <Button variant="outline" onClick={() => setIsEditingItems(!isEditingItems)}>
            {isEditingItems ? "Done editing" : "Edit items"}
          </Button>
        </div>
        <LineItemGrid 
          value={lines} 
          onChange={updateLines} 
          readOnly={!isEditingItems}
          renderStatus={(line) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {line.item_type === 'material' ? (
                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--subtle)' }}>
                  {line.derived_status?.qty_billed || '0'} / {line.qty_ordered} Billed
                </span>
              ) : (
                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--subtle)' }}>
                  {line.work_done_on ? 'Work Done' : 'Pending'}
                </span>
              )}
              {line.item_type === 'service' && line.id && (
                <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.5rem' }}>
                  {!line.work_done_on && (
                    <button
                      type="button"
                      className="button"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}
                      onClick={async () => {
                        try {
                          await poApi.markWorkDone(line.id!)
                          await refresh()
                          toast.success("Work marked as done")
                        } catch {
                          setError("Could not mark work as done")
                        }
                      }}
                    >
                      Log Work
                    </button>
                  )}
                  {line.work_done_on && !line.client_approved_on && (
                    <button
                      type="button"
                      className="button"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}
                      onClick={async () => {
                        try {
                          await poApi.markApproved(line.id!)
                          await refresh()
                          toast.success("Work marked as approved")
                        } catch {
                          setError("Could not mark work as approved")
                        }
                      }}
                    >
                      Approve
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        />
      </Card>

      {showRevisionDialog && (
        <div className="dialog-overlay" onClick={() => setShowRevisionDialog(false)}>
          <Card className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Revise Purchase Order</h3>
            <p>Creating a revision will preserve all existing delivery and billing allocations and carry them forward to the new PO.</p>
            <label>
              Revision reason
              <textarea
                value={revisionReason}
                onChange={e => setRevisionReason(e.target.value)}
                placeholder="Explain why this PO is being revised (e.g., 'PO Changed with Tax @18%')"
                rows={3}
              />
            </label>
            <div className="form-actions">
              <Button variant="outline" onClick={() => setShowRevisionDialog(false)}>Cancel</Button>
              <Button onClick={handleRevise} disabled={!revisionReason.trim() || revising}>
                {revising ? "Creating revision…" : "Create revision"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showCancelDialog && (
        <div className="dialog-overlay" onClick={() => setShowCancelDialog(false)}>
          <Card className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Cancel Purchase Order</h3>
            <p>This will mark the PO as cancelled. It will remain visible but excluded from pending work calculations.</p>
            <label>
              Cancellation reason
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Explain why this PO is being cancelled"
                rows={3}
              />
            </label>
            <div className="form-actions">
              <Button variant="outline" onClick={() => setShowCancelDialog(false)}>Cancel</Button>
              <Button onClick={handleCancel} disabled={!cancelReason.trim() || cancelling}>
                {cancelling ? "Cancelling…" : "Confirm cancellation"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </section>
  )
}
