/**
 * hrPeriodicWorkflow.ts — Periodic HR liabilities sweeps via BullMQ (F-H2).
 *
 * This handles background automation for inherently periodic HR obligations:
 * 1. Monthly Leave Accrual: Runs on the 1st of every month to accrue leave for the prior month.
 * 2. Monthly Gratuity Provision: Runs on the 1st of every month to provision gratuity for the prior month.
 * 3. Year-End Close: Runs on Jan 1st to apply carry-forward caps for leave balances.
 */
import { Queue, Worker, type Job } from "bullmq";
import type { Db } from "@coheronconnect/db";
import { 
  getDb, 
  organizations, 
  users, 
  leavePolicies, 
  employees, 
  eq,
  and
} from "@coheronconnect/db";
import { appRouter } from "../routers";
import { revokeElapsedOffboardedAccess } from "../lib/offboarding-revoke";

function redisConnection() {
  return { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" };
}

export const HR_PERIODIC_QUEUE_NAME = "coheronconnect-hr-periodic";
export const HR_MONTHLY_JOB_NAME = "hr-monthly-sweep";
export const HR_YEARLY_JOB_NAME = "hr-yearly-sweep";
/**
 * Daily: disable the login of anyone whose offboarding handover window has closed.
 * Daily because the trigger is a DATE — an offboarding recorded today with a last
 * working day next month must not revoke anything until that date arrives.
 */
export const HR_DAILY_JOB_NAME = "hr-daily-sweep";

export interface HrPeriodicJobData {
  /** Unused — the sweeper infers the period from the current date. */
  _: string;
}

export function createHrPeriodicQueue(): Queue<HrPeriodicJobData> {
  return new Queue(HR_PERIODIC_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
}

/**
 * Register the repeatable HR periodic sweepers.
 * Monthly: 02:00 on the 1st of every month.
 * Yearly: 03:00 on the 1st of January.
 */
export async function scheduleHrPeriodicSweeps(queue: Queue<HrPeriodicJobData>): Promise<void> {
  await queue.add(
    HR_MONTHLY_JOB_NAME,
    { _: "monthly" },
    {
      repeat: { pattern: "0 2 1 * *" },
      jobId: HR_MONTHLY_JOB_NAME, // Deterministic ID for deduplication
    }
  );

  await queue.add(
    HR_YEARLY_JOB_NAME,
    { _: "yearly" },
    {
      repeat: { pattern: "0 3 1 1 *" },
      jobId: HR_YEARLY_JOB_NAME,
    }
  );

  // 00:30 every day — shortly after midnight, so a handover window that closed at
  // the end of yesterday is acted on first thing.
  await queue.add(
    HR_DAILY_JOB_NAME,
    { _: "daily" },
    {
      repeat: { pattern: "30 0 * * *" },
      jobId: HR_DAILY_JOB_NAME,
    }
  );
}

export function startHrPeriodicWorker(): Worker<HrPeriodicJobData> {
  const worker = new Worker<HrPeriodicJobData>(
    HR_PERIODIC_QUEUE_NAME,
    async (job: Job<HrPeriodicJobData>) => {
      const db = getDb();
      if (job.name === HR_MONTHLY_JOB_NAME) {
        await processMonthlySweep(db);
      } else if (job.name === HR_YEARLY_JOB_NAME) {
        await processYearlySweep(db);
      } else if (job.name === HR_DAILY_JOB_NAME) {
        const res = await revokeElapsedOffboardedAccess(db);
        if (res.revoked.length > 0 || res.skippedNoUser.length > 0) {
          console.info(
            `[hr-daily] offboarding access revoked for ${res.revoked.length} user(s); ` +
            `${res.skippedNoUser.length} offboarded employee(s) had no login to disable`,
          );
        }
      } else {
        throw new Error(`Unknown job name: ${job.name}`);
      }
    },
    {
      connection: redisConnection(),
      concurrency: 1, // Safe sequential execution
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[hr-periodic] Job ${job?.id} failed:`, err);
  });

  return worker;
}

/**
 * Processes monthly leave accruals and gratuity provisioning for the *prior* month.
 */
async function processMonthlySweep(db: Db) {
  // Determine previous month/year
  const now = new Date();
  let prevMonth = now.getMonth(); // 1-12. Date.getMonth() is 0-11, so it represents the previous month natively (1-based)!
  let prevYear = now.getFullYear();
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const orgs = await db.select({ id: organizations.id }).from(organizations);

  for (const org of orgs) {
    // Find a system/admin user to masquerade as for this org to satisfy trpc context
    // We just need a valid user ID who is an admin in the org, or we inject an override.
    // For background jobs, creating a caller with `role: "admin"` bypasses standard checks.
    const caller = appRouter.createCaller({
      db,
      org: { id: org.id } as any,
      user: { id: "system-cron", role: "admin" } as any, // Background worker identity
      session: { user: { id: "system-cron" } } as any,
      req: null as any,
      res: null as any,
      ipAddress: "127.0.0.1",
      requestId: `hr-monthly-${Date.now()}`,
    } as any);

    try {
      // 1. Leave Accrual
      const policies = await db
        .select({ type: leavePolicies.type })
        .from(leavePolicies)
        .where(eq(leavePolicies.orgId, org.id));
        
      for (const policy of policies) {
        // accrueAll is idempotent
        await caller.leaveAccrual.accrual.accrueAll({
          type: policy.type as any,
          year: prevYear,
          month: prevMonth,
        });
      }

      // 2. Gratuity Provisioning
      await caller.gratuity.accrual.provisionAll({
        year: prevYear,
        month: prevMonth,
      });
      
    } catch (err) {
      console.error(`[hr-periodic] Failed monthly sweep for org ${org.id}`, err);
    }
  }
}

/**
 * Processes year-end leave close (carry-forward caps) for the *prior* year.
 */
async function processYearlySweep(db: Db) {
  const prevYear = new Date().getFullYear() - 1;

  const orgs = await db.select({ id: organizations.id }).from(organizations);

  for (const org of orgs) {
    const caller = appRouter.createCaller({
      db,
      org: { id: org.id } as any,
      user: { id: "system-cron", role: "admin" } as any,
      session: { user: { id: "system-cron" } } as any,
      req: null as any,
      res: null as any,
      ipAddress: "127.0.0.1",
      requestId: `hr-yearly-${Date.now()}`,
    } as any);

    try {
      const activeEmployees = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.orgId, org.id), eq(employees.status, "active")));

      const policies = await db
        .select({ type: leavePolicies.type })
        .from(leavePolicies)
        .where(eq(leavePolicies.orgId, org.id));

      for (const emp of activeEmployees) {
        for (const policy of policies) {
          try {
            await caller.leaveAccrual.close.run({
              employeeId: emp.id,
              type: policy.type as any,
              year: prevYear,
            });
          } catch (e: any) {
            // Ignore CONFLICT (already closed), log others
            if (e.code !== "CONFLICT") {
               console.error(`[hr-periodic] Year close failed for emp ${emp.id} type ${policy.type}:`, e);
            }
          }
        }
      }
    } catch (err) {
      console.error(`[hr-periodic] Failed yearly sweep for org ${org.id}`, err);
    }
  }
}
