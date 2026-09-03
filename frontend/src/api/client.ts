import axios from "axios"
import type {
  Bill,
  Challan,
  ClientRecord,
  Dashboard,
  LoginResponse,
  Page,
  Payment,
  PendingLine,
  PurchaseOrder,
  ReviewItem,
  User,
} from "./types"

const csrf = () =>
  document.cookie.split("; ").find(v => v.startsWith("csrftoken="))?.split("=")[1]

export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
})

api.interceptors.request.use(config => {
  const token = csrf()
  if (token) config.headers["X-CSRFToken"] = token
  return config
})

export const authApi = {
  login: (email: string, password: string) => api.post<LoginResponse>("/auth/login", { email, password }),
  me: () => api.get<User>("/auth/me"),
  logout: () => api.post("/auth/logout"),
}

export const poApi = {
  list: (params?: Record<string, string>) => api.get<Page<PurchaseOrder>>("/pos", { params }),
  get: (id: string | number) => api.get<PurchaseOrder>(`/pos/${id}`),
  create: (payload: unknown) => api.post<PurchaseOrder>("/pos", payload),
  update: (id: number, payload: unknown) => api.patch<PurchaseOrder>(`/pos/${id}`, payload),
  revise: (id: number, payload: unknown) => api.post<PurchaseOrder>(`/pos/${id}/revise`, payload),
  cancel: (id: number, payload: unknown) => api.post<PurchaseOrder>(`/pos/${id}/cancel`, payload),
  markWorkDone: (lineId: number, date?: string) => api.post(`/lines/${lineId}/work-done`, { work_done_on: date }),
  markApproved: (lineId: number, date?: string) => api.post(`/lines/${lineId}/approve`, { client_approved_on: date }),
  dashboard: () => api.get<Dashboard>("/dashboard"),
  exportXlsx: () => api.get<Blob>("/pos/export", { responseType: "blob" }),
  search: (q: string) => api.get<PurchaseOrder[]>("/search", { params: { q } }),
  pending: () => api.get<PendingLine[]>("/pos/pending"),
}

export const challanApi = {
  list: () => api.get<Challan[]>("/challans"),
  create: (payload: unknown) => api.post<Challan>("/challans", payload),
}

export const billApi = {
  list: (params?: { ariba_state?: string }) => api.get<Bill[]>("/bills", { params }),
  get: (id: number) => api.get<Bill>(`/bills/${id}`),
  create: (payload: unknown) => api.post<Bill>("/bills", payload),
  update: (id: number, payload: unknown) => api.patch<Bill>(`/bills/${id}`, payload),
  delete: (id: number) => api.delete(`/bills/${id}`),
}

export const paymentApi = {
  list: () => api.get<Payment[]>("/payments"),
  create: (payload: unknown) => api.post<Payment>("/payments", payload),
}

export const clientApi = {
  list: () => api.get<ClientRecord[]>("/clients"),
  create: (payload: unknown) => api.post<ClientRecord>("/clients", payload),
}

export const siteApi = {
  list: (params?: { client?: string }) => api.get<any[]>("/sites", { params }),
  create: (payload: unknown) => api.post<any>("/sites", payload),
}

export const usersApi = {
  list: () => api.get<any[]>("/users"),
  create: (payload: unknown) => api.post<any>("/users/create", payload),
}

export const legalEntityApi = {
  list: () => api.get<any[]>("/legal-entities"),
  create: (payload: unknown) => api.post<any>("/legal-entities", payload),
}

export const attachmentApi = {
  list: (poId: number) =>
    api.get<Array<{ id: number; label: string; file: string }>>(`/pos/${poId}/attachments`),
  upload: (poId: number, file: File) => {
    const body = new FormData()
    body.append("file", file)
    return api.post(`/pos/${poId}/attachments`, body)
  },
}

export const activityApi = {
  list: (poId: number) =>
    api.get<Array<{ id: number; bill_number: string; total_amount: string; ariba_state: string }>>(`/pos/${poId}/activity`),
  create: (poId: number, payload: unknown) => api.post(`/pos/${poId}/activity`, payload),
}

export const settingsApi = {
  get: () => api.get<{ stuck_after_days: number | null; overdue_after_days: number | null }>("/settings"),
  update: (payload: unknown) => api.patch("/settings", payload),
}

export const reviewApi = {
  list: () => api.get<Page<ReviewItem>>("/review"),
  resolve: (id: number, resolution: string) => api.patch(`/review/${id}/resolve`, { resolution }),
}

export const importApi = {
  paste: (payload: { client_name: string; site_name?: string; po_number?: string; tsv: string }) =>
    api.post<PurchaseOrder>("/import/paste", payload),
}
