#!/usr/bin/env node
import { Command } from "commander";
import { registerCommand as registerMigrate } from "./commands/migrate.js";
import { registerCommand as registerSeed } from "./commands/seed.js";
import { registerCommand as registerCreateAdmin } from "./commands/create-admin.js";
import { registerCommand as registerBackup } from "./commands/backup.js";
import { registerCommand as registerHealth } from "./commands/health.js";
import { registerCommand as registerLicense } from "./commands/license.js";

const program = new Command();

program
  .name("nexusops")
  .description("Operational CLI for NexusOps ITSM")
  .version("1.0.0");

registerMigrate(program);
registerSeed(program);
registerCreateAdmin(program);
registerBackup(program);
registerHealth(program);
registerLicense(program);

program.parse(process.argv);
