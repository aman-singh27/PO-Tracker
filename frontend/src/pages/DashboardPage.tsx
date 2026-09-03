import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Plus } from "lucide-react"
import type { Dashboard } from "../api/types"
import { poApi } from "../api/client"
import { Button, Card } from "../components/ui"
import { formatMoney } from "../lib/money"

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState("")
  const navigate = useNavigate()

  useEffect(() => {
    poApi.dashboard().then(r => setData(r.data as Dashboard)).catch(() => setError("Could not load dashboard data."))
  }, [])

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

  if (error) {
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
        <div className="inline-alert" role="alert">{error}</div>
      </section>
    )
  }

  if (!data) {
    return <section className="page"><p>Loading dashboard…</p></section>
  }

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
    </section>
  )
}
