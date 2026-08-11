/**
 * Comment bodies are stored as plain text. The literal "@Full Name" text stays in
 * the body (so it reads correctly in email), while the authoritative mention list
 * lives in CommentMention rows.
 *
 * This module turns that plain text into (a) React-renderable tokens and
 * (b) escaped HTML for email — both with URLs hyperlinked.
 */

// Matches http(s):// URLs and bare www. hosts. Trailing sentence punctuation is
// trimmed off the match below so "see www.example.com." doesn't swallow the period.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/** Strip trailing punctuation that is almost certainly sentence text, not URL. */
function trimUrl(match: string): string {
  let url = match.replace(TRAILING_PUNCTUATION, "");
  // Keep a closing paren that has a matching opener inside the URL,
  // e.g. Wikipedia-style /wiki/Foo_(bar)
  if (match.endsWith(")") && countChar(url, "(") > countChar(url, ")")) {
    url += ")";
  }
  return url;
}

function countChar(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

/** Full href for a matched URL — bare "www." hosts need a scheme. */
export function hrefFor(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export type CommentToken =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string }
  | { type: "mention"; value: string };

/**
 * Split a comment body into text / link / mention tokens for React rendering.
 * Rendering from tokens keeps us clear of dangerouslySetInnerHTML.
 *
 * @param mentionNames Person names actually mentioned on this comment (from
 *   CommentMention rows). Only these are highlighted — a stray "@" is just text.
 */
export function tokenizeCommentBody(
  body: string,
  mentionNames: string[] = []
): CommentToken[] {
  const linkTokens = tokenizeLinks(body);

  // Longest name first, so "@Alice Chen-Ruiz" isn't shortened to "@Alice Chen".
  const names = [...new Set(mentionNames.filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  if (names.length === 0) return linkTokens;

  const mentionRe = new RegExp(`@(?:${names.map(escapeRegExp).join("|")})`, "g");

  const out: CommentToken[] = [];
  for (const token of linkTokens) {
    if (token.type !== "text") {
      out.push(token);
      continue;
    }
    let last = 0;
    for (const m of token.value.matchAll(mentionRe)) {
      const start = m.index!;
      if (start > last) out.push({ type: "text", value: token.value.slice(last, start) });
      out.push({ type: "mention", value: m[0] });
      last = start + m[0].length;
    }
    if (last < token.value.length) {
      out.push({ type: "text", value: token.value.slice(last) });
    }
  }
  return out;
}

function tokenizeLinks(body: string): CommentToken[] {
  const out: CommentToken[] = [];
  let last = 0;
  for (const m of body.matchAll(URL_RE)) {
    const url = trimUrl(m[0]);
    const start = m.index!;
    if (start > last) out.push({ type: "text", value: body.slice(last, start) });
    out.push({ type: "link", value: url, href: hrefFor(url) });
    last = start + url.length;
  }
  if (last < body.length) out.push({ type: "text", value: body.slice(last) });
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escaped HTML with URLs turned into anchors and newlines into <br>.
 * Used for the HTML part of notification emails.
 */
export function linkifyToHtml(body: string): string {
  return tokenizeLinks(body)
    .map((token) =>
      token.type === "link"
        ? `<a href="${escapeHtml(token.href)}">${escapeHtml(token.value)}</a>`
        : escapeHtml(token.value)
    )
    .join("")
    .replace(/\n/g, "<br>");
}
