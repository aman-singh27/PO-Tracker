import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { Toaster } from "sonner"
import { AppShell } from "./components/AppShell"
import { LoginPage } from "./pages/LoginPage"
import { ForcePasswordChangePage } from "./pages/ForcePasswordChangePage"
import { PoListPage } from "./pages/PoListPage"
import { PoDetailPage } from "./pages/PoDetailPage"
import { PoEditorPage } from "./pages/PoEditorPage"
import { ImportPage } from "./pages/ImportPage"
import { SettingsPage } from "./pages/SettingsPage"
import { ReviewPage } from "./pages/ReviewPage"
import { useAuthStore } from "./stores/auth"

function Protected({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.force_password_change) return <Navigate to="/change-password" replace />
  return <AppShell>{children}</AppShell>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ForcePasswordChangePage />} />
        <Route path="/" element={<Protected><PoListPage dashboard /></Protected>} />
        <Route path="/po" element={<Protected><PoListPage /></Protected>} />
        <Route path="/po/new" element={<Protected><PoEditorPage /></Protected>} />
        <Route path="/po/import" element={<Protected><ImportPage /></Protected>} />
        <Route path="/po/:id" element={<Protected><PoDetailPage /></Protected>} />
        <Route path="/review" element={<Protected><ReviewPage /></Protected>} />
        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors position="top-right" />
    </BrowserRouter>
  )
}
