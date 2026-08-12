-- ============================================================================
-- NEGATIVE-DAYS LEAVE CLEANUP — WRITTEN, NOT RUN.  DO NOT EXECUTE AGAINST PROD
-- from the build environment. Hand to the owner; run only after reading the counts.
-- ============================================================================
--
-- Context: a leave request with days = -1.0 exists on prod (Amit Mehra, 11 Aug → 9 Aug,
-- status Pending). It predates the create-path date-order guard (shipped ec2b7a9 / A1).
--
-- Root of the balance damage: the CREATE path moves the balance at creation time
--   (apps/api/src/routers/hr.ts:889-904):  pending_days += days   -- keyed by
--   (employee_id, type, year = EXTRACT(YEAR FROM start_date)).
-- With days = -1.0 this pushed pending_days DOWN by 1.
--
-- ESTABLISHED FROM CODE: `leave.delete` (hr.ts:1068-1075) is a bare
--   DELETE FROM leave_requests ...  — it touches NO leave_balances row, and balances are
-- aggregate columns (not per-request rows with a cascading FK). So DELETING THE REQUEST ALONE
-- DOES NOT UNWIND THE BALANCE. The balance needs its own correction, in the SAME transaction.
--
-- The row is PENDING, so `leave.approve` never ran: used_days was NOT moved and the G8
-- attendance reflex (unpaid → `absent`) was NEVER written over the reversed range. Only the
-- create-time pending_days movement needs reversing. (An APPROVED negative-days row would also
-- need used_days reversed AND the attendance rows deleted — handle those separately; see the
-- second query below to detect them.)
--
-- PROD ROW COUNTS FOR NEGATIVE-DAYS ROWS HAVE NEVER BEEN READ. This may not be the only one.
-- Run STEP 1 first and size the problem before touching anything.

-- ----------------------------------------------------------------------------
-- STEP 1 — Find ALL negative-days rows (read-only; run this first).
-- ----------------------------------------------------------------------------
SELECT
  lr.id,
  lr.org_id,
  lr.employee_id,
  e.employee_id           AS employee_code,
  lr.type,
  lr.start_date,
  lr.end_date,
  lr.days,
  lr.status
FROM leave_requests lr
JOIN employees e ON e.id = lr.employee_id
WHERE lr.days < 0
   OR lr.end_date < lr.start_date
ORDER BY lr.status, lr.created_at;

-- ----------------------------------------------------------------------------
-- STEP 2 — Correct + remove the PENDING negative-days rows, atomically.
-- Reverses the create-time pending_days movement (pending_days = pending_days − days; days is
-- negative, so this ADDS the amount back), THEN deletes the request. One transaction.
--
-- Scope: PENDING only. Confirm STEP 1 shows no APPROVED negative-days rows before relying on this;
-- if any are APPROVED, do NOT use this block for them (used_days + attendance reflex also moved).
-- ----------------------------------------------------------------------------
BEGIN;

-- 2a. Reverse the pending-balance movement for every pending negative-days request.
UPDATE leave_balances lb
SET    pending_days = lb.pending_days - lr.days,   -- days < 0 ⇒ adds the amount back
       updated_at   = now()
FROM   leave_requests lr
WHERE  lr.status = 'pending'
  AND (lr.days < 0 OR lr.end_date < lr.start_date)
  AND  lb.employee_id = lr.employee_id
  AND  lb.type        = lr.type
  AND  lb.year        = EXTRACT(YEAR FROM lr.start_date);

-- 2b. Delete the corrupt pending requests (now that the balance is corrected).
DELETE FROM leave_requests lr
WHERE  lr.status = 'pending'
  AND (lr.days < 0 OR lr.end_date < lr.start_date);

-- Inspect the affected balances here before committing; ROLLBACK if anything looks wrong.
-- COMMIT;
ROLLBACK;   -- ← default: leave as ROLLBACK. Change to COMMIT only when you have verified the numbers.

-- ----------------------------------------------------------------------------
-- STEP 3 (only if STEP 1 shows APPROVED negative-days rows) — detect them for separate handling.
-- These also moved used_days and wrote attendance rows; they are NOT covered by STEP 2.
-- ----------------------------------------------------------------------------
SELECT lr.id, e.employee_id AS employee_code, lr.type, lr.start_date, lr.end_date, lr.days, lr.status
FROM leave_requests lr
JOIN employees e ON e.id = lr.employee_id
WHERE (lr.days < 0 OR lr.end_date < lr.start_date)
  AND lr.status = 'approved';
