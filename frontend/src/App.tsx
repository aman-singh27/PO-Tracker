import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { Toaster } from "sonner"
import { AppShell } from "./components/AppShell"
import { LoginPage } from "./pages/LoginPage"
import { PoListPage } from "./pages/PoListPage"
import { PoDetailPage } from "./pages/PoDetailPage"
import { PoEditorPage } from "./pages/PoEditorPage"
import { ImportPage } from "./pages/ImportPage"
import { ReviewPage } from "./pages/ReviewPage"
import { useAuthStore } from "./stores/auth"
function Protected({children}:{children:React.ReactNode}){return useAuthStore(s=>s.user)?<AppShell>{children}</AppShell>:<Navigate to="/login" replace/>}
export default function App(){return <BrowserRouter><Routes><Route path="/login" element={<LoginPage/>}/><Route path="/" element={<Protected><PoListPage dashboard/></Protected>}/><Route path="/po" element={<Protected><PoListPage/></Protected>}/><Route path="/po/new" element={<Protected><PoEditorPage/></Protected>}/><Route path="/po/import" element={<Protected><ImportPage/></Protected>}/><Route path="/po/:id" element={<Protected><PoDetailPage/></Protected>}/><Route path="/review" element={<Protected><ReviewPage/></Protected>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes><Toaster richColors position="top-right"/></BrowserRouter>}
