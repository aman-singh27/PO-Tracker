import { describe, expect, it } from "vitest"
import { formatMoney, lineAmount } from "./money"

describe("money formatting", () => {
  it("uses Indian number grouping for API string values", () => expect(formatMoney("120777682")).toBe("₹12,07,77,682.00"))
  it("renders deductions in parentheses", () => expect(formatMoney("-4484")).toBe("(₹4,484.00)"))
  it("calculates line amounts through Decimal", () => expect(lineAmount("0.1", "0.2")).toBe("0.02"))
})
