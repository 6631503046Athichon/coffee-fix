import {
  PrismaClient,
  UserRole,
} from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed...");

  // Create default admin user
  const adminPassword = await hashPassword("admin123");
  const admin = await prisma.user.upsert({
    where: { email: "6631503046@lamduan.mfu.ac.th" },
    update: {
      password: adminPassword,
      username: "admin",
      name: "Admin User",
      roles: [UserRole.Admin],
      isActive: true,
      isSuperAdmin: true,
      mustChangePassword: false,
    },
    create: {
      email: "6631503046@lamduan.mfu.ac.th",
      username: "admin",
      password: adminPassword,
      name: "Admin User",
      roles: [UserRole.Admin],
      isActive: true,
      isSuperAdmin: true,
      mustChangePassword: false,
    },
  });
  console.log("Created/Updated admin user:", admin.email);

  // Create second admin user for ownership transfer
  const secondAdminPassword = await hashPassword("admin123");
  const secondAdmin = await prisma.user.upsert({
    where: { email: "admin2@coffee.com" },
    update: {
      password: secondAdminPassword,
      username: "admin2",
      name: "Second Admin",
      roles: [UserRole.Admin],
      isActive: true,
      isSuperAdmin: false,
      mustChangePassword: false,
    },
    create: {
      email: "admin2@coffee.com",
      username: "admin2",
      password: secondAdminPassword,
      name: "Second Admin",
      roles: [UserRole.Admin],
      isActive: true,
      isSuperAdmin: false,
      mustChangePassword: false,
    },
  });
  console.log("Created/Updated second admin user:", secondAdmin.email);

  // Create default role users
  const users = [
    {
      email: "farmer@coffee.com",
      username: "farmer1",
      password: await hashPassword("farmer123"),
      name: "Farmer User",
      roles: [UserRole.Farmer],
    },
    {
      email: "processor@coffee.com",
      username: "processor1",
      password: await hashPassword("processor123"),
      name: "Processor User",
      roles: [UserRole.Processor],
    },
    {
      email: "roaster@coffee.com",
      username: "roaster1",
      password: await hashPassword("roaster123"),
      name: "Roaster User",
      roles: [UserRole.Roaster],
    },
    {
      email: "headjudge@coffee.com",
      username: "headjudge",
      password: await hashPassword("headjudge123"),
      name: "Head Judge User",
      roles: [UserRole.HeadJudge],
    },
    {
      email: "cupper@coffee.com",
      username: "cupper1",
      password: await hashPassword("cupper123"),
      name: "Cupper User",
      roles: [UserRole.Cupper],
    },
    {
      email: "cupper2@coffee.com",
      username: "cupper2",
      password: await hashPassword("cupper123"),
      name: "Cupper 2 User",
      roles: [UserRole.Cupper],
    },
  ];

  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        password: userData.password,
        username: userData.username,
        name: userData.name,
        roles: userData.roles,
        isActive: true,
        mustChangePassword: false,
      },
      create: {
        ...userData,
        isActive: true,
        mustChangePassword: false,
      },
    });
    console.log("Created/Updated user:", user.email);
  }

  // ============================================================
  // Create Crop Years
  // ============================================================
  console.log("\nCreating crop years...");

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let activeCropYearStart: number;
  if (currentMonth >= 10) {
    activeCropYearStart = currentYear;
  } else {
    activeCropYearStart = currentYear - 1;
  }

  const cropYearsToCreate = [];
  for (let i = -2; i <= 2; i++) {
    const yearStart = activeCropYearStart + i;
    const yearEnd = yearStart + 1;
    const yearString = `${yearStart}/${yearEnd}`;

    cropYearsToCreate.push({
      year: yearString,
      startDate: new Date(`${yearStart}-10-01`),
      endDate: new Date(`${yearEnd}-09-30`),
      description:
        i === 0
          ? `Current crop year ${yearString}`
          : i < 0
            ? `Previous crop year ${yearString}`
            : `Next crop year ${yearString}`,
    });
  }

  for (const cy of cropYearsToCreate) {
    const cropYear = await prisma.cropYear.upsert({
      where: { year: cy.year },
      update: {
        startDate: cy.startDate,
        endDate: cy.endDate,
        description: cy.description,
      },
      create: {
        year: cy.year,
        startDate: cy.startDate,
        endDate: cy.endDate,
        description: cy.description,
      },
    });
    console.log("Created/Updated crop year:", cropYear.year);
  }

  // ============================================================
  // Create Activity Types
  // ============================================================
  console.log("\nCreating activity types...");

  const activityTypes = [
    { name: "Fertilizer", description: "Fertilizer application" },
    { name: "Pest Management", description: "Pest control activities" },
    {
      name: "Water Management",
      description: "Irrigation and water management",
    },
    { name: "Pruning", description: "Tree pruning activities" },
    { name: "Harvesting", description: "Coffee cherry harvesting" },
  ];

  for (const at of activityTypes) {
    const activityType = await prisma.activityType.upsert({
      where: { name: at.name },
      update: {},
      create: {
        ...at,
        isActive: true,
      },
    });
    console.log("Created activity type:", activityType.name);
  }

  // ============================================================
  // Create Process Types
  // ============================================================
  console.log("\nCreating process types...");

  const processTypes = [
    {
      name: "Washed",
      description: "Washed process",
      colorScheme: {
        borderColor: "border-l-blue-500",
        iconBg: "bg-blue-100",
        iconColor: "text-blue-600",
        badgeColor: "bg-blue-100 text-blue-700 border-blue-200",
      },
    },
    {
      name: "Natural",
      description: "Natural/dry process",
      colorScheme: {
        borderColor: "border-l-yellow-500",
        iconBg: "bg-yellow-100",
        iconColor: "text-yellow-600",
        badgeColor: "bg-yellow-100 text-yellow-700 border-yellow-200",
      },
    },
    {
      name: "Honey",
      description: "Honey process",
      colorScheme: {
        borderColor: "border-l-amber-500",
        iconBg: "bg-amber-100",
        iconColor: "text-amber-600",
        badgeColor: "bg-amber-100 text-amber-700 border-amber-200",
      },
    },
  ];

  for (const pt of processTypes) {
    const processType = await prisma.processType.upsert({
      where: { name: pt.name },
      update: {},
      create: {
        name: pt.name,
        description: pt.description,
        colorScheme: JSON.stringify(pt.colorScheme),
        isActive: true,
      },
    });
    console.log("Created process type:", processType.name);
  }

  console.log("\nSeed completed!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
