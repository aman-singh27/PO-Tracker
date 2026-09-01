import type { LineItem } from "../api/types"

export function guessItemType(description: string): LineItem["item_type"] {
  return /installation|providing|fixing|dismantling|service|labou?r/i.test(description) ? "service" : "material"
}

export function parsePasteBlock(value: string, gstRate = "0"): LineItem[] {
  return value.trim().split(/\r?\n/).filter(Boolean).map((row, index) => {
    const [description = "", qty = "", unit = "", rate = ""] = row.split("\t").map(cell => cell.trim())
    return { line_no: index + 1, description, item_type: guessItemType(description), qty_ordered: qty, unit, rate, gst_rate: gstRate }
  })
}
