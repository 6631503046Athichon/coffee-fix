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
  // สร้าง 3 ปี: ปีก่อน, ปีปัจจุบัน, ปีหน้า
  for (let i = -1; i <= 1; i++) {
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
    { name: "Soil Management", description: "Soil preparation and management activities" },
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

  // ============================================================
  // Create Coffee Varieties
  // ============================================================
  console.log("\nCreating coffee varieties...");

  const coffeeVarieties = [
    // พันธุ์ที่นิยมในไทย
    { name: "Catimor", species: "Arabica", origin: "Thailand", description: "พันธุ์ที่นิยมปลูกมากที่สุดในไทย ทนทานต่อโรคราสนิม", characteristics: "รสชาติกลมกล่อม มีความขมเล็กน้อย", altitude: "800-1400m" },
    { name: "Chiang Mai 80", species: "Arabica", origin: "Thailand", description: "พันธุ์พื้นเมืองเชียงใหม่", characteristics: "รสหวานอมเปรี้ยว กลิ่นดอกไม้", altitude: "1200-1600m" },

    // พันธุ์คลาสสิก
    { name: "Typica", species: "Arabica", origin: "Ethiopia/Yemen", description: "พันธุ์ดั้งเดิม ต้นกำเนิดของพันธุ์อาราบิก้าหลายสายพันธุ์", characteristics: "รสหวานสะอาด กลิ่นหอม ความเปรี้ยวอ่อน", altitude: "1200-1800m" },
    { name: "Bourbon", species: "Arabica", origin: "Reunion Island", description: "สายพันธุ์คลาสสิก มาจากเกาะ Reunion", characteristics: "หวาน คาราเมล ช็อกโกแลต ผลไม้", altitude: "1200-1800m" },
    { name: "Caturra", species: "Arabica", origin: "Brazil", description: "Bourbon mutation พบในบราซิล ให้ผลผลิตสูง", characteristics: "เปรี้ยวสดใส รสผลไม้ตระกูลส้ม", altitude: "1200-1700m" },
    { name: "Catuai", species: "Arabica", origin: "Brazil", description: "ลูกผสมระหว่าง Caturra x Mundo Novo", characteristics: "บาลานซ์ดี รสหวานอมเปรี้ยว", altitude: "800-1400m" },

    // พันธุ์พรีเมียม
    { name: "Gesha", species: "Arabica", origin: "Ethiopia", description: "พันธุ์ที่มีชื่อเสียงที่สุดในโลก มาจาก Gesha village", characteristics: "ดอกมะลิ เบอร์กาม็อต ชา รสหวานซับซ้อน", altitude: "1600-2000m" },
    { name: "SL28", species: "Arabica", origin: "Kenya", description: "พัฒนาโดย Scott Laboratories คุณภาพสูง", characteristics: "ผลไม้เบอร์รี่ ส้ม Blackcurrant ความเปรี้ยวสดใส", altitude: "1500-2100m" },
    { name: "SL34", species: "Arabica", origin: "Kenya", description: "พันธุ์พี่น้องกับ SL28 ทนแล้งได้ดี", characteristics: "ผลไม้เบอร์รี่ รสซับซ้อน", altitude: "1500-2100m" },
    { name: "Pacamara", species: "Arabica", origin: "El Salvador", description: "ลูกผสม Pacas x Maragogipe เมล็ดใหญ่", characteristics: "ดอกไม้ ช็อกโกแลต ผลไม้ Body หนัก", altitude: "1200-1800m" },

    // พันธุ์อื่นๆ
    { name: "Mundo Novo", species: "Arabica", origin: "Brazil", description: "ลูกผสม Bourbon x Typica", characteristics: "ช็อกโกแลต ถั่ว รสหวาน", altitude: "1000-1600m" },
    { name: "Maragogype", species: "Arabica", origin: "Brazil", description: "Typica mutation เมล็ดใหญ่พิเศษ (Elephant Bean)", characteristics: "รสอ่อนโยน หวาน กลิ่นผลไม้", altitude: "800-1200m" },
    { name: "Java", species: "Arabica", origin: "Indonesia", description: "นำเข้ามาจากเยเมนสู่ชวา พันธุ์คลาสสิก", characteristics: "รสเข้ม สมุนไพร ดิน", altitude: "900-1500m" },
    { name: "Ethiopian Heirloom", species: "Arabica", origin: "Ethiopia", description: "พันธุ์พื้นเมืองเอธิโอเปีย หลากหลายสายพันธุ์", characteristics: "ดอกไม้ เบอร์รี่ ชา ซับซ้อน", altitude: "1500-2200m" },
    { name: "Kent", species: "Arabica", origin: "India", description: "พันธุ์จากอินเดีย ทนโรคราสนิม", characteristics: "รสหวาน บาลานซ์ดี", altitude: "1000-1500m" },

    // Robusta
    { name: "Robusta", species: "Robusta", origin: "Africa", description: "พันธุ์โรบัสต้า ให้คาเฟอีนสูง ทนทาน", characteristics: "รสเข้ม ขม Body หนัก", altitude: "200-800m" },
  ];

  for (const cv of coffeeVarieties) {
    const coffeeVariety = await prisma.coffeeVariety.upsert({
      where: { name: cv.name },
      update: {},
      create: {
        name: cv.name,
        species: cv.species,
        origin: cv.origin,
        description: cv.description,
        characteristics: cv.characteristics,
        altitude: cv.altitude,
        isActive: true,
      },
    });
    console.log("Created coffee variety:", coffeeVariety.name);
  }

  // ============================================================
  // Create Soil Analysis for Farm สมชาย (เชียงราย)
  // ============================================================
  console.log("\nCreating soil analysis...");

  const targetFarmId = "351537a2-29a1-499a-a019-475e91351664";
  const farmExists = await prisma.farm.findUnique({
    where: { id: targetFarmId },
  });

  if (farmExists) {
    const soilAnalysis = await prisma.soilAnalysis.upsert({
      where: { id: "soil-analysis-somchai-001" },
      update: {
        farmId: targetFarmId,
        farmPlotLocation: "เชียงราย",
        testDate: new Date("2026-01-30"),
        labName: "Chiang Mai Agricultural Testing Laboratory",
        certificateNumber: "CMATL-2026-0342",
        pH: 6.2,
        nitrogen: 1.5,
        phosphorus: 25,
        potassium: 120,
        calcium: 850,
        magnesium: 150,
        organicMatter: 3.2,
        sulfur: 15,
        iron: 45,
        manganese: 22,
        zinc: 8,
        copper: 2,
        boron: 1.2,
        recommendations: "ดินมีคุณภาพดี pH เหมาะสมสำหรับการปลูกกาแฟ แนะนำเพิ่มปุ๋ยอินทรีย์เพื่อรักษาระดับ OM",
        createdBy: admin.id,
        createdByRole: UserRole.Admin,
      },
      create: {
        id: "soil-analysis-somchai-001",
        farmId: targetFarmId,
        farmPlotLocation: "เชียงราย",
        testDate: new Date("2026-01-30"),
        labName: "Chiang Mai Agricultural Testing Laboratory",
        certificateNumber: "CMATL-2026-0342",
        pH: 6.2,
        nitrogen: 1.5,
        phosphorus: 25,
        potassium: 120,
        calcium: 850,
        magnesium: 150,
        organicMatter: 3.2,
        sulfur: 15,
        iron: 45,
        manganese: 22,
        zinc: 8,
        copper: 2,
        boron: 1.2,
        recommendations: "ดินมีคุณภาพดี pH เหมาะสมสำหรับการปลูกกาแฟ แนะนำเพิ่มปุ๋ยอินทรีย์เพื่อรักษาระดับ OM",
        createdBy: admin.id,
        createdByRole: UserRole.Admin,
      },
    });
    console.log("Created soil analysis for farm:", soilAnalysis.farmPlotLocation);
  } else {
    console.log("Farm not found, skipping soil analysis creation for farmId:", targetFarmId);
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
