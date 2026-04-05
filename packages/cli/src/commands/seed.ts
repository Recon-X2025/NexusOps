import { type Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { randomUUID } from "node:crypto";
import { getPool } from "../lib/db.js";
import bcrypt from "bcryptjs";

export function registerCommand(program: Command): void {
  program
    .command("seed")
    .description("Seed the database with demo data")
    .option("--org-name <name>", "Organization name", "Acme Corp")
    .option(
      "--admin-email <email>",
      "Admin email address",
      "admin@acme.com"
    )
    .action(
      async (opts: { orgName: string; adminEmail: string }) => {
        const pool = getPool();
        const spinner = ora("Seeding database…").start();

        try {
          const orgId = randomUUID();
          const adminId = randomUUID();
          const passwordHash = await bcrypt.hash("Admin@1234", 12);

          const client = await pool.connect();
          try {
            await client.query("BEGIN");

            // Organization
            spinner.text = "Creating organization…";
            await client.query(
              `INSERT INTO organizations (id, name, slug, created_at, updated_at)
               VALUES ($1, $2, $3, NOW(), NOW())
               ON CONFLICT DO NOTHING`,
              [orgId, opts.orgName, opts.orgName.toLowerCase().replace(/\s+/g, "-")]
            );

            // Admin user
            spinner.text = "Creating admin user…";
            await client.query(
              `INSERT INTO users (id, organization_id, email, name, password_hash, role, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, 'admin', NOW(), NOW())
               ON CONFLICT DO NOTHING`,
              [adminId, orgId, opts.adminEmail, "Admin User", passwordHash]
            );

            // Ticket categories
            spinner.text = "Creating ticket categories…";
            const categories = ["Hardware", "Software", "Network"];
            const categoryIds: string[] = [];
            for (const name of categories) {
              const catId = randomUUID();
              categoryIds.push(catId);
              await client.query(
                `INSERT INTO ticket_categories (id, organization_id, name, created_at, updated_at)
                 VALUES ($1, $2, $3, NOW(), NOW())
                 ON CONFLICT DO NOTHING`,
                [catId, orgId, name]
              );
            }

            // Sample tickets
            spinner.text = "Creating sample tickets…";
            const tickets = [
              {
                title: "Laptop won't start",
                description: "The laptop powers off immediately after pressing the power button.",
                priority: "high",
                categoryId: categoryIds[0],
              },
              {
                title: "VPN connection issues",
                description: "Unable to connect to the corporate VPN from home network.",
                priority: "medium",
                categoryId: categoryIds[2],
              },
            ];
            for (const ticket of tickets) {
              await client.query(
                `INSERT INTO tickets (id, organization_id, requester_id, category_id, title, description, priority, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), NOW())
                 ON CONFLICT DO NOTHING`,
                [
                  randomUUID(),
                  orgId,
                  adminId,
                  ticket.categoryId,
                  ticket.title,
                  ticket.description,
                  ticket.priority,
                ]
              );
            }

            // KB article
            spinner.text = "Creating KB article…";
            await client.query(
              `INSERT INTO kb_articles (id, organization_id, author_id, title, content, status, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, 'published', NOW(), NOW())
               ON CONFLICT DO NOTHING`,
              [
                randomUUID(),
                orgId,
                adminId,
                "Getting Started with NexusOps",
                "Welcome to NexusOps! This article covers the basics of ticket management and knowledge base usage.",
              ]
            );

            await client.query("COMMIT");
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          } finally {
            client.release();
          }

          spinner.succeed(chalk.green("Database seeded successfully."));
          console.log(chalk.cyan(`  Organization : ${opts.orgName} (${orgId})`));
          console.log(chalk.cyan(`  Admin user   : ${opts.adminEmail} (password: Admin@1234)`));
          process.exit(0);
        } catch (err) {
          spinner.fail(chalk.red("Seeding failed."));
          console.error(chalk.red(String(err)));
          process.exit(1);
        } finally {
          await pool.end();
        }
      }
    );
}
