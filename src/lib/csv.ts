// Shared CSV helpers for the export routes (/api/schedule/export,
// /api/roster/export). RFC 4180-style quoting; covered by csv.test.ts.

export function csvField(value: string): string {
  // \r alone (no \n) is still a row-boundary character for plenty of CSV
  // consumers (old Mac line endings, paste artifacts) — quote on any of
  // \r, \n, or a comma/quote, not just \n.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}

/**
 * Neutralize spreadsheet formula injection in user-entered text: Excel,
 * Sheets, and Numbers evaluate a cell starting with = + - @ (or tab/CR) as a
 * formula, so a title like `=HYPERLINK(...)` would run when the CSV is opened.
 * Prefixing an apostrophe makes the cell literal text. Phone-number-shaped
 * values ("+44 20 7946 0958") are left alone — they're data, not formulas.
 */
export function safeCsvText(value: string): string {
  if (/^[+-][\d\s().-]+$/.test(value)) return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** UTF-8 byte-order mark, so Excel opens non-ASCII text (names, addresses) correctly. */
export const CSV_BOM = "﻿";
