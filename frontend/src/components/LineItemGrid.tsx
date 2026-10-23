import { useRef, useEffect } from "react"
import type { LineItem } from "../api/types"
import { guessItemType, parsePasteBlock } from "../lib/po"

type Props = { 
  value: LineItem[]; 
  onChange: (lines: LineItem[]) => void; 
  gstRate?: string;
  readOnly?: boolean;
  renderStatus?: (line: LineItem) => React.ReactNode;
}

const blank = (line_no: number, gst_rate = "0"): LineItem => ({
  line_no, description: "", item_type: "material", qty_ordered: "", unit: "", rate: "", gst_rate,
})
const lineAmount = (qty: string, rate: string): string => {
  const q = parseFloat(qty) || 0
  const r = parseFloat(rate) || 0
  return (q * r).toFixed(2)
}

export function LineItemGrid({ value, onChange, gstRate = "0", readOnly, renderStatus }: Props) {
  const inputs = useRef<Array<HTMLInputElement | HTMLSelectElement | null>>([])
  const rows = value.length ? value : [blank(1, gstRate)]

  useEffect(() => { if (!value.length && !readOnly) onChange([blank(1, gstRate)]) }, [value.length, readOnly])

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
            {readOnly && renderStatus && <th scope="col">Status</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((line, row) => (
            <tr key={line.id ?? row}>
              <td>
                {readOnly ? (
                  <span style={{ padding: "0.25rem 0.5rem", display: "block" }}>{line.description}</span>
                ) : (
                  <input
                    ref={ref(row * 5)}
                    aria-label={`Line ${row + 1} description`}
                    value={line.description}
                    onPaste={e => paste(e, row, 0)}
                    onKeyDown={e => move(e, row, 0)}
                    onChange={e => change(row, "description", e.target.value)}
                  />
                )}
              </td>
              <td>
                {readOnly ? (
                  <span style={{ padding: "0.25rem 0.5rem", display: "block", textTransform: "capitalize" }}>{line.item_type}</span>
                ) : (
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
                )}
              </td>
              <td className={readOnly ? "num" : ""}>
                {readOnly ? (
                  <span style={{ padding: "0.25rem 0.5rem", display: "block" }}>{line.qty_ordered}</span>
                ) : (
                  <input
                    ref={ref(row * 5 + 2)}
                    inputMode="decimal"
                    className="num"
                    aria-label={`Line ${row + 1} quantity`}
                    value={line.qty_ordered}
                    onKeyDown={e => move(e, row, 2)}
                    onChange={e => change(row, "qty_ordered", e.target.value)}
                  />
                )}
              </td>
              <td>
                {readOnly ? (
                  <span style={{ padding: "0.25rem 0.5rem", display: "block" }}>{line.unit}</span>
                ) : (
                  <input
                    ref={ref(row * 5 + 3)}
                    aria-label={`Line ${row + 1} unit`}
                    value={line.unit}
                    onKeyDown={e => move(e, row, 3)}
                    onChange={e => change(row, "unit", e.target.value)}
                  />
                )}
              </td>
              <td className={readOnly ? "num" : ""}>
                {readOnly ? (
                  <span style={{ padding: "0.25rem 0.5rem", display: "block" }}>{line.rate}</span>
                ) : (
                  <input
                    ref={ref(row * 5 + 4)}
                    inputMode="decimal"
                    className="num"
                    aria-label={`Line ${row + 1} rate`}
                    value={line.rate}
                    onKeyDown={e => move(e, row, 4)}
                    onChange={e => change(row, "rate", e.target.value)}
                  />
                )}
              </td>
              <td className="num"><span style={{ padding: readOnly ? "0.25rem 0.5rem" : "0", display: "block" }}>{lineAmount(line.qty_ordered, line.rate)}</span></td>
              {readOnly && renderStatus && <td>{renderStatus(line)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            type="button"
            className="button"
            style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)", padding: "0.5rem 1rem", borderRadius: "4px", cursor: "pointer", fontWeight: 500 }}
            onClick={() => onChange([...rows, blank(rows.length + 1, gstRate)])}
          >
            + Add row
          </button>
          <p className="helper" style={{ margin: 0 }}>
            Tab moves between cells · Enter on the last cell adds a row · Ctrl+D copies from above · Paste rows from Excel into a description cell.
          </p>
        </div>
      )}
    </div>
  )
}
