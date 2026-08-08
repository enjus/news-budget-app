#!/usr/bin/env node
/**
 * Vercel-only build step that keeps PREVIEW deployment databases in sync
 * with prisma/schema.prisma.
 *
 * Background: the app used to run `prisma db push --accept-data-loss` on
 * every build, which kept every deployed database (including Vercel
 * previews) auto-synced with the schema. That was removed from the main
 * `build` script because it's unsafe to run against the production
 * database on every deploy (see git history: "Remove destructive Prisma
 * db push from build step"). Production now moves on a VPS and applies
 * schema changes deliberately (see docs/aws-vps-deployment.md).
 *
 * That left Vercel preview deployments with no schema-sync step at all,
 * so preview databases drift out of sync with schema.prisma and API
 * routes start failing (e.g. "Failed to create story") once the schema
 * gains columns/tables the preview DB doesn't have.
 *
 * This script restores auto-sync, but ONLY for preview builds. Vercel
 * automatically uses a `vercel-build` script in place of the normal build
 * command when one exists — including for production deployments on
 * Vercel, if that's ever used — so we gate on VERCEL_ENV rather than
 * assuming every build here is a preview.
 */
const { execSync } = require("child_process");

const vercelEnv = process.env.VERCEL_ENV;

if (vercelEnv !== "preview") {
  console.log(
    `[vercel-build] VERCEL_ENV=${vercelEnv ?? "(unset)"} — skipping db push. ` +
      "This step only runs for preview deployments; production schema changes " +
      "must go through a deliberate migration/push, not an automatic build step."
  );
  process.exit(0);
}

console.log(
  "[vercel-build] VERCEL_ENV=preview — running `prisma db push` to sync the " +
    "preview database schema with prisma/schema.prisma..."
);

execSync("npx prisma db push --accept-data-loss --skip-generate", {
  stdio: "inherit",
});
