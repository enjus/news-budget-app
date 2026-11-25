-- Run this AFTER deploying feature/shifts-single-source (no schema change,
-- so no `prisma db push` is involved).
--
-- Why: before this change, assigning a shift (POST /api/schedule/shifts,
-- "Also mark as working" ticked by default) also wrote a copy of it as an
-- Availability FULL_DAY / WORKING row, so the person showed as working on
-- views that didn't read shifts. Shifts are now read directly by
-- resolveDay(), so those copies are redundant — and harmful: an explicit
-- WORKING row outranks the shift, so the day reads "Working" instead of
-- "<Role> shift", and "Clear" on that day would delete a row the old
-- shift-delete logic still expected to manage.
--
-- What it deletes: plain, note-free FULL_DAY WORKING rows on a date where
-- the same person has a ShiftAssignment — the exact set the old
-- isPlainWorkingSet() check treated as "the row a shift wrote". A row
-- someone typed by hand with the same shape can't be told apart, and is
-- deleted too; that's harmless, since the shift now resolves the day to
-- working anyway. Rows with a note, half-day rows, and OUT/UNAVAILABLE
-- rows are never touched.
--
-- Order: deploy first, then run this. Running it before the deploy would
-- show shift workers as off on the Teams grid / My schedule until the new
-- code is live; running it after is safe at any time, and re-running it is
-- a no-op.
--
-- Usage:
--   1. Preview:  run the DELETE below with "DELETE FROM" swapped for
--                "SELECT count(*) FROM" to see how many rows it will remove.
--   2. Apply:    psql "$DATABASE_URL" -f prisma/manual-cleanup-shift-working-rows.sql
--   3. Delete this file once applied — it's a one-time cleanup.

BEGIN;

DELETE FROM "Availability" a
WHERE a.segment = 'FULL_DAY'
  AND a.status = 'WORKING'
  AND (a.note IS NULL OR btrim(a.note) = '')
  AND EXISTS (
    SELECT 1 FROM "ShiftAssignment" s
    WHERE s."personId" = a."personId" AND s.date = a.date
  );

COMMIT;
