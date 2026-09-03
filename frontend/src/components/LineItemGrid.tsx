import { useRef, useEffect } from "react"
import type { LineItem } from "../api/types"
import { guessItemType, parsePasteBlock } from "../lib/po"

type Props = { value: LineItem[]; onChange: (lines: LineItem[]) => void; gstRate?: string }
const blank = (line_no: number, gst_rate = "0"): LineItem => ({
  line_no, description: "", item_type: "material", qty_ordered: "", unit: "", rate: "", gst_rate,
})
const lineAmount = (qty: string, rate: string): string => {
  const q = parseFloat(qty) || 0
  const r = parseFloat(rate) || 0
  return (q * r).toFixed(2)
}

export function LineItemGrid({ value, onChange, gstRate = "0" }: Props) {
  const inputs = useRef<Array<HTMLInputElement | HTMLSelectElement | null>>([])
  const rows = value.length ? value : [blank(1, gstRate)]

  // Seed one blank row when the grid is empty — but only once, not on every render.
  // We intentionally omit onChange/rows from deps because including them would create
  // an infinite loop (onChange → new value → effect fires again).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!value.length) onChange([blank(1, gstRate)]) }, [])

  const change = (row: number, key: keyof LineItem, text: string) => {
    const next = rows.map((line, i) =>
      i === row
        ? { ...line, [key]: text, ...(key === "description" ? { item_type: guessItemType(text) } : {}) }
        : line
    )
    onChange(next)
  }

  const move = (e: React.KeyboardEvent, row: number, col: number) => {
    if (e.key === "Enter" && col === 4) {
      e.preventDefault()
      onChange([...rows, blank(rows.length + 1, gstRate)])
      setTimeout(() => inputs.current[rows.length * 5]?.focus())
      return
    }
    if (e.key === "d" && e.ctrlKey && row > 0) {
      e.preventDefault()
      const key = (["description", "item_type", "qty_ordered", "unit", "rate", "gst_rate"] as const)[col]
      change(row, key, String(rows[row - 1][key] ?? ""))
    }
  }

  const paste = (e: React.ClipboardEvent, row: number, col: number) => {
    const text = e.clipboardData.getData("text")
    if (col !== 0 || !text.includes("\n")) return
    e.preventDefault()
    const incoming = parsePasteBlock(text, gstRate)
    onChange([
      ...rows.slice(0, row),
      ...incoming.map((line, i) => ({ ...line, line_no: row + i + 1 })),
      ...rows.slice(row + 1).map((line, i) => ({ ...line, line_no: row + incoming.length + i + 1 })),
    ])
  }

  const ref = (index: number) => (node: HTMLInputElement | HTMLSelectElement | null) => {
    inputs.current[index] = node
  }

  return (
    <div className="grid-wrap" aria-label="Line item grid">
      <table className="data-table line-grid">
        <thead>
          <tr>
            <th scope="col">Description</th>
            <th scope="col">Type</th>
            <th scope="col" className="num">Qty</th>
            <th scope="col">Unit</th>
            <th scope="col" className="num">Rate</th>
            <th scope="col" className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line, row) => (
            <tr key={row}>
              <td>
                <input
                  ref={ref(row * 5)}
                  aria-label={`Line ${row + 1} description`}
                  value={line.description}
                  onPaste={e => paste(e, row, 0)}
                  onKeyDown={e => move(e, row, 0)}
                  onChange={e => change(row, "description", e.target.value)}
                />
              </td>
              <td>
                <select
                  ref={ref(row * 5 + 1)}
                  aria-label={`Line ${row + 1} type`}
                  value={line.item_type}
                  onKeyDown={e => move(e, row, 1)}
                  onChange={e => change(row, "item_type", e.target.value)}
                >
                  <option value="material">Material</option>
                  <option value="service">Service</option>
                </select>
              </td>
              <td>
                <input
                  ref={ref(row * 5 + 2)}
                  inputMode="decimal"
                  className="num"
                  aria-label={`Line ${row + 1} quantity`}
                  value={line.qty_ordered}
                  onKeyDown={e => move(e, row, 2)}
                  onChange={e => change(row, "qty_ordered", e.target.value)}
                />
              </td>
              <td>
                <input
                  ref={ref(row * 5 + 3)}
                  aria-label={`Line ${row + 1} unit`}
                  value={line.unit}
                  onKeyDown={e => move(e, row, 3)}
                  onChange={e => change(row, "unit", e.target.value)}
                />
              </td>
              <td>
                <input
                  ref={ref(row * 5 + 4)}
                  inputMode="decimal"
                  className="num"
                  aria-label={`Line ${row + 1} rate`}
                  value={line.rate}
                  onKeyDown={e => move(e, row, 4)}
                  onChange={e => change(row, "rate", e.target.value)}
                />
              </td>
              <td className="num">{lineAmount(line.qty_ordered, line.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="helper">
        Tab moves between cells · Enter on the last cell adds a row · Ctrl+D copies from above · Paste rows from Excel into a description cell.
      </p>
    </div>
  )
}
