import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const found = args.find((a) => a.startsWith(`--${flag}=`));
    return found ? found.split("=")[1] : undefined;
  };
  const hasFlag = (flag: string) => args.includes(`--${flag}`);

  const email =
    (
      getArg("email") ||
      process.env.SUPER_ADMIN_EMAIL ||
      process.env.DESIGNATED_SUPER_ADMIN_EMAIL ||
      process.env.INITIAL_SUPER_ADMIN_EMAIL ||
      "admin@qrserve.com"
    )
      .toLowerCase()
      .trim();

  // Non-destructive check mode to inspect current status
  if (hasFlag("check") || hasFlag("status")) {
    console.log(`🔍 Checking status for Super Admin candidate: ${email}`);
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    if (!existing) {
      console.log(`❌ Account not found in database for email: ${email}`);
      console.log(`   To safely provision this account, run:`);
      console.log(`   npm run seed:admin -- --email="${email}" --password="<your-password>"`);
    } else {
      console.log(`✅ Account exists:`);
      console.log(`   ID:        ${existing.id}`);
      console.log(`   Name:      ${existing.name}`);
      console.log(`   Email:     ${existing.email}`);
      console.log(`   Role:      ${existing.role}`);
      console.log(`   Is Active: ${existing.isActive}`);
      if (existing.role === UserRole.SUPER_ADMIN && existing.isActive) {
        console.log(`   Status:    Authorized as SUPER_ADMIN ✅`);
      } else {
        console.log(`   Status:    NOT authorized as SUPER_ADMIN (Current role: ${existing.role}) ⚠️`);
        console.log(`   To promote this account, run:`);
        console.log(`   npm run seed:admin -- --email="${email}" --password="<your-password>"`);
      }
    }
    return;
  }

  const name =
    getArg("name") ||
    process.env.SUPER_ADMIN_NAME ||
    process.env.INITIAL_SUPER_ADMIN_NAME ||
    "QRServe Super Admin";

  const password =
    getArg("password") ||
    process.env.SUPER_ADMIN_PASSWORD ||
    process.env.INITIAL_SUPER_ADMIN_PASSWORD ||
    "AdminPass2026!";

  if (!email || !email.includes("@")) {
    console.error("❌ Error: A valid email address is required.");
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error("❌ Error: Password must be at least 8 characters long.");
    process.exit(1);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (existingUser) {
    console.log(`ℹ️ Existing user found (Current role: ${existingUser.role}). Updating to SUPER_ADMIN...`);
  } else {
    console.log(`✨ Creating new Super Admin account for: ${email}...`);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      name,
      email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
  });

  console.log("✅ Super Admin account configured successfully!");
  console.log(`   User ID: ${admin.id}`);
  console.log(`   Email:   ${admin.email}`);
  console.log(`   Role:    ${admin.role}`);
  console.log(`   Active:  ${admin.isActive}`);
}

main()
  .catch((e) => {
    console.error("❌ Failed to provision Super Admin account:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
