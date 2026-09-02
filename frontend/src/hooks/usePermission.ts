import { useAuthStore } from "../stores/auth"
import type { Role } from "../api/types"

type Permission = "view_pos" | "create_po" | "edit_po" | "short_close" | "record_money" | "view_review" | "admin"

const MATRIX: Record<Permission, Role[]> = {
  view_pos: ["owner", "staff", "accounts", "admin"],
  create_po: ["staff", "admin"],
  edit_po: ["staff", "admin"],
  short_close: ["owner", "admin"],
  record_money: ["accounts", "admin"],
  view_review: ["admin"],
  admin: ["admin"],
}

export function usePermission(permission: Permission): boolean {
  const user = useAuthStore((s) => s.user)
  if (!user) return false
  return MATRIX[permission].includes(user.role)
}

export function useRole(): Role | null {
  return useAuthStore((s) => s.user?.role ?? null)
}
