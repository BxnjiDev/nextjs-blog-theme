/**
 * Provisions (or updates the password for) the single Atlas OS admin
 * account. Atlas OS is a private, single-user application — there is no
 * signup flow. Run this once after setting ATLAS_AUTH_EMAIL/
 * ATLAS_AUTH_PASSWORD in .env, and again any time you want to change the
 * password.
 *
 * Usage:
 *   npm run auth:setup
 */
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/auth/password';

async function main() {
  const email = process.env.ATLAS_AUTH_EMAIL?.trim().toLowerCase();
  const password = process.env.ATLAS_AUTH_PASSWORD;

  if (!email || !password) {
    console.error('Set ATLAS_AUTH_EMAIL and ATLAS_AUTH_PASSWORD in .env first, then re-run npm run auth:setup.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ATLAS_AUTH_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });

  console.log(`Atlas OS admin account ready: ${user.email} (id ${user.id}).`);
  console.log('You can now sign in at /login with ATLAS_AUTH_EMAIL/ATLAS_AUTH_PASSWORD.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
