import { useEffect, useState } from "react"
import { CreditCard, IndianRupee, Plus, Search, X } from "lucide-react"
import { toast } from "sonner"
import { billApi, clientApi, paymentApi } from "../api/client"
import type { Bill, ClientRecord, Payment } from "../api/types"
import { Button, Card, Input } from "../components/ui"
import { formatMoney } from "../lib/money"

type PaymentAlloc = {
  bill: number
  amount: string
  kind: "payment" | "tds" | "retention" | "discount" | "write_off"
  note?: string
}

export function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [saving, setSaving] = useState(false)

  // Payment Form
  const [selectedClient, setSelectedClient] = useState<number | "">("")
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState("")
  const [mode, setMode] = useState("NEFT")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [allocations, setAllocations] = useState<PaymentAlloc[]>([])

  const loadData = async () => {
    try {
      const [payRes, billRes, clientRes] = await Promise.all([
        paymentApi.list(),
        billApi.list(),
        clientApi.list(),
      ])
      setPayments(payRes.data)
      setBills(billRes.data)
      setClients(clientRes.data)
    } catch {
      setError("Could not load payments data.")
    }
  }

  useEffect(() => {
    let active = true
    async function init() {
      try {
        const [payRes, billRes, clientRes] = await Promise.all([
          paymentApi.list(),
          billApi.list(),
          clientApi.list(),
        ])
        if (!active) return
        setPayments(payRes.data)
        setBills(billRes.data)
        setClients(clientRes.data)
      } catch {
        if (active) setError("Could not load payments data.")
      }
    }
    init()
    return () => { active = false }
  }, [])

  // Outstanding bills that can be paid
  const unpaidBills = bills.filter(b => Number(b.outstanding_amount || 0) > 0)

  // Client filtered bills
  const availableBills = selectedClient
    ? unpaidBills.filter(b => {
        const clientObj = clients.find(c => c.id === selectedClient)
        return !clientObj || b.client_name === clientObj.name
      })
    : unpaidBills

  function quickPayBill(b: Bill) {
    setIsRecording(true)
    const clientMatch = clients.find(c => c.name === b.client_name)
    if (clientMatch) setSelectedClient(clientMatch.id)
    const outAmt = b.outstanding_amount || b.total_amount
    setAmount(outAmt)
    setAllocations([{ bill: b.id, amount: outAmt, kind: "payment", note: "" }])
  }

  function addAllocationRow() {
    if (!availableBills.length) return
    const first = availableBills[0]
    setAllocations(curr => [
      ...curr,
      { bill: first.id, amount: first.outstanding_amount || first.total_amount, kind: "payment", note: "" },
    ])
  }

  function removeAllocationRow(index: number) {
    setAllocations(curr => curr.filter((_, i) => i !== index))
  }

  function updateAllocation(index: number, key: keyof PaymentAlloc, value: string | number) {
    setAllocations(curr =>
      curr.map((alloc, i) => (i === index ? { ...alloc, [key]: value } : alloc))
    )
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedClient) {
      setError("Select the paying client.")
      return
    }
    if (!amount || Number(amount) <= 0) {
      setError("Payment amount must be greater than zero.")
      return
    }
    if (!allocations.length) {
      setError("Allocate this payment against at least one bill.")
      return
    }
    const allocatedSum = allocations.reduce((sum, a) => sum + Number(a.amount || 0), 0)
    if (allocatedSum > Number(amount)) {
      setError("Allocated amounts cannot exceed total payment amount.")
      return
    }

    setSaving(true)
    setError("")
    try {
      await paymentApi.create({
        client: selectedClient,
        received_on: receivedOn,
        amount,
        mode,
        reference,
        notes,
        allocations,
      })
      toast.success("Payment recorded and allocated")
      setIsRecording(false)
      setAmount("")
      setReference("")
      setNotes("")
      setAllocations([])
      await loadData()
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, string[]> } }
      setError(
        Object.values(e?.response?.data || { detail: "Could not record payment." })
          .flat()
          .join(" ")
      )
    } finally {
      setSaving(false)
    }
  }

  const totalCollected = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0)
  const totalOutstanding = unpaidBills.reduce((acc, b) => acc + Number(b.outstanding_amount || 0), 0)

  const visiblePayments = query
    ? payments.filter(p =>
        `${p.client_name ?? ""} ${p.reference ?? ""} ${p.mode ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
    : payments

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Accounts & Cash Flow</p>
          <h1>Payments & Settlement</h1>
          <p className="subtle">
            Record client receipts, settle unpaid bills, and manage TDS or deductions.
          </p>
        </div>
        <Button onClick={() => setIsRecording(!isRecording)}>
          {isRecording ? <X size={16} /> : <Plus size={16} />}
          {isRecording ? "Cancel" : "Record payment"}
        </Button>
      </header>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      <div className="stat-grid">
        <Card>
          <p>Total collected</p>
          <strong className="stat-num">{formatMoney(String(totalCollected))}</strong>
          <small>{payments.length} payments received</small>
        </Card>
        <Card>
          <p>Outstanding receivables</p>
          <strong className="stat-num money-outstanding">{formatMoney(String(totalOutstanding))}</strong>
          <small>{unpaidBills.length} unpaid / partial bills</small>
        </Card>
        <Card>
          <p>Settlement rate</p>
          <strong className="stat-num">
            {totalCollected + totalOutstanding > 0
              ? `${Math.round((totalCollected / (totalCollected + totalOutstanding)) * 100)}%`
              : "100%"}
          </strong>
          <small>Billed amounts settled</small>
        </Card>
      </div>

      {isRecording && (
        <Card className="form-card">
          <div className="section-heading">
            <div>
              <h2>Record client payment</h2>
              <p>Allocate received funds across outstanding bills for the client.</p>
            </div>
          </div>
          <form onSubmit={submitPayment}>
            <div className="form-grid">
              <label>
                Client
                <select
                  value={selectedClient}
                  onChange={e => {
                    const val = e.target.value ? Number(e.target.value) : ""
                    setSelectedClient(val)
                    setAllocations([])
                  }}
                  style={{ minHeight: "38px", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "0.4rem" }}
                  required
                >
                  <option value="">Select client</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Received date
                <Input
                  type="date"
                  value={receivedOn}
                  onChange={e => setReceivedOn(e.target.value)}
                  required
                />
              </label>

              <label>
                Amount received (₹)
                <Input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </label>

              <label>
                Payment mode
                <select
                  value={mode}
                  onChange={e => setMode(e.target.value)}
                  style={{ minHeight: "38px", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "0.4rem" }}
                >
                  <option value="NEFT">NEFT / RTGS</option>
                  <option value="Cheque">Cheque</option>
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                </select>
              </label>

              <label>
                Reference number
                <Input
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="UTR / Cheque No."
                />
              </label>

              <label>
                Notes <span className="optional">optional</span>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Additional settlement remarks"
                />
              </label>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>Bill allocations</strong>
                <Button type="button" variant="outline" onClick={addAllocationRow} disabled={!availableBills.length}>
                  <Plus size={14} /> Add bill allocation
                </Button>
              </div>

              {allocations.map((alloc, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "3fr 1.5fr 1fr 2fr auto", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                  <select
                    value={alloc.bill}
                    onChange={e => updateAllocation(idx, "bill", Number(e.target.value))}
                    style={{ minHeight: "38px", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "0.4rem" }}
                  >
                    {availableBills.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bill_number} · Total: {formatMoney(b.total_amount)} (Bal: {formatMoney(b.outstanding_amount || b.total_amount)})
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step="any"
                    value={alloc.amount}
                    onChange={e => updateAllocation(idx, "amount", e.target.value)}
                    placeholder="Allocated ₹"
                    required
                  />
                  <select
                    value={alloc.kind}
                    onChange={e => updateAllocation(idx, "kind", e.target.value)}
                    style={{ minHeight: "38px", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "0.4rem" }}
                  >
                    <option value="payment">Payment</option>
                    <option value="tds">TDS</option>
                    <option value="retention">Retention</option>
                    <option value="discount">Discount</option>
                    <option value="write_off">Write-off</option>
                  </select>
                  <Input
                    value={alloc.note || ""}
                    onChange={e => updateAllocation(idx, "note", e.target.value)}
                    placeholder="Note"
                  />
                  <Button type="button" variant="outline" onClick={() => removeAllocationRow(idx)}>
                    <X size={16} />
                  </Button>
                </div>
              ))}

              {!allocations.length && (
                <p className="helper">
                  {selectedClient
                    ? availableBills.length
                      ? "Click 'Add bill allocation' to allocate to an outstanding bill."
                      : "No outstanding bills found for this client."
                    : "Select a client first to view outstanding bills."}
                </p>
              )}
            </div>

            <div className="form-actions">
              <Button type="submit" disabled={saving || !allocations.length}>
                <IndianRupee size={16} /> {saving ? "Recording…" : "Confirm payment receipt"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Outstanding Receivables Attention Queue */}
      {unpaidBills.length > 0 && (
        <Card className="table-card" style={{ marginBottom: "1.5rem" }}>
          <div className="table-toolbar">
            <strong>Outstanding bills awaiting settlement ({unpaidBills.length})</strong>
          </div>
          <div className="grid-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Bill number</th>
                  <th scope="col">Client</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="num">Total amount</th>
                  <th scope="col" className="num">Paid</th>
                  <th scope="col" className="num">Balance due</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {unpaidBills.slice(0, 8).map(b => (
                  <tr key={b.id}>
                    <td><strong>{b.bill_number}</strong></td>
                    <td>{b.client_name}</td>
                    <td>{b.bill_date}</td>
                    <td className="num">{formatMoney(b.total_amount)}</td>
                    <td className="num">{formatMoney(b.amount_paid || "0")}</td>
                    <td className="num"><strong className="money-outstanding">{formatMoney(b.outstanding_amount || b.total_amount)}</strong></td>
                    <td>
                      <Button variant="outline" onClick={() => quickPayBill(b)}>
                        <CreditCard size={14} /> Settle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Payment Receipts History */}
      <Card className="table-card">
        <div className="table-toolbar">
          <strong>Received payment history ({visiblePayments.length})</strong>
          <div className="search-field">
            <Search size={16} />
            <Input
              aria-label="Search payments"
              placeholder="Search reference, client..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="grid-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Received on</th>
                <th scope="col">Client</th>
                <th scope="col">Mode</th>
                <th scope="col">Reference</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col">Allocated bills</th>
              </tr>
            </thead>
            <tbody>
              {visiblePayments.map(p => (
                <tr key={p.id}>
                  <td>{p.received_on}</td>
                  <td><strong>{p.client_name}</strong></td>
                  <td>{p.mode || "—"}</td>
                  <td>{p.reference || "—"}</td>
                  <td className="num"><strong>{formatMoney(p.amount)}</strong></td>
                  <td>
                    {p.allocations && p.allocations.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                        {p.allocations.map((a, i) => (
                          <span key={i} style={{ fontSize: "0.75rem", border: "1px solid var(--border)", padding: "0.15rem 0.4rem", borderRadius: "4px" }}>
                            {a.bill_number ?? `Bill #${a.bill}`}: {formatMoney(a.amount)} ({a.kind})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="subtle">Direct / Unallocated</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!visiblePayments.length && (
          <div className="empty-state">
            <strong>No payments recorded yet</strong>
            <p>Record payments when client checks or wire transfers are cleared.</p>
          </div>
        )}
      </Card>
    </section>
  )
}
