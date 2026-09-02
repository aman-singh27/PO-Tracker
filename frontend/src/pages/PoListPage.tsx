import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Download, Plus, Search } from "lucide-react"
import type { Dashboard, PurchaseOrder } from "../api/types"
import { poApi } from "../api/client"
import { Button, Card, Input } from "../components/ui"
import { StatusBadge } from "../components/StatusBadge"
import { formatMoney } from "../lib/money"

export function PoListPage({ dashboard = false }: { dashboard?: boolean }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [data, setData] = useState<Dashboard | null>(null)
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const navigate = useNavigate()

  useEffect(() => {
    poApi.list().then(r => setOrders(r.data.results ?? (r.data as unknown as PurchaseOrder[]))).catch(() => setError("Could not load purchase orders."))
    if (dashboard) {
      poApi.dashboard().then(r => setData(r.data as Dashboard)).catch(() => setError("Could not load dashboard data."))
    }
  }, [dashboard])

  const visible = query
    ? orders.filter(o => `${o.po_number} ${o.client_name} ${o.site_name ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    : orders

  async function downloadExport() {
    try {
      const r = await poApi.exportXlsx()
      const url = URL.createObjectURL(new Blob([r.data as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
      const a = document.createElement("a")
      a.href = url
      a.download = "purchase-orders.xlsx"
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("Export failed. Try again.")
    }
  }

  if (dashboard) {
    return (
      <section className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Purchasing control room</p>
            <h1>What needs attention</h1>
            <p className="subtle">Stuck work, receivables and Ariba follow-ups — without digging through a sheet.</p>
          </div>
          <Button onClick={() => navigate("/po/new")}><Plus size={17} /> Add PO</Button>
        </header>

        <div className="stat-grid">
          <Card>
            <p>Outstanding</p>
            <strong className="stat-num money-outstanding">{formatMoney(data?.metrics.outstanding_amount || "0")}</strong>
            <small>{data?.metrics.overdue_bill_count ?? 0} overdue bills</small>
          </Card>
          <Card>
            <p>Stuck work</p>
            <strong className="stat-num">{data?.metrics.pending_items ?? 0}</strong>
            <small>Items waiting for the next step</small>
          </Card>
          <Card>
            <p>Ariba backlog</p>
            <strong className="stat-num">{data?.metrics.ariba_backlog_count ?? 0}</strong>
            <small>Pending upload or rejected</small>
          </Card>
        </div>

        <div className="dashboard-grid">
          <ActionList
            title="Stuck work"
            empty="No work is currently waiting."
            items={(data?.stuck_items ?? []).map(item => ({
              title: item.po_number,
              detail: `${item.description} · ${item.status}${item.days_waiting == null ? "" : ` · ${item.days_waiting}d`}`,
              to: `/po/${item.po_id}`,
            }))}
          />
          <ActionList
            title="Overdue receivables"
            empty="No overdue bills — add payment terms to a client to enable ageing."
            items={(data?.overdue_bills ?? []).map(item => ({
              title: item.bill_number,
              detail: `${item.client} · ${formatMoney(item.outstanding_amount)} · ${item.age_days}d`,
              to: "/po",
            }))}
          />
          <ActionList
            title="Ariba backlog"
            empty="No bill currently needs an Ariba update."
            items={(data?.ariba_backlog ?? []).map(item => ({
              title: item.bill_number,
              detail: `${item.client} · ${item.ariba_state.replaceAll("_", " ")}`,
              to: "/po",
            }))}
          />
        </div>

        {data?.gst && (
          <Card className="form-card">
            <div className="section-heading">
              <div>
                <h2>GST snapshot</h2>
                <p>Cumulative billed amounts across all non-review bills.</p>
              </div>
            </div>
            <div className="stat-grid" style={{ marginBottom: 0 }}>
              <Card><p>Basic billed</p><strong className="stat-num">{formatMoney(data.gst.basic_billed)}</strong></Card>
              <Card><p>GST billed</p><strong className="stat-num">{formatMoney(data.gst.gst_billed)}</strong></Card>
              <Card><p>Gross billed</p><strong className="stat-num">{formatMoney(data.gst.gross_billed)}</strong></Card>
            </div>
          </Card>
        )}

        <PoTable orders={visible} onSearch={setQuery} error={error} />
      </section>
    )
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Purchasing</p>
          <h1>Purchase orders</h1>
          <p className="subtle">Search a PO number, then open it to update the complete cycle.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button variant="outline" onClick={downloadExport}><Download size={16} /> Export Excel</Button>
          <Button onClick={() => navigate("/po/new")}><Plus size={17} /> Add PO</Button>
        </div>
      </header>
      <PoTable orders={visible} onSearch={setQuery} error={error} />
    </section>
  )
}

function ActionList({ title, empty, items }: {
  title: string
  empty: string
  items: Array<{ title: string; detail: string; to: string }>
}) {
  return (
    <Card className="action-card">
      <div className="table-toolbar">
        <strong>{title}</strong>
        <span className="subtle">{items.length}</span>
      </div>
      {items.length ? (
        <ul>
          {items.slice(0, 6).map((item, i) => (
            <li key={`${item.title}-${i}`}>
              <Link to={item.to}>{item.title}</Link>
              <small>{item.detail}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-action">{empty}</p>
      )}
    </Card>
  )
}

function PoTable({ orders, onSearch, error }: {
  orders: PurchaseOrder[]
  onSearch: (value: string) => void
  error: string
}) {
  return (
    <Card className="table-card">
      {error && <div className="inline-alert" role="alert">{error}</div>}
      <div className="table-toolbar">
        <strong>Purchase orders</strong>
        <div className="search-field">
          <Search size={16} />
          <Input
            aria-label="Search purchase orders"
            placeholder="Search PO, client or site"
            onChange={e => onSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="grid-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">PO number</th>
              <th scope="col">Client</th>
              <th scope="col">Site</th>
              <th scope="col">Lifecycle</th>
              <th scope="col" className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(po => (
              <tr className={po.needs_review ? "review-row" : ""} key={po.id}>
                <td><Link to={`/po/${po.id}`}>{po.po_number}</Link></td>
                <td>{po.client_name}</td>
                <td>{po.site_name || "—"}</td>
                <td><StatusBadge status={po.lifecycle_stage} /></td>
                <td className="num">{formatMoney(po.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!orders.length && (
        <div className="empty-state">
          <strong>No purchase orders found</strong>
          <p>Try a PO number, client, site, bill number, or description.</p>
        </div>
      )}
    </Card>
  )
}
