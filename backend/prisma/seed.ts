import {
  PrismaClient,
  UserRole,
  HarvestLotStatus,
  ProcessingBatchStatus,
  ParchmentLotStatus,
  GreenBeanSourceType,
  GreenBeanAvailabilityStatus,
  CuppingSessionType,
  CuppingSessionStatus,
} from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

// Coffee varieties list
const COFFEE_VARIETIES = [
  "Gesha",
  "Caturra",
  "Bourbon",
  "Typica",
  "SL28",
  "SL34",
  "Pacamara",
  "Catuai",
  "Mundo Novo",
  "Maragogype",
  "Kent",
  "Blue Mountain",
  "Ethiopian Heirloom",
  "Java",
  "Tekisic",
];

// Process types
const PROCESS_TYPES = ["Washed", "Natural", "Honey"];

// Thai locations for farms
const THAI_LOCATIONS = [
  { name: "Chiang Mai", lat: 18.7883, lng: 98.9853, altitude: "1200m" },
  { name: "Chiang Rai", lat: 19.9071, lng: 99.8309, altitude: "1400m" },
  { name: "Doi Inthanon", lat: 18.5883, lng: 98.4869, altitude: "1500m" },
  { name: "Mae Hong Son", lat: 19.299, lng: 97.9654, altitude: "1100m" },
  { name: "Nan Province", lat: 18.7756, lng: 100.773, altitude: "1000m" },
  { name: "Phayao", lat: 19.1676, lng: 99.9083, altitude: "900m" },
  { name: "Lampang", lat: 18.2888, lng: 99.4906, altitude: "850m" },
  { name: "Tak", lat: 16.8839, lng: 99.1258, altitude: "800m" },
];

// Grades for green beans
const GRADES = [
  "Grade A",
  "Grade B",
  "Grade C",
  "Peaberry",
  "Screen 18",
  "Screen 17",
  "Screen 16",
];

