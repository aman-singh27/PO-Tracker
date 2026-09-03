import {
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Menu,
  SlidersHorizontal,
  Truck,
  Upload,
} from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { Button } from "./ui"
import { useAuthStore } from "../stores/auth"
import { authApi } from "../api/client"
import "./shell.css"

const nav = [
  ["/", "Dashboard", LayoutDashboard],
  ["/po", "Purchase orders", FileSpreadsheet],
  ["/challans", "Challans", Truck],
  ["/bills", "Bills & Ariba", FileText],
  ["/payments", "Payments", IndianRupee],
  ["/sites", "Sites", Upload],
  ["/users", "Users", Upload],
  ["/po/import", "Import", Upload],
  ["/review", "Review queue", ClipboardCheck],
  ["/settings", "Alert settings", SlidersHorizontal],
] as const

function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard"
  if (pathname.startsWith("/challans")) return "Delivery challans"
  if (pathname.startsWith("/bills")) return "Bills & Ariba"
  if (pathname.startsWith("/payments")) return "Payments & Settlement"
  if (pathname.startsWith("/po/import")) return "Fast PO intake"
  if (pathname.startsWith("/review")) return "Review queue"
  if (pathname.startsWith("/settings")) return "Alert settings"
  return "Purchase orders"
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const user = useAuthStore(s => s.user)
  const setUser = useAuthStore(s => s.setUser)

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar">
        <div className="brand">
          <span aria-hidden="true">◆</span> PO TRACK
          <small>OPERATIONS</small>
        </div>
        <nav aria-label="Primary navigation">
          {nav.map(([path, label, Icon]) => (
            <Link
              key={path}
              className={pathname === path ? "active" : ""}
              to={path}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="profile">
          <strong>{user?.name ?? "User"}</strong>
          <small>Full tracker access</small>
          <Button
            variant="outline"
            onClick={async () => {
              await authApi.logout()
              setUser(null)
            }}
          >
            <LogOut size={16} /> Sign out
          </Button>
        </div>
      </aside>

      <header className="topbar">
        <Button aria-label="Open navigation" variant="outline" className="mobile-menu">
          <Menu />
        </Button>
        <span className="crumb">Purchasing</span>
        <span className="slash">/</span>
        <strong>{getPageTitle(pathname)}</strong>
      </header>

      <main id="main">{children}</main>
    </div>
  )
}
