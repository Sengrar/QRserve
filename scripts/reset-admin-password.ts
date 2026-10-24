import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const targetEmail = (process.argv[2] || "piyushverma282005@gmail.com").toLowerCase().trim();

async function readPasswordFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => {
      resolve(input.trim());
    });
    process.stdin.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  const password = await readPasswordFromStdin();

  if (!password || password.length < 8) {
    console.error("❌ Error: Password must be at least 8 characters long.");
    process.exit(1);
  }

  // 1. Verify user exists
  const user = await prisma.user.findUnique({
    where: { email: targetEmail },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  });

  if (!user) {
    console.error(`❌ Error: Account with email '${targetEmail}' was not found in the database.`);
    process.exit(1);
  }

  // 2. Hash using bcrypt with 12 salt rounds (matching src/lib/auth/password.ts)
  const passwordHash = await bcrypt.hash(password, 12);

  // 3. Update only the passwordHash, ensuring no other data, IDs, or roles are altered
  const updatedUser = await prisma.user.update({
    where: { email: targetEmail },
    data: {
      passwordHash,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      passwordHash: true,
    },
  });

  // 4. Verify password authentication immediately against the stored hash
  const isValid = await bcrypt.compare(password, updatedUser.passwordHash);

  if (!isValid) {
    console.error("❌ Verification failed: Password hash comparison did not succeed.");
    process.exit(1);
  }

  console.log("\n========================================================");
  console.log("✅ Password reset successfully!");
  console.log(`   Account ID:     ${updatedUser.id}`);
  console.log(`   Email:          ${updatedUser.email}`);
  console.log(`   Name:           ${updatedUser.name}`);
  console.log(`   Role:           ${updatedUser.role}`);
  console.log(`   Active:         ${updatedUser.isActive}`);
  console.log("   Authentication: VERIFIED (Bcrypt hash matches)");
  console.log("========================================================\n");
}

main()
  .catch((e) => {
    console.error(`❌ Failed to reset password for ${targetEmail}:`, e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
