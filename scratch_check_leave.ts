import { getDb } from "./packages/db/src/client";
import { users, employees, leaveRequests, leaveBalances } from "./packages/db/src/schema";
import { eq, and } from "drizzle-orm";
import * as dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

async function run() {
  const db = getDb();
  console.log("DB pool initialized.");

  try {
    // 1. Get first user
    const dbUsers = await db.select().from(users).limit(10);
    console.log("Users in DB:", dbUsers.map(u => ({ id: u.id, name: u.name, email: u.email })));

    if (dbUsers.length === 0) {
      console.log("No users found!");
      process.exit(0);
    }

    // Find the user with name/email resembling ABHISHEK or admin
    const activeUser = dbUsers.find(u => u.name?.toLowerCase().includes("abhishek") || u.email.toLowerCase().includes("abhishek")) || dbUsers[0];
    console.log("Selected user for test:", { id: activeUser.id, name: activeUser.name, email: activeUser.email });

    // 2. Check if they have an employee record
    const [employee] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.userId, activeUser.id), eq(employees.orgId, activeUser.orgId)));

    if (!employee) {
      console.log("No employee record found for this user!");
      // Let's list all employee records in this org
      const allEmps = await db.select().from(employees).where(eq(employees.orgId, activeUser.orgId));
      console.log(`Employees in org ${activeUser.orgId}:`, allEmps.map(e => ({ id: e.id, employeeId: e.employeeId, userId: e.userId })));
    } else {
      console.log("Employee record found:", { id: employee.id, employeeId: employee.employeeId });

      // 3. Test insert leave request inside a transaction (so we can rollback and not leave garbage)
      console.log("Testing leave request creation in transaction...");
      await db.transaction(async (tx) => {
        const startDate = new Date("2026-07-09");
        const endDate = new Date("2026-07-12");
        const days = 4; // 9, 10, 11, 12

        console.log("Inserting leaveRequest...");
        const [request] = await tx
          .insert(leaveRequests)
          .values({
            orgId: activeUser.orgId,
            employeeId: employee.id,
            type: "vacation",
            startDate,
            endDate,
            days: String(days),
            reason: "test reason",
            status: "pending",
          })
          .returning();
        console.log("LeaveRequest inserted successfully:", request);

        console.log("Inserting/updating leaveBalance...");
        const balanceResult = await tx
          .insert(leaveBalances)
          .values({
            employeeId: employee.id,
            type: "vacation",
            year: startDate.getFullYear(),
            totalDays: "0",
            usedDays: "0",
            pendingDays: String(days),
          })
          .onConflictDoUpdate({
            target: [leaveBalances.employeeId, leaveBalances.type, leaveBalances.year],
            set: {
              pendingDays: String(days), // simplified set for test
            },
          });
        console.log("LeaveBalance updated successfully:", balanceResult);

        // rollback so we don't commit test data
        tx.rollback();
      });
    }
  } catch (err: any) {
    console.error("Error during execution:", err);
  }

  process.exit(0);
}

run();
