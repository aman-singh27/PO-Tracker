import axios from "axios";
import type { Page, PurchaseOrder, ReviewItem, User } from "./types";
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
  login: (email: string, password: string) => api.post<User>("/auth/login", { email, password }),
  me: () => api.get<User>("/auth/me"),
  logout: () => api.post("/auth/logout")
};
export const poApi = {
  list: (params?: Record<string, string>) => api.get<Page<PurchaseOrder>>("/pos", { params }),
  get: (id: string) => api.get<PurchaseOrder>(`/pos/${id}`),
  create: (payload: unknown) => api.post<PurchaseOrder>("/pos", payload)
};
export const reviewApi = {
  list: () => api.get<Page<ReviewItem>>("/review"),
  resolve: (id: number, resolution: string) => api.patch(`/review/${id}/resolve`, { resolution })
}