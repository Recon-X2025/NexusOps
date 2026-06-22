#!/usr/bin/env node
/**
 * Verify that all .sql files in packages/db/drizzle/ have a corresponding
 * entry in packages/db/drizzle/meta/_journal.json.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(__dirname, "../packages/db/drizzle");
const JOURNAL_PATH = join(DRIZZLE_DIR, "meta/_journal.json");

function main() {
    console.log("🔍 Verifying migration journal integrity...");

    let journal;
    try {
        journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8"));
    } catch (err) {
        console.error(`❌ Failed to read journal at ${JOURNAL_PATH}`);
        process.exit(1);
    }

    const journalTags = new Set(journal.entries.map((e) => e.tag));
    const sqlFiles = readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith(".sql"));

    let missing = 0;
    for (const file of sqlFiles) {
        const tag = file.replace(".sql", "");
        if (!journalTags.has(tag)) {
            console.error(`❌ Migration file "${file}" is missing from _journal.json`);
            missing++;
        }
    }

    if (missing > 0) {
        console.error(`\nTotal missing entries: ${missing}`);
        console.error("Please run 'drizzle-kit generate' or manually sync the journal.");
        process.exit(1);
    }

    console.log("✅ Migration journal is in sync.");
}

main();
