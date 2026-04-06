/**
 * Bootstrap seed — runs via `prisma db seed` (or automatically after `prisma migrate dev`).
 *
 * What it does:
 *   - If no bootstrap invite code exists yet, creates one and prints it to stdout.
 *   - Completely idempotent: safe to run multiple times on the same database.
 *
 * First-deploy workflow:
 *   1. `prisma migrate deploy`   (or `prisma migrate dev` in development)
 *   2. `prisma db seed`          ← prints the bootstrap invite code
 *   3. Open the app, register with that code — you become ADMIN automatically.
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

const BOOTSTRAP_CODE_PREFIX = "INIT";

async function main() {
  // Check if a bootstrap invite code already exists
  const existing = await prisma.inviteCode.findFirst({
    where: { code: { startsWith: BOOTSTRAP_CODE_PREFIX }, usedBy: null },
  });

  if (existing) {
    console.log("Bootstrap invite code already exists (unused):");
    console.log(`  ${existing.code}`);
    console.log("Use it to register the first admin account.");
    return;
  }

  // Generate a random, human-readable code: INIT-XXXX-XXXX
  const code =
    BOOTSTRAP_CODE_PREFIX +
    "-" +
    randomBytes(2).toString("hex").toUpperCase() +
    "-" +
    randomBytes(2).toString("hex").toUpperCase();

  await prisma.inviteCode.create({
    data: {
      code,
      createdBy: null, // system-generated, no human creator
    },
  });

  console.log("========================================");
  console.log("  Bootstrap invite code created:");
  console.log(`  ${code}`);
  console.log("  Register with this code to become ADMIN.");
  console.log("========================================");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
