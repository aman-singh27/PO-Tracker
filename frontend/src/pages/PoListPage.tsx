import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Plus, Search } from "lucide-react"
import type { PurchaseOrder } from "../api/types"
import { poApi } from "../api/client"
import { Button, Card, Input } from "../components/ui"
import { StatusBadge } from "../components/StatusBadge"
import { formatMoney } from "../lib/money"

const sample: PurchaseOrder[] = [{ id: 1, po_number: "8100013678", po_date: "2025-01-07", client_name: "HCL Tech", site_name: "AN22", status: "PART_BILLED", total_amount: "105964.00", amount_billed: "89800.00", needs_review: true }, { id: 2, po_number: "9200160448", po_date: "2025-01-15", client_name: "Metlife", site_name: "K C Infra", status: "BILLED", total_amount: "44840.00", amount_billed: "44840.00" }]
export function PoListPage({ dashboard = false }: { dashboard?: boolean }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]); const [query, setQuery] = useState(""); const [error, setError] = useState(""); const navigate = useNavigate()
  useEffect(() => { poApi.list().then(r => setOrders(r.data.results ?? r.data)).catch(() => { setError("Could not load data."); setOrders(sample) }) }, [])
  const visible = query ? orders.filter(order => `${order.po_number} ${order.client_name} ${order.site_name || ""}`.toLowerCase().includes(query.toLowerCase())) : orders
  const totalOutstanding = visible.reduce((sum, po) => sum + (parseFloat(po.total_amount || "0") - parseFloat(po.amount_billed || "0")), 0)
  const pendingLines = visible.filter(po => po.needs_review).length
  if (dashboard) return <section className="page"><header className="page-header"><div><p className="eyebrow">Purchasing</p><h1>Dashboard</h1><p className="subtle">A clear view of pending work and receivables.</p></div><Button onClick={() => navigate("/po/new")}><Plus size={17} /> Add PO</Button></header><div className="stat-grid"><Card><p>Outstanding</p><strong className="stat-num money-outstanding">{formatMoney(totalOutstanding.toString())}</strong><small>across {visible.length} purchase orders</small></Card><Card><p>Pending work</p><strong className="stat-num">{visible.length} orders</strong><small>Total POs in system</small></Card><Card><p>Review queue</p><strong className="stat-num">{pendingLines}</strong><small>Items need review</small></Card></div><PoTable orders={visible} onSearch={setQuery} error={error} /></section>
  return <section className="page"><header className="page-header"><div><p className="eyebrow">Purchasing</p><h1>Purchase orders</h1></div><Button onClick={() => navigate("/po/new")}><Plus size={17} /> Add PO</Button></header><PoTable orders={visible} onSearch={setQuery} error={error} /></section>
}
function PoTable({ orders, onSearch, error }: { orders: PurchaseOrder[]; onSearch: (value: string) => void; error: string }) { return <Card className="table-card">{error && <div className="inline-alert" role="alert">{error}</div>}<div className="table-toolbar"><strong>Purchase orders</strong><div className="search-field"><Search size={16}/><Input aria-label="Search purchase orders" placeholder="Search PO, client or site" onChange={e => onSearch(e.target.value)} /></div></div><div className="grid-wrap"><table className="data-table"><thead><tr><th scope="col">PO number</th><th scope="col">Client</th><th scope="col">Site</th><th scope="col">Status</th><th scope="col" className="num">Amount</th></tr></thead><tbody>{orders.map(po => <tr className={po.needs_review ? "review-row" : ""} key={po.id}><td><Link to={`/po/${po.id}`}>{po.po_number}</Link></td><td>{po.client_name}</td><td>{po.site_name || "—"}</td><td><StatusBadge status={po.status} /></td><td className="num">{formatMoney(po.total_amount)}</td></tr>)}</tbody></table></div>{!orders.length && <div className="empty-state"><strong>No purchase orders found</strong><p>Try a PO number, client, site, bill number, or description.</p></div>}</Card> }
