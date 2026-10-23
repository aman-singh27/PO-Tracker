import { useEffect, useState } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { Toaster } from "sonner"
import { AppShell } from "./components/AppShell"
import { LoginPage } from "./pages/LoginPage"
import { ForcePasswordChangePage } from "./pages/ForcePasswordChangePage"
import { DashboardPage } from "./pages/DashboardPage"
import { PoListPage } from "./pages/PoListPage"
import { PoDetailPage } from "./pages/PoDetailPage"
import { PoEditorPage } from "./pages/PoEditorPage"
import { ImportPage } from "./pages/ImportPage"
import { ChallansPage } from "./pages/ChallansPage"
import { BillsPage } from "./pages/BillsPage"
import { PaymentsPage } from "./pages/PaymentsPage"
import { SettingsPage } from "./pages/SettingsPage"
import { ReviewPage } from "./pages/ReviewPage"
import { SitesPage } from "./pages/SitesPage"
import { UsersPage } from "./pages/UsersPage"
import { useAuthStore } from "./stores/auth"
import { authApi } from "./api/client"

function Protected({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (user.force_password_change) return <Navigate to="/change-password" replace />
  return <AppShell>{children}</AppShell>
}

export default function App() {
  const [loading, setLoading] = useState(true)
  const setUser = useAuthStore(s => s.setUser)

  useEffect(() => {
    authApi.me()
      .then(res => {
        const { user: u, role, force_password_change } = res.data
        setUser({ ...u, role, force_password_change })
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [setUser])

  if (loading) return null

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ForcePasswordChangePage />} />
        <Route path="/" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/po" element={<Protected><PoListPage /></Protected>} />
        <Route path="/po/new" element={<Protected><PoEditorPage /></Protected>} />
        <Route path="/po/import" element={<Protected><ImportPage /></Protected>} />
        <Route path="/po/:id" element={<Protected><PoDetailPage /></Protected>} />
        <Route path="/challans" element={<Protected><ChallansPage /></Protected>} />
        <Route path="/bills" element={<Protected><BillsPage /></Protected>} />
        <Route path="/payments" element={<Protected><PaymentsPage /></Protected>} />
        <Route path="/sites" element={<Protected><SitesPage /></Protected>} />
        <Route path="/users" element={<Protected><UsersPage /></Protected>} />
        <Route path="/review" element={<Protected><ReviewPage /></Protected>} />
        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors position="top-right" />
    </BrowserRouter>
  )
}
