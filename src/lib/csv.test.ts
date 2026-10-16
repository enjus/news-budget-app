import { describe, it, expect } from "vitest"
import { csvField, toCsvRow, safeCsvText } from "@/lib/csv"

describe("csvField / toCsvRow", () => {
  it("leaves plain values bare", () => {
    expect(toCsvRow(["Alice Chen", "Reporter"])).toBe("Alice Chen,Reporter")
  })

  it("quotes commas, quotes, and line breaks (including a lone \\r)", () => {
    expect(csvField("Portland, OR")).toBe('"Portland, OR"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField("a\nb")).toBe('"a\nb"')
    expect(csvField("a\rb")).toBe('"a\rb"')
  })
})

describe("safeCsvText", () => {
  it("prefixes values a spreadsheet would run as a formula", () => {
    expect(safeCsvText("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")")
    expect(safeCsvText("@SUM(A1)")).toBe("'@SUM(A1)")
    expect(safeCsvText("+cmd")).toBe("'+cmd")
    expect(safeCsvText("-2+3")).toBe("'-2+3")
  })

  it("leaves phone numbers and ordinary text alone", () => {
    expect(safeCsvText("+44 20 7946 0958")).toBe("+44 20 7946 0958")
    expect(safeCsvText("(503) 555-0123")).toBe("(503) 555-0123")
    expect(safeCsvText("Business Editor")).toBe("Business Editor")
    expect(safeCsvText("")).toBe("")
  })
})
