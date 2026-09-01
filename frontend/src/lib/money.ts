import Decimal from "decimal.js"

/** Formats API money strings without converting them to IEEE-754 numbers. */
export function formatMoney(value: string | undefined | null): string {
  const amount = new Decimal(value || "0")
  const absolute = amount.abs().toFixed(2)
  const [whole, decimal] = absolute.split(".")
  const tail = whole.slice(-3)
  const head = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")
  const formatted = `₹${head ? `${head},` : ""}${tail}.${decimal}`
  return amount.isNegative() ? `(${formatted})` : formatted
}

export function lineAmount(quantity: string, rate: string): string {
  try { return new Decimal(quantity || "0").mul(rate || "0").toFixed(2) }
  catch { return "0.00" }
}

export function subtractMoney(total: string, settled: string): string {
  return new Decimal(total || "0").minus(settled || "0").toFixed(2)
}
