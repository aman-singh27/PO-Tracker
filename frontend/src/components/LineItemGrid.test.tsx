import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { LineItemGrid } from "./LineItemGrid"

afterEach(cleanup)
import type { LineItem } from "../api/types"
const line: LineItem = { line_no: 1, description: "", item_type: "material", qty_ordered: "", unit: "", rate: "", gst_rate: "0" }
function Controlled({ onChange = vi.fn(), initial = line }: { onChange?: any; initial?: LineItem }) { const [value, setValue] = useState<LineItem[]>([initial]); return <LineItemGrid value={value} onChange={next => { setValue(next); onChange(next) }}/> }

describe("LineItemGrid", () => {
  it("guesses an item type when the description is entered", async () => {
    const onChange = vi.fn(); const user = userEvent.setup()
    render(<Controlled onChange={onChange}/>)
    await user.type(screen.getByLabelText("Line 1 description"), "Installation work")
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ item_type: "service" })]))
  })
  it("adds a new row with Enter from the final entry cell", async () => {
    const onChange = vi.fn(); const user = userEvent.setup()
    render(<Controlled onChange={onChange} initial={{ ...line, description: "Supply", qty_ordered: "1", unit: "Nos", rate: "10" }}/>)
    await user.click(screen.getByLabelText("Line 1 rate")); await user.keyboard("{Enter}")
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ line_no: 2 })]))
  })
})
