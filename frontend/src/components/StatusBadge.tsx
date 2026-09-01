import { Badge } from "./ui"

const tones: Record<string, string> = { BILLED: "billed", PART_BILLED: "part_billed", PART_DELIVERED: "warning", OVER_BILLED: "danger" }
export function StatusBadge({ status, quantity }: { status?: string; quantity?: string }) {
  const label = (status || "ORDERED").replaceAll("_", " ")
  return <Badge tone={tones[status || ""] || "ordered"}>{label}{quantity ? ` · ${quantity}` : ""}</Badge>
}
