import { type Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import bcrypt from "bcryptjs";
import { getPool } from "../lib/db.js";

async function promptPassword(): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const password = await rl.question("Enter password (hidden input): ");
    return password;
  } finally {
    rl.close();
  }
}

export function registerCommand(program: Command): void {
  program
    .command("create-admin")
    .description("Create an admin user")
    .requiredOption("--email <email>", "Admin email address")
    .requiredOption("--name <name>", "Admin display name")
    .option("--org-id <uuid>", "Organization UUID")
    .option("--password <password>", "Password (prompted if omitted)")
    .action(
      async (opts: {
        email: string;
        name: string;
        orgId?: string;
        password?: string;
      }) => {
        const pool = getPool();

        try {
          const rawPassword = opts.password ?? (await promptPassword());
          if (!rawPassword) {
            console.error(chalk.red("Password cannot be empty."));
            process.exit(1);
          }

          const spinner = ora("Creating admin user…").start();
          const passwordHash = await bcrypt.hash(rawPassword, 12);
          const userId = randomUUID();

          const client = await pool.connect();
          try {
            await client.query(
              `INSERT INTO users (id, organization_id, email, name, password_hash, role, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, 'admin', NOW(), NOW())`,
              [userId, opts.orgId ?? null, opts.email, opts.name, passwordHash]
            );
          } finally {
            client.release();
          }

          spinner.succeed(chalk.green("Admin user created successfully."));
          console.log(chalk.cyan(`  User ID : ${userId}`));
          console.log(chalk.cyan(`  Email   : ${opts.email}`));
          process.exit(0);
        } catch (err) {
          console.error(chalk.red("Failed to create admin user:"), String(err));
          process.exit(1);
        } finally {
          await pool.end();
        }
      }
    );
}
