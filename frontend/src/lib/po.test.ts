import { describe, expect, it } from "vitest"
import { guessItemType, parsePasteBlock } from "./po"
describe("PO entry helpers", () => {
  it("guesses service from work descriptions", () => expect(guessItemType("Installation and fixing of cable tray")).toBe("service"))
  it("defaults other descriptions to material", () => expect(guessItemType("Supply of fixtures")).toBe("material"))
  it("turns a pasted Excel block into line items", () => expect(parsePasteBlock("Supply\t20\tNos\t1200\nInstallation\t1\tJob\t5000", "18")).toMatchObject([{ line_no: 1, item_type: "material", qty_ordered: "20" }, { line_no: 2, item_type: "service", gst_rate: "18" }]))
})
