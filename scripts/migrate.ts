#!/usr/bin/env node
/**
 * Applies pending SQL migrations to the configured database.
 * Usage: npm run db:migrate
 */
import { getDb } from "../src/lib/db";

getDb();
console.log("Migrations complete.");