async function main() {
  console.log("🌱 Starting seed...");

  // Check if we're in development environment
  const isDevelopment =
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL &&
    !process.env.RAILWAY_ENVIRONMENT;

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
  console.log("✅ Created/Updated admin user:", admin.email);

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
  console.log("✅ Created/Updated second admin user:", secondAdmin.email);

  // Create default users from mock data
  const users = [
    // Test users - ONLY created in development environment
    ...(isDevelopment
      ? [
          {
            email: "test@example.com",
            username: "testuser",
            password: await hashPassword("test123456"),
            name: "Test User (Admin)",
            roles: [UserRole.Farmer, UserRole.Admin],
            isActive: true,
            mustChangePassword: false,
          },
          {
            email: "farmer-test@example.com",
            username: "farmer-test",
            password: await hashPassword("test123456"),
            name: "Test Farmer",
            roles: [UserRole.Farmer],
            isActive: true,
            mustChangePassword: false,
          },
        ]
      : []),
    {
      email: "farmer@coffee.com",
      username: "farmer1",
      password: await hashPassword("farmer123"),
      name: "Maria Rodriguez",
      roles: [UserRole.Farmer],
    },
    {
      email: "processor@coffee.com",
      username: "processor1",
      password: await hashPassword("processor123"),
      name: "Alarak",
      roles: [UserRole.Processor],
    },
    {
      email: "roaster@coffee.com",
      username: "roaster1",
      password: await hashPassword("roaster123"),
      name: "Jim Raynor",
      roles: [UserRole.Roaster],
    },
    {
      email: "headjudge@coffee.com",
      username: "headjudge",
      password: await hashPassword("headjudge123"),
      name: "Artanis",
      roles: [UserRole.HeadJudge],
    },
    {
      email: "cupper@coffee.com",
      username: "cupper1",
      password: await hashPassword("cupper123"),
      name: "Tassadar",
      roles: [UserRole.Cupper],
    },
    {
      email: "cupper2@coffee.com",
      username: "cupper2",
      password: await hashPassword("cupper123"),
      name: "Zeratul",
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
        isActive: userData.isActive !== undefined ? userData.isActive : true,
        mustChangePassword:
          userData.mustChangePassword !== undefined
            ? userData.mustChangePassword
            : false,
      },
      create: {
        ...userData,
        isActive: userData.isActive !== undefined ? userData.isActive : true,
        mustChangePassword:
          userData.mustChangePassword !== undefined
            ? userData.mustChangePassword
            : false,
      },
    });
    console.log("✅ Created/Updated user:", user.email);
  }

  if (isDevelopment) {
    console.log(
      "⚠️  Test user (test@example.com) created for development/testing only",
    );
  }

  // ============================================================
  // Generate 10 Mock Users with Faker
  // ============================================================
  console.log("\n📦 Generating 10 mock users...");

  const roleDistribution = [
    { role: UserRole.Farmer, count: 4 },
    { role: UserRole.Processor, count: 2 },
    { role: UserRole.Roaster, count: 2 },
    { role: UserRole.Cupper, count: 1 },
    { role: UserRole.HeadJudge, count: 1 },
  ];

  const createdMockUsers: { id: string; name: string; roles: UserRole[] }[] =
    [];
  let userIndex = 1;

  for (const { role, count } of roleDistribution) {
    for (let i = 0; i < count; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const name = `${firstName} ${lastName}`;
      const email = faker.internet
        .email({ firstName, lastName, provider: "coffeelab.test" })
        .toLowerCase();
      const username = faker.internet
        .username({ firstName, lastName })
        .toLowerCase()
        .slice(0, 20);

      // Some users get multiple roles (20% chance)
      const additionalRoles: UserRole[] = [];
      if (Math.random() < 0.2) {
        const allRoles = Object.values(UserRole).filter((r) => r !== role);
        additionalRoles.push(
          allRoles[Math.floor(Math.random() * allRoles.length)],
        );
      }

      const userRoles = [role, ...additionalRoles];
      const hashedPassword = await hashPassword("password123");

      try {
        const mockUser = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            username: `${username}_${userIndex}`,
            password: hashedPassword,
            name,
            roles: userRoles,
            isActive: Math.random() > 0.05, // 95% active
            mustChangePassword: false,
          },
        });
        createdMockUsers.push({
          id: mockUser.id,
          name: mockUser.name,
          roles: mockUser.roles as UserRole[],
        });
        userIndex++;
      } catch (e) {
        // Skip if duplicate
        console.log(`⚠️  Skipped duplicate user: ${email}`);
      }
    }
  }
  console.log(`✅ Created ${createdMockUsers.length} mock users`);

  // ============================================================
  // Create Farms for Farmers
  // ============================================================
  console.log("\n🌾 Creating farms for farmers...");

  const farmers = createdMockUsers.filter((u) =>
    u.roles.includes(UserRole.Farmer),
  );
  const createdFarms: { id: string; ownerId: string; farmName: string }[] = [];

  for (const farmer of farmers) {
    const location =
      THAI_LOCATIONS[Math.floor(Math.random() * THAI_LOCATIONS.length)];
    const farmName = `${faker.word.adjective().charAt(0).toUpperCase() + faker.word.adjective().slice(1)} ${faker.word.noun().charAt(0).toUpperCase() + faker.word.noun().slice(1)} Coffee Farm`;

    // Check if farm exists
    const existingFarm = await prisma.farm.findFirst({
      where: { ownerId: farmer.id },
    });

    if (!existingFarm) {
      const farm = await prisma.farm.create({
        data: {
          farmName,
          location: `${location.name}, Thailand`,
          latitude: location.lat + (Math.random() - 0.5) * 0.1,
          longitude: location.lng + (Math.random() - 0.5) * 0.1,
          altitude: location.altitude,
          ownerId: farmer.id,
          caretakerName: farmer.name,
          sizeHectares: parseFloat((Math.random() * 20 + 2).toFixed(1)),
          varieties: faker.helpers.arrayElements(COFFEE_VARIETIES, {
            min: 2,
            max: 5,
          }),
          archived: false,
        },
      });
      createdFarms.push({
        id: farm.id,
        ownerId: farm.ownerId,
        farmName: farm.farmName,
      });
    }
  }
  console.log(`✅ Created ${createdFarms.length} farms`);

  // ============================================================
  // Create Crop Years
  // ============================================================
  console.log("\n📅 Creating crop years...");

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

  const createdCropYears: { id: string; year: string }[] = [];
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
    createdCropYears.push({ id: cropYear.id, year: cropYear.year });
    console.log("✅ Created/Updated crop year:", cropYear.year);
  }

  // ============================================================
  // Create Harvest Lots
  // ============================================================
  console.log("\n🍒 Creating harvest lots...");

  const createdHarvestLots: {
    id: string;
    farmId: string;
    cropYearId: string;
    weightKg: number;
  }[] = [];

  for (const farm of createdFarms.slice(0, 4)) {
    // Create for first 4 farms
    const farmer = farmers.find((f) => f.id === farm.ownerId);
    if (!farmer) continue;

    const numLots = Math.floor(Math.random() * 4) + 1; // 1-4 lots per farm

    for (let i = 0; i < numLots; i++) {
      const cropYear = createdCropYears[Math.floor(Math.random() * 3)]; // Use one of first 3 crop years
      const weight = parseFloat((Math.random() * 500 + 50).toFixed(1));
      const variety =
        COFFEE_VARIETIES[Math.floor(Math.random() * COFFEE_VARIETIES.length)];
      const harvestDate = faker.date.between({
        from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        to: new Date(),
      });

      const harvestLot = await prisma.harvestLot.create({
        data: {
          farmerName: farmer.name,
          cherryVariety: variety,
          weightKg: weight,
          farmPlotLocation: `Plot ${faker.number.int({ min: 1, max: 10 })}`,
          harvestDate,
          status:
            Math.random() > 0.3
              ? HarvestLotStatus.Processing
              : HarvestLotStatus.ReadyForProcessing,
          cropYearId: cropYear.id,
          farmId: farm.id,
          createdById: farmer.id,
        },
      });
      createdHarvestLots.push({
        id: harvestLot.id,
        farmId: farm.id,
        cropYearId: cropYear.id,
        weightKg: weight,
      });
    }
  }
  console.log(`✅ Created ${createdHarvestLots.length} harvest lots`);

  // ============================================================
  // Create Processing Batches
  // ============================================================
  console.log("\n⚙️ Creating processing batches...");

  const processors = createdMockUsers.filter((u) =>
    u.roles.includes(UserRole.Processor),
  );
  const createdProcessingBatches: {
    id: string;
    harvestLotId: string;
    processType: string;
  }[] = [];

  for (const harvestLot of createdHarvestLots.slice(0, 10)) {
    // Process first 10 lots
    const processor = processors[Math.floor(Math.random() * processors.length)];
    const processType =
      PROCESS_TYPES[Math.floor(Math.random() * PROCESS_TYPES.length)];
    const status = faker.helpers.arrayElement([
      ProcessingBatchStatus.ToProcess,
      ProcessingBatchStatus.Drying,
      ProcessingBatchStatus.Completed,
      ProcessingBatchStatus.Completed, // More likely to be completed
    ]);

    const batch = await prisma.processingBatch.create({
      data: {
        harvestLotId: harvestLot.id,
        createdById: processor?.id,
        status,
        processType,
        processNotes: faker.lorem.sentence(),
        cropYearId: harvestLot.cropYearId,
        parchmentWeightKg:
          status === ProcessingBatchStatus.Completed
            ? parseFloat((harvestLot.weightKg * 0.2).toFixed(1))
            : null,
        moistureContent:
          status === ProcessingBatchStatus.Completed
            ? parseFloat((Math.random() * 3 + 10).toFixed(1))
            : null,
        dryingStartDate:
          status !== ProcessingBatchStatus.ToProcess
            ? faker.date.recent({ days: 30 })
            : null,
        dryingEndDate:
          status === ProcessingBatchStatus.Completed
            ? faker.date.recent({ days: 7 })
            : null,
      },
    });
    createdProcessingBatches.push({
      id: batch.id,
      harvestLotId: harvestLot.id,
      processType,
    });
  }
  console.log(
    `✅ Created ${createdProcessingBatches.length} processing batches`,
  );

  // ============================================================
  // Create Parchment Lots
  // ============================================================
  console.log("\n📦 Creating parchment lots...");

  const completedBatches = await prisma.processingBatch.findMany({
    where: { status: ProcessingBatchStatus.Completed },
    include: { harvestLot: true },
  });

  const createdParchmentLots: { id: string; processingBatchId: string }[] = [];

  for (const batch of completedBatches.slice(0, 5)) {
    const weight = parseFloat((batch.harvestLot.weightKg * 0.2).toFixed(1));

    const parchmentLot = await prisma.parchmentLot.create({
      data: {
        processingBatchId: batch.id,
        harvestLotId: batch.harvestLotId,
        initialWeightKg: weight,
        currentWeightKg: weight,
        moistureContent: parseFloat((Math.random() * 3 + 10).toFixed(1)),
        processType: batch.processType,
        status:
          Math.random() > 0.5
            ? ParchmentLotStatus.Hulled
            : ParchmentLotStatus.AwaitingHulling,
      },
    });
    createdParchmentLots.push({
      id: parchmentLot.id,
      processingBatchId: batch.id,
    });
  }
  console.log(`✅ Created ${createdParchmentLots.length} parchment lots`);

  // ============================================================
  // Create Green Bean Lots
  // ============================================================
  console.log("\n🫘 Creating green bean lots...");

  const hulledParchments = await prisma.parchmentLot.findMany({
    where: { status: ParchmentLotStatus.Hulled },
  });

  const createdGreenBeanLots: { id: string }[] = [];

  for (const parchment of hulledParchments) {
    const weight = parseFloat((parchment.currentWeightKg * 0.8).toFixed(1));
    const grade = GRADES[Math.floor(Math.random() * GRADES.length)];

    const greenBeanLot = await prisma.greenBeanLot.create({
      data: {
        sourceType: GreenBeanSourceType.Internal,
        parchmentLotId: parchment.id,
        grade,
        initialWeightKg: weight,
        currentWeightKg: weight,
        availabilityStatus: GreenBeanAvailabilityStatus.Available,
        pricePerKg: parseFloat((Math.random() * 200 + 100).toFixed(2)),
        currency: "THB",
        priceSetDate: new Date(),
      },
    });
    createdGreenBeanLots.push({ id: greenBeanLot.id });
  }

  // Create some external green bean lots
  for (let i = 0; i < 2; i++) {
    const weight = parseFloat((Math.random() * 100 + 20).toFixed(1));
    const grade = GRADES[Math.floor(Math.random() * GRADES.length)];

    await prisma.greenBeanLot.create({
      data: {
        sourceType: GreenBeanSourceType.External,
        grade,
        initialWeightKg: weight,
        currentWeightKg: weight,
        availabilityStatus: GreenBeanAvailabilityStatus.Available,
        pricePerKg: parseFloat((Math.random() * 300 + 150).toFixed(2)),
        currency: "THB",
        priceSetDate: new Date(),
        externalSource: {
          originName: faker.location.country(),
          producerName: faker.company.name(),
          variety:
            COFFEE_VARIETIES[
              Math.floor(Math.random() * COFFEE_VARIETIES.length)
            ],
          processType:
            PROCESS_TYPES[Math.floor(Math.random() * PROCESS_TYPES.length)],
          purchaseDate: faker.date.recent({ days: 60 }).toISOString(),
          pricePerKg: parseFloat((Math.random() * 300 + 150).toFixed(2)),
          currency: "THB",
        },
      },
    });
  }
  console.log(`✅ Created ${createdGreenBeanLots.length + 2} green bean lots`);

  // ============================================================
  // Create Showcase QC Data for Demo Lot GBL003
  // ============================================================
  console.log("\n☕ Creating showcase QC data for GBL003...");

  const [headJudgeUser, cupperOne, cupperTwo] = await Promise.all([
    prisma.user.findUnique({ where: { email: "headjudge@coffee.com" } }),
    prisma.user.findUnique({ where: { email: "cupper@coffee.com" } }),
    prisma.user.findUnique({ where: { email: "cupper2@coffee.com" } }),
  ]);

  if (headJudgeUser && cupperOne && cupperTwo) {
    const showcaseLot = await prisma.greenBeanLot.upsert({
      where: { id: "GBL003" },
      update: {
        sourceType: GreenBeanSourceType.External,
        grade: "Grade A",
        initialWeightKg: 60,
        currentWeightKg: 60,
        availabilityStatus: GreenBeanAvailabilityStatus.Available,
        pricePerKg: 380,
        currency: "THB",
        priceSetDate: new Date("2025-09-20"),
        externalSource: {
          originName: "Ethiopia Guji Cooperative",
          variety: "Heirloom",
          processType: "Natural",
          purchaseDate: "2025-09-20",
          pricePerKg: 380,
          currency: "THB",
          supplierNotes: "Winey, berry notes",
        },
      },
      create: {
        id: "GBL003",
        sourceType: GreenBeanSourceType.External,
        grade: "Grade A",
        initialWeightKg: 60,
        currentWeightKg: 60,
        availabilityStatus: GreenBeanAvailabilityStatus.Available,
        pricePerKg: 380,
        currency: "THB",
        priceSetDate: new Date("2025-09-20"),
        externalSource: {
          originName: "Ethiopia Guji Cooperative",
          variety: "Heirloom",
          processType: "Natural",
          purchaseDate: "2025-09-20",
          pricePerKg: 380,
          currency: "THB",
          supplierNotes: "Winey, berry notes",
        },
      },
    });

    const session = await prisma.cuppingSession.upsert({
      where: { id: "CS001" },
      update: {
        name: "National Coffee Championship 2025",
        date: new Date("2025-09-10"),
        type: CuppingSessionType.Competition,
        status: CuppingSessionStatus.Adjudication,
        createdBy: headJudgeUser.id,
      },
      create: {
        id: "CS001",
        name: "National Coffee Championship 2025",
        date: new Date("2025-09-10"),
        type: CuppingSessionType.Competition,
        status: CuppingSessionStatus.Adjudication,
        createdBy: headJudgeUser.id,
      },
    });

    const sample = await prisma.cuppingSample.upsert({
      where: { id: "S03" },
      update: {
        cuppingSessionId: session.id,
        blindCode: "GBL003",
        greenBeanLotId: showcaseLot.id,
        submitterInfo: { name: "Ethiopia Guji Cooperative" },
        originInfo: { farm: "Guji Highlands" },
        lotInfo: { process: "Natural" },
      },
      create: {
        id: "S03",
        cuppingSessionId: session.id,
        blindCode: "GBL003",
        greenBeanLotId: showcaseLot.id,
        submitterInfo: { name: "Ethiopia Guji Cooperative" },
        originInfo: { farm: "Guji Highlands" },
        lotInfo: { process: "Natural" },
      },
    });

    const judgeEntries = [
      { user: cupperOne, role: UserRole.Cupper },
      { user: cupperTwo, role: UserRole.Cupper },
    ];

    for (const entry of judgeEntries) {
      await prisma.cuppingSessionJudge.upsert({
        where: {
          cuppingSessionId_judgeId: {
            cuppingSessionId: session.id,
            judgeId: entry.user.id,
          },
        },
        update: {
          judgeName: entry.user.name,
          judgeRole: entry.role,
        },
        create: {
          cuppingSessionId: session.id,
          judgeId: entry.user.id,
          judgeName: entry.user.name,
          judgeRole: entry.role,
        },
      });
    }

    const scorePayloads = [
      {
        user: cupperOne,
        totalScore: 86.5,
        notes: "Blueberry jam, florals, plush mouthfeel.",
        scores: {
          "Fragrance/Aroma": 8.4,
          Flavor: 8.3,
          Aftertaste: 8.2,
          Acidity: 8.4,
          Body: 8.6,
          Uniformity: 10,
          Balance: 8.3,
          "Clean Cup": 10,
          Sweetness: 10,
          Overall: 8.4,
        },
      },
      {
        user: cupperTwo,
        totalScore: 86.8,
        notes: "Red berry compote, cocoa nib, lively acidity.",
        scores: {
          "Fragrance/Aroma": 8.6,
          Flavor: 8.4,
          Aftertaste: 8.1,
          Acidity: 8.3,
          Body: 8.4,
          Uniformity: 10,
          Balance: 8.2,
          "Clean Cup": 10,
          Sweetness: 10,
          Overall: 8.3,
        },
      },
    ];

    for (const payload of scorePayloads) {
      await prisma.judgeScore.upsert({
        where: {
          cuppingSessionId_sampleId_judgeId: {
            cuppingSessionId: session.id,
            sampleId: sample.id,
            judgeId: payload.user.id,
          },
        },
        update: {
          scores: payload.scores,
          notes: payload.notes,
          totalScore: payload.totalScore,
          judgeName: payload.user.name,
        },
        create: {
          cuppingSessionId: session.id,
          sampleId: sample.id,
          judgeId: payload.user.id,
          judgeName: payload.user.name,
          scores: payload.scores,
          notes: payload.notes,
          totalScore: payload.totalScore,
        },
      });
    }

    const averageScore =
      scorePayloads.reduce((sum, payload) => sum + payload.totalScore, 0) /
      scorePayloads.length;

    await prisma.cuppingScore.upsert({
      where: {
        greenBeanLotId_sessionId: {
          greenBeanLotId: showcaseLot.id,
          sessionId: session.id,
        },
      },
      update: { score: averageScore },
      create: {
        greenBeanLotId: showcaseLot.id,
        sessionId: session.id,
        score: averageScore,
      },
    });

    console.log("✅ Seeded QC showcase data for GBL003");
  } else {
    console.log("⚠️ Skipped QC showcase data: missing base users");
  }

  // ============================================================
  // Create Activity Types
  // ============================================================
  console.log("\n📋 Creating activity types...");

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
    console.log("✅ Created activity type:", activityType.name);
  }

  // ============================================================
  // Create Process Types
  // ============================================================
  console.log("\n🔄 Creating process types...");

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
    console.log("✅ Created process type:", processType.name);
  }

  // ============================================================
  // Create Sample Farms for Test Users (Development Only)
  // ============================================================
  if (isDevelopment) {
    const testUser = await prisma.user.findUnique({
      where: { email: "test@example.com" },
    });
    const farmerUser = await prisma.user.findUnique({
      where: { email: "farmer@coffee.com" },
    });

    if (testUser) {
      const existingTestFarm = await prisma.farm.findFirst({
        where: {
          ownerId: testUser.id,
          farmName: "Test Coffee Farm",
        },
      });

      if (!existingTestFarm) {
        const testFarm = await prisma.farm.create({
          data: {
            farmName: "Test Coffee Farm",
            location: "Chiang Mai, Thailand",
            latitude: 18.7883,
            longitude: 98.9853,
            altitude: "1200m",
            ownerId: testUser.id,
            caretakerName: "John Doe",
            sizeHectares: 5.5,
            varieties: ["Gesha", "Caturra", "Typica"],
            archived: false,
          },
        });
        console.log("✅ Created test farm:", testFarm.farmName);
      }
    }

    if (farmerUser) {
      const existingFarmerFarm = await prisma.farm.findFirst({
        where: {
          ownerId: farmerUser.id,
          farmName: "Maria's Coffee Estate",
        },
      });

      if (!existingFarmerFarm) {
        const farmerFarm = await prisma.farm.create({
          data: {
            farmName: "Maria's Coffee Estate",
            location: "Doi Inthanon, Chiang Mai, Thailand",
            latitude: 18.5883,
            longitude: 98.4869,
            altitude: "1500m",
            ownerId: farmerUser.id,
            caretakerName: "Maria Rodriguez",
            sizeHectares: 12.0,
            varieties: ["Bourbon", "SL28", "SL34"],
            archived: false,
          },
        });
        console.log("✅ Created farmer farm:", farmerFarm.farmName);
      }
    }
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n📊 Seed Summary:");
  console.log(`   👥 Mock Users: ${createdMockUsers.length}`);
  console.log(`   🌾 Farms: ${createdFarms.length}`);
  console.log(`   📅 Crop Years: ${createdCropYears.length}`);
  console.log(`   🍒 Harvest Lots: ${createdHarvestLots.length}`);
  console.log(`   ⚙️ Processing Batches: ${createdProcessingBatches.length}`);
  console.log(`   📦 Parchment Lots: ${createdParchmentLots.length}`);
  console.log(`   🫘 Green Bean Lots: ${createdGreenBeanLots.length + 2}`);

  console.log("\n🎉 Seed completed!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
