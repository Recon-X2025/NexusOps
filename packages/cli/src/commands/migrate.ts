import { type Command } from "commander";
import { execSync } from "node:child_process";
import chalk from "chalk";
import ora from "ora";

export function registerCommand(program: Command): void {
  program
    .command("migrate")
    .description("Run database migrations")
    .option("--direction <direction>", "Migration direction: up or down", "up")
    .option("--dry-run", "Print what would run without executing")
    .action(async (opts: { direction: string; dryRun?: boolean }) => {
      if (opts.dryRun) {
        console.log(
          chalk.yellow(
            "[dry-run] Would run: pnpm --filter @nexusops/db db:migrate"
          )
        );
        process.exit(0);
      }

      if (opts.direction !== "up") {
        console.error(
          chalk.red(
            "Only --direction up is supported via the db package migration script."
          )
        );
        process.exit(1);
      }

      const spinner = ora("Running database migrations…").start();
      try {
        execSync("pnpm --filter @nexusops/db db:migrate", {
          stdio: "inherit",
          cwd: process.cwd(),
        });
        spinner.succeed(chalk.green("Migrations completed successfully."));
        process.exit(0);
      } catch {
        spinner.fail(chalk.red("Migration failed."));
        process.exit(1);
      }
    });
}
