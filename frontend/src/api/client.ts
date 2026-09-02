import axios from "axios";
import type { LoginResponse, Page, PurchaseOrder, ReviewItem, User } from "./types";
const csrf = () => document.cookie.split("; ").find(v => v.startsWith("csrftoken="))?.split("=")[1];
export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true
});
api.interceptors.request.use(config => {
  const token = csrf();
  if (token) config.headers["X-CSRFToken"] = token;
  return config
});
export const authApi = {
  login: (email: string, password: string) => api.post<LoginResponse>("/auth/login", { email, password }),
  me: () => api.get<User>("/auth/me"),
  logout: () => api.post("/auth/logout")
};
export const poApi = {
  list: (params?: Record<string, string>) => api.get<Page<PurchaseOrder>>("/pos", { params }),
  get: (id: string) => api.get<PurchaseOrder>(`/pos/${id}`),
  create: (payload: unknown) => api.post<PurchaseOrder>("/pos", payload),
  update: (id: number, payload: unknown) => api.patch<PurchaseOrder>(`/pos/${id}`, payload),
  dashboard: () => api.get("/dashboard"),
  exportXlsx: () => api.get("/pos/export", { responseType: "blob" })
};
export const attachmentApi = { list: (poId: number) => api.get<Array<{ id:number; label:string; file:string }>>(`/pos/${poId}/attachments`), upload: (poId: number, file: File) => { const body=new FormData(); body.append("file", file); return api.post(`/pos/${poId}/attachments`, body) } }
export const activityApi = { list: (poId: number) => api.get<Array<{id:number;bill_number:string;total_amount:string;ariba_state:string}>>(`/pos/${poId}/activity`), create: (poId: number, payload: unknown) => api.post(`/pos/${poId}/activity`, payload) }
export const settingsApi = { get: () => api.get<{stuck_after_days:number|null;overdue_after_days:number|null}>("/settings"), update: (payload: unknown) => api.patch("/settings",payload) }
export const reviewApi = {
  list: () => api.get<Page<ReviewItem>>("/review"),
  resolve: (id: number, resolution: string) => api.patch(`/review/${id}/resolve`, { resolution })
}
export const importApi = { paste: (payload: { client_name: string; site_name?: string; po_number?: string; tsv: string }) => api.post<PurchaseOrder>("/import/paste", payload) }
