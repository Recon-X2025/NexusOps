import { type Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import chalk from "chalk";
import ora from "ora";
import { API_URL } from "../lib/env.js";

const LICENSE_KEY_REGEX = /^NXS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const CONFIG_DIR = path.join(os.homedir(), ".coheronconnect");
const LICENSE_FILE = path.join(CONFIG_DIR, "license.json");

function saveLocalLicense(key: string, response: unknown): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(
    LICENSE_FILE,
    JSON.stringify({ key, activatedAt: new Date().toISOString(), response }, null, 2)
  );
}

export function registerCommand(program: Command): void {
  const license = program.command("license").description("License management");

  license
    .command("activate")
    .description("Activate a CoheronConnect license key")
    .requiredOption("--key <license-key>", "License key (format: NXS-XXXX-XXXX-XXXX)")
    .action(async (opts: { key: string }) => {
      if (!LICENSE_KEY_REGEX.test(opts.key)) {
        console.error(
          chalk.red(
            `Invalid license key format. Expected: NXS-XXXX-XXXX-XXXX (uppercase letters and digits)`
          )
        );
        process.exit(1);
      }

      const spinner = ora(`Activating license key ${chalk.cyan(opts.key)}…`).start();
      try {
        const res = await fetch(`${API_URL}/api/license/activate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: opts.key }),
          signal: AbortSignal.timeout(10000),
        });

        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

        if (res.ok) {
          saveLocalLicense(opts.key, body);
          spinner.succeed(chalk.green("License activated successfully."));
          console.log(chalk.cyan(`  Key stored in: ${LICENSE_FILE}`));
        } else {
          spinner.fail(chalk.red("License activation failed."));
          console.error(chalk.red(`  Server response: ${JSON.stringify(body)}`));
          process.exit(1);
        }
      } catch (err) {
        spinner.fail(chalk.red("License activation request failed."));
        console.error(chalk.red(String(err)));
        process.exit(1);
      }
    });
}
