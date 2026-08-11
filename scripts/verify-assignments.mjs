#!/usr/bin/env node
/**
 * Integration checks for the assignment/visual/version-conflict endpoints.
 *
 * There is no test runner in this repo, and these are the paths where a bug is
 * both easy to introduce and invisible in review:
 *
 *   - PATCH /api/stories/[id]/assignments and the video equivalent change a
 *     role by DELETEing one row and CREATEing another, because role is part of
 *     the composite key. If that stops being a transaction, a failure halfway
 *     through drops the person from the story with no error shown.
 *   - PATCH /api/visuals/[id] is a partial update, so clearing a description
 *     depends on the client sending explicit null rather than omitting it.
 *   - The 409 on a stale save has to return the server's version, or the
 *     "Save anyway" button in StoryForm has nothing to retry against.
 *
 * Usage — against a scratch database only, with the dev server running:
 *
 *   npm run dev
 *   node scripts/verify-assignments.js
 *
 * It creates a story and a video, exercises them, and deletes both. Nothing
 * else in the database is touched, but see the guard below: this must never be
 * pointed at the live newsroom database.
 *
 * Caveat on that guard: it inspects the DATABASE_URL this script can see, which
 * is a proxy for the one the dev server is using, not proof. They are the same
 * .env in normal use. If you have a server running against a different database
 * than your shell does, the guard cannot tell.
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = process.env.VERIFY_EMAIL || "admin@newsroom.com";
const PASSWORD = process.env.VERIFY_PASSWORD || "newsbudget2026";

// ─── Safety guard ─────────────────────────────────────────────────────────────
// On this project a single DATABASE_URL covers preview AND production, so
// "it's only a preview deploy" is not protection. Refuse to run unless the
// database name looks like a scratch one, or the caller names it explicitly.
function assertScratchDatabase() {
  const envPath = fileURLToPath(new URL("../.env", import.meta.url));
  let url = process.env.DATABASE_URL;
  if (!url && fs.existsSync(envPath)) {
    const line = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("DATABASE_URL="));
    if (line) url = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
  }
  if (!url) {
    fail("No DATABASE_URL found in the environment or .env — cannot confirm this is a test database.");
  }

  let name;
  try {
    name = new URL(url).pathname.replace(/^\//, "");
  } catch {
    fail("DATABASE_URL is not a parseable URL — cannot confirm this is a test database.");
  }

  const allowed = process.env.VERIFY_ALLOW_DB;
  if (allowed && allowed === name) return name;
  if (/test|scratch|dev/i.test(name)) return name;

  fail(
    `Refusing to run against database "${name}".\n` +
      `This script writes and deletes rows. Point it at a scratch database whose\n` +
      `name contains "test", or set VERIFY_ALLOW_DB=${name} if you are certain.`
  );
}

function fail(msg) {
  console.error("\n" + msg + "\n");
  process.exit(2);
}

// ─── Session-aware fetch ──────────────────────────────────────────────────────
const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function req(pathname, opts = {}) {
  const res = await fetch(BASE + pathname, {
    ...opts,
    redirect: "manual",
    headers: { cookie: cookieHeader(), ...(opts.headers || {}) },
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return res;
}

async function json(pathname, opts) {
  const res = await req(pathname, opts);
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body };
}

const api = (pathname, method, payload) =>
  json(pathname, {
    method,
    headers: { "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

async function login() {
  const { csrfToken } = await (await req("/api/auth/csrf")).json();
  await req("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, json: "true" }),
  });
  const session = await (await req("/api/auth/session")).json();
  if (!session?.user) {
    fail(`Could not sign in as ${EMAIL}. Is the dev server running and the database seeded?`);
  }
  return session;
}

// ─── Assertions ───────────────────────────────────────────────────────────────
const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log(`${pass ? "  ok  " : " FAIL "} ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  const dbName = assertScratchDatabase();
  console.log(`database: ${dbName}\nserver:   ${BASE}\n`);

  const session = await login();
  console.log(`signed in as ${session.user.email} (${session.user.appRole})\n`);

  const people = (await json("/api/people")).body;
  const alice = people.find((p) => p.name.startsWith("Alice"));
  const bob = people.find((p) => p.name.startsWith("Bob"));
  if (!alice || !bob) fail("Expected seed people (Alice, Bob) not found — is the database seeded?");

  let storyId, videoId;
  try {
    // ── Story create, and the child POSTs StoryForm sends after it ────────────
    const created = await api("/api/stories", "POST", {
      slug: "VERIFY CREATE",
      budgetLine: "Temporary story created by scripts/verify-assignments.js.",
      status: "DRAFT",
      onlinePubDateTBD: true,
      printPubDateTBD: true,
      isEnterprise: false,
      notes: "",
      notifyTeam: false,
      aiContributed: false,
    });
    check("story create", created.status === 201, `status ${created.status}`);
    storyId = created.body?.id;
    if (!storyId) fail("Story was not created; aborting.");

    // visualDraftToBody omits an empty description rather than sending "",
    // which the Zod schema would reject.
    const vBare = await api(`/api/stories/${storyId}/visuals`, "POST", { type: "PHOTO" });
    check("visual with description and person omitted", vBare.status === 201, `status ${vBare.status}`);

    const vFull = await api(`/api/stories/${storyId}/visuals`, "POST", {
      type: "GRAPHIC",
      description: "Chart of results",
      personId: alice.id,
    });
    check("visual with description and person", vFull.status === 201, `status ${vFull.status}`);

    check(
      "assignment create",
      (await api(`/api/stories/${storyId}/assignments`, "POST", { personId: alice.id, role: "REPORTER" }))
        .status === 201
    );
    check(
      "tag create",
      (await api(`/api/stories/${storyId}/tags`, "POST", { tag: "OREGON_INSIGHT" })).status === 201
    );

    // ── Child POSTs that must fail loudly, so StoryForm can count them ────────
    const dupe = await api(`/api/stories/${storyId}/assignments`, "POST", {
      personId: alice.id,
      role: "REPORTER",
    });
    check("duplicate assignment rejected", dupe.status === 409, `status ${dupe.status}`);

    const badPerson = await api(`/api/stories/${storyId}/visuals`, "POST", {
      type: "PHOTO",
      personId: "clzzzzzzzzzzzzzzzzzzzzzzz",
    });
    check("visual with unknown person rejected", badPerson.status >= 400, `status ${badPerson.status}`);

    // ── Visual edit: clearing must actually clear ─────────────────────────────
    const cleared = await api(`/api/visuals/${vFull.body.id}`, "PATCH", {
      type: "GRAPHIC",
      description: null,
      personId: null,
    });
    check("visual PATCH accepted", cleared.status === 200, `status ${cleared.status}`);
    check("description cleared to null", cleared.body?.description === null);
    check("person unassigned to null", cleared.body?.personId === null);

    // ── Role change: the delete + create transaction ──────────────────────────
    const changed = await api(`/api/stories/${storyId}/assignments`, "PATCH", {
      personId: alice.id,
      fromRole: "REPORTER",
      toRole: "EDITOR",
    });
    check("role change succeeds", changed.status === 200, `status ${changed.status}`);
    check("role change returns the new role", changed.body?.role === "EDITOR");

    let after = (await json(`/api/stories/${storyId}/assignments`)).body;
    check(
      "exactly one assignment survives the swap",
      after.length === 1 && after[0].role === "EDITOR",
      JSON.stringify(after.map((a) => a.role))
    );

    // Collision: person already holds the target role. Must roll back whole.
    await api(`/api/stories/${storyId}/assignments`, "POST", { personId: alice.id, role: "REPORTER" });
    const collision = await api(`/api/stories/${storyId}/assignments`, "PATCH", {
      personId: alice.id,
      fromRole: "REPORTER",
      toRole: "EDITOR",
    });
    check("role collision returns 409", collision.status === 409, `status ${collision.status}`);

    after = (await json(`/api/stories/${storyId}/assignments`)).body;
    check(
      "collision rolled back — both roles intact, person not dropped",
      after.length === 2,
      JSON.stringify(after.map((a) => a.role))
    );

    check(
      "unknown assignment returns 404",
      (await api(`/api/stories/${storyId}/assignments`, "PATCH", {
        personId: bob.id,
        fromRole: "REPORTER",
        toRole: "EDITOR",
      })).status === 404
    );
    check(
      "unchanged role returns 400",
      (await api(`/api/stories/${storyId}/assignments`, "PATCH", {
        personId: alice.id,
        fromRole: "EDITOR",
        toRole: "EDITOR",
      })).status === 400
    );

    // ── Version conflict: the 409 must carry a version to retry against ───────
    const fresh = (await json(`/api/stories/${storyId}`)).body;
    check(
      "save with current version succeeds",
      (await api(`/api/stories/${storyId}`, "PATCH", { notes: "first writer", version: fresh.version }))
        .status === 200
    );

    const stale = await api(`/api/stories/${storyId}`, "PATCH", {
      notes: "second writer",
      version: fresh.version,
    });
    check("stale version returns 409", stale.status === 409, `status ${stale.status}`);
    check("409 body carries a version for the retry", stale.body?.version !== undefined);
    check(
      "retry with the returned version succeeds ('Save anyway')",
      (await api(`/api/stories/${storyId}`, "PATCH", {
        notes: "save anyway",
        version: stale.body?.version,
      })).status === 200
    );

    // ── Video role change ─────────────────────────────────────────────────────
    const video = await api("/api/videos", "POST", {
      slug: "VERIFY VIDEO",
      budgetLine: "Temporary video created by scripts/verify-assignments.js.",
      status: "DRAFT",
      onlinePubDateTBD: true,
      isEnterprise: false,
      notifyTeam: false,
    });
    videoId = video.body?.id;
    check("video create", video.status === 201, `status ${video.status}`);

    await api(`/api/videos/${videoId}/assignments`, "POST", {
      personId: bob.id,
      role: "VIDEOGRAPHER",
    });
    check(
      "video role change succeeds",
      (await api(`/api/videos/${videoId}/assignments`, "PATCH", {
        personId: bob.id,
        fromRole: "VIDEOGRAPHER",
        toRole: "EDITOR",
      })).status === 200
    );
    const vAfter = (await json(`/api/videos/${videoId}/assignments`)).body;
    check(
      "video assignment intact after swap",
      vAfter.length === 1 && vAfter[0].role === "EDITOR",
      JSON.stringify(vAfter.map((a) => a.role))
    );
  } finally {
    // Always clean up, even if an assertion above threw.
    if (storyId) await api(`/api/stories/${storyId}`, "DELETE");
    if (videoId) await api(`/api/videos/${videoId}`, "DELETE");
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(2);
});
