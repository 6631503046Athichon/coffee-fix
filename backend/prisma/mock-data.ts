import {
  PrismaClient,
  UserRole,
  HarvestLotStatus,
  ProcessingBatchStatus,
  ParchmentLotStatus,
  GreenBeanSourceType,
  GreenBeanAvailabilityStatus,
  WithdrawalType,
  CuppingSessionType,
  CuppingSessionStatus,
  SaleOrderStatus,
  InvoiceStatus,
  CustomerType,
  WeatherSource,
  RoastLevel,
} from "@prisma/client";

const prisma = new PrismaClient();

// Helper to get random element
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper to get random float
function randFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

// Helper to get random int
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper to create a date in the past N days
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function main() {
  console.log("=== Starting Mock Data Generation ===\n");

  // ─── Fetch existing seed data ───────────────────────────────
  const users = await prisma.user.findMany();
  const cropYears = await prisma.cropYear.findMany({ orderBy: { year: "desc" } });
  const activityTypes = await prisma.activityType.findMany();

  const admin = users.find((u) => u.isSuperAdmin)!;
  const farmer = users.find((u) => u.roles.includes(UserRole.Farmer))!;
  const processor = users.find((u) => u.roles.includes(UserRole.Processor))!;
  const roaster = users.find((u) => u.roles.includes(UserRole.Roaster))!;
  const headJudge = users.find((u) => u.roles.includes(UserRole.HeadJudge))!;
  const cuppers = users.filter((u) => u.roles.includes(UserRole.Cupper));

  const currentCropYear = cropYears[0];
  const prevCropYear = cropYears.length > 1 ? cropYears[1] : cropYears[0];

  console.log(`Found ${users.length} users, ${cropYears.length} crop years, ${activityTypes.length} activity types`);

  // ─── 1. Create Farms ────────────────────────────────────────
  console.log("\n--- Creating Farms ---");

  const farmsData = [
    {
      farmName: "ไร่กาแฟดอยช้าง",
      ownerNames: ["สมชาย ดอยช้าง"],
      location: "ดอยช้าง อ.แม่สรวย จ.เชียงราย",
      latitude: 19.85,
      longitude: 99.42,
      altitude: "1200-1400m",
      caretakerNames: ["สมศรี ดอยช้าง"],
      sizeHectares: 15.5,
      varieties: ["Catimor", "Typica", "Bourbon"],
    },
    {
      farmName: "สวนกาแฟดอยตุง",
      ownerNames: ["วิชัย ดอยตุง"],
      location: "ดอยตุง อ.แม่ฟ้าหลวง จ.เชียงราย",
      latitude: 20.29,
      longitude: 99.81,
      altitude: "1000-1300m",
      caretakerNames: ["อรุณ สายลม"],
      sizeHectares: 22.0,
      varieties: ["Catimor", "Chiang Mai 80", "Catuai"],
    },
    {
      farmName: "กาแฟดอยสะเก็ด",
      ownerNames: ["ประเสริฐ สะเก็ด"],
      location: "ดอยสะเก็ด อ.ดอยสะเก็ด จ.เชียงใหม่",
      latitude: 18.87,
      longitude: 99.18,
      altitude: "800-1100m",
      caretakerNames: ["นิยม ชาวดอย"],
      sizeHectares: 8.2,
      varieties: ["Gesha", "SL28", "Typica"],
    },
    {
      farmName: "ไร่กาแฟแม่แจ่ม",
      ownerNames: ["อำพล แม่แจ่ม", "สุภา แม่แจ่ม"],
      location: "แม่แจ่ม อ.แม่แจ่ม จ.เชียงใหม่",
      latitude: 18.49,
      longitude: 98.35,
      altitude: "1300-1600m",
      caretakerNames: [],
      sizeHectares: 12.0,
      varieties: ["Bourbon", "Caturra", "Pacamara"],
    },
    {
      farmName: "สวนกาแฟปางขอน",
      ownerNames: ["เกษม ปางขอน"],
      location: "ปางขอน อ.เมือง จ.เชียงราย",
      latitude: 19.95,
      longitude: 99.75,
      altitude: "1100-1400m",
      caretakerNames: ["ทองดี ศรีปางขอน"],
      sizeHectares: 18.3,
      varieties: ["Catimor", "SL34", "Java"],
    },
  ];

  const farms = [];
  for (const fd of farmsData) {
    const farm = await prisma.farm.create({
      data: {
        farmName: fd.farmName,
        ownerNames: fd.ownerNames,
        location: fd.location,
        latitude: fd.latitude,
        longitude: fd.longitude,
        altitude: fd.altitude,
        caretakerNames: fd.caretakerNames,
        sizeHectares: fd.sizeHectares,
        varieties: fd.varieties,
        ownerId: farmer.id,
      },
    });
    farms.push(farm);
    console.log(`  Created farm: ${farm.farmName}`);
  }

  // ─── 2. Create Harvest Lots ─────────────────────────────────
  console.log("\n--- Creating Harvest Lots ---");

  const cherryVarieties = ["Catimor", "Typica", "Bourbon", "Gesha", "SL28", "Chiang Mai 80", "Caturra", "Catuai", "Pacamara"];
  const farmerNames = ["สมชาย ดอยช้าง", "วิชัย ดอยตุง", "ประเสริฐ สะเก็ด", "อำพล แม่แจ่ม", "เกษม ปางขอน", "สมหมาย ดอยหลวง", "บุญมี ม่อนจอง"];

  const harvestLots = [];
  for (let i = 0; i < 20; i++) {
    const farm = farms[i % farms.length];
    const weight = randFloat(50, 500, 1);
    const status = i < 15 ? HarvestLotStatus.Complete : HarvestLotStatus.ReadyForProcessing;
    const harvestLot = await prisma.harvestLot.create({
      data: {
        farmerName: pick(farmerNames),
        cherryVariety: pick(cherryVarieties),
        weightKg: weight,
        remainingWeightKg: status === HarvestLotStatus.Complete ? 0 : weight,
        farmPlotLocation: farm.location,
        harvestDate: daysAgo(randInt(5, 180)),
        status,
        cropYearId: i < 12 ? currentCropYear.id : prevCropYear.id,
        farmId: farm.id,
        createdById: farmer.id,
      },
    });
    harvestLots.push(harvestLot);
    console.log(`  Created harvest lot: ${harvestLot.farmerName} - ${harvestLot.cherryVariety} (${harvestLot.weightKg}kg)`);
  }

  // ─── 3. Create Processing Batches ──────────────────────────
  console.log("\n--- Creating Processing Batches ---");

  const processTypes = ["Washed", "Natural", "Honey"];

  const processingBatches = [];
  for (let i = 0; i < 15; i++) {
    const hl = harvestLots[i % harvestLots.length];
    const processType = processTypes[i % 3];
    const isCompleted = i < 10;
    const isDrying = i >= 10 && i < 13;

    let status: ProcessingBatchStatus;
    if (isCompleted) status = ProcessingBatchStatus.Completed;
    else if (isDrying) status = ProcessingBatchStatus.Drying;
    else status = ProcessingBatchStatus.ToProcess;

    const dryingStart = daysAgo(randInt(10, 90));
    const dryingEnd = isCompleted ? new Date(dryingStart.getTime() + randInt(7, 21) * 86400000) : undefined;

    const batch = await prisma.processingBatch.create({
      data: {
        harvestLotId: hl.id,
        createdById: processor.id,
        status,
        processType,
        processNotes: `${processType} process - Batch ${i + 1}`,
        cropYearId: currentCropYear.id,
        parchmentWeightKg: isCompleted ? randFloat(hl.weightKg * 0.15, hl.weightKg * 0.25, 1) : null,
        moistureContent: isCompleted ? randFloat(10, 12.5, 1) : isDrying ? randFloat(15, 30, 1) : null,
        dryingStartDate: isDrying || isCompleted ? dryingStart : null,
        dryingEndDate: dryingEnd,
        baggingDate: isCompleted ? dryingEnd : null,
      },
    });
    processingBatches.push(batch);
    console.log(`  Created batch: ${processType} - ${status} (from ${hl.farmerName})`);
  }

  // ─── 4. Create Drying Log Entries ──────────────────────────
  console.log("\n--- Creating Drying Log Entries ---");

  let dryingLogCount = 0;
  for (const batch of processingBatches) {
    if (!batch.dryingStartDate) continue;
    const startDate = new Date(batch.dryingStartDate);
    const endDate = batch.dryingEndDate ? new Date(batch.dryingEndDate) : new Date();
    const days = Math.min(Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000), 25);

    for (let d = 0; d < days; d++) {
      const logDate = new Date(startDate.getTime() + d * 86400000);
      // Moisture goes down from ~45% to ~11% over drying period
      const moistureProgress = d / Math.max(days - 1, 1);
      const moisture = 45 - moistureProgress * 34 + randFloat(-1, 1, 1);

      await prisma.dryingLogEntry.create({
        data: {
          processingBatchId: batch.id,
          date: logDate,
          moistureContent: Math.max(moisture, 10),
          ambientTemp: randFloat(22, 35, 1),
          relativeHumidity: randFloat(40, 75, 1),
        },
      });
      dryingLogCount++;
    }
  }
  console.log(`  Created ${dryingLogCount} drying log entries`);

  // ─── 5. Create Parchment Lots ──────────────────────────────
  console.log("\n--- Creating Parchment Lots ---");

  const completedBatches = processingBatches.filter((b) => b.status === ProcessingBatchStatus.Completed);
  const parchmentLots = [];

  for (let i = 0; i < completedBatches.length; i++) {
    const batch = completedBatches[i];
    const hl = harvestLots.find((h) => h.id === batch.harvestLotId)!;
    const weight = batch.parchmentWeightKg || randFloat(30, 80, 1);
    const isHulled = i < 8;

    const parchmentLot = await prisma.parchmentLot.create({
      data: {
        processingBatchId: batch.id,
        harvestLotId: hl.id,
        initialWeightKg: weight,
        currentWeightKg: isHulled ? weight * 0.8 : weight,
        moistureContent: randFloat(10, 12, 1),
        processType: batch.processType,
        status: isHulled ? ParchmentLotStatus.Hulled : ParchmentLotStatus.AwaitingHulling,
      },
    });
    parchmentLots.push(parchmentLot);
    console.log(`  Created parchment lot: ${batch.processType} - ${parchmentLot.status} (${weight}kg)`);
  }

  // ─── 6. Create Physical Test Results ───────────────────────
  console.log("\n--- Creating Physical Test Results ---");

  const hulledParchments = parchmentLots.filter((p) => p.status === ParchmentLotStatus.Hulled);
  for (const pl of hulledParchments) {
    await prisma.physicalTestResults.create({
      data: {
        parchmentLotId: pl.id,
        sampleWeightGrams: 350,
        greenBeanWeightGrams: randFloat(280, 330, 1),
        greenBeanMoisture: randFloat(10, 12, 1),
        waterActivity: randFloat(0.45, 0.65, 3),
        density: randFloat(650, 750, 1),
        defectCount: randInt(0, 15),
        notes: pick([
          "คุณภาพดีมาก สม่ำเสมอ",
          "เมล็ดสมบูรณ์ มีข้อบกพร่องน้อย",
          "สีสม่ำเสมอ ขนาดเมล็ดดี",
          "พบเมล็ดบกพร่องเล็กน้อย",
          "คุณภาพเยี่ยม เหมาะสำหรับ specialty",
        ]),
      },
    });
  }
  console.log(`  Created ${hulledParchments.length} physical test results`);

  // ─── 7. Create Green Bean Lots ─────────────────────────────
  console.log("\n--- Creating Green Bean Lots ---");

  const grades = ["A", "B", "C", "AA", "Specialty"];
  const greenBeanLots = [];

  // Internal lots (from parchment)
  for (let i = 0; i < hulledParchments.length; i++) {
    const pl = hulledParchments[i];
    const weight = pl.currentWeightKg * randFloat(0.75, 0.85, 2);
    const grade = pick(grades);
    const isAvailable = i < 6;

    const gbl = await prisma.greenBeanLot.create({
      data: {
        sourceType: GreenBeanSourceType.Internal,
        parchmentLotId: pl.id,
        grade,
        initialWeightKg: weight,
        currentWeightKg: isAvailable ? weight : weight * randFloat(0.3, 0.8, 2),
        availabilityStatus: isAvailable ? GreenBeanAvailabilityStatus.Available : GreenBeanAvailabilityStatus.Withdrawn,
        pricePerKg: randFloat(200, 800, 0),
        currency: "THB",
        priceSetDate: daysAgo(randInt(1, 30)),
        priceSetBy: admin.id,
        createdById: processor.id,
        processorScore: randFloat(75, 95, 1),
      },
    });
    greenBeanLots.push(gbl);
    console.log(`  Created internal green bean lot: Grade ${grade} (${weight.toFixed(1)}kg) - ${gbl.availabilityStatus}`);
  }

  // External lots
  for (let i = 0; i < 5; i++) {
    const weight = randFloat(100, 500, 1);
    const grade = pick(grades);

    const gbl = await prisma.greenBeanLot.create({
      data: {
        sourceType: GreenBeanSourceType.External,
        grade,
        initialWeightKg: weight,
        currentWeightKg: weight,
        availabilityStatus: GreenBeanAvailabilityStatus.Available,
        externalSource: JSON.stringify({
          supplier: pick(["บ.กาแฟไทย จำกัด", "สหกรณ์กาแฟดอยช้าง", "หจก.เชียงรายคอฟฟี่", "บ.โกลเด้นบีน จำกัด"]),
          origin: pick(["เชียงราย", "เชียงใหม่", "น่าน", "แม่ฮ่องสอน"]),
          importDate: daysAgo(randInt(1, 60)).toISOString(),
        }),
        pricePerKg: randFloat(150, 600, 0),
        currency: "THB",
        priceSetDate: daysAgo(randInt(1, 15)),
        priceSetBy: admin.id,
        createdById: admin.id,
        processorScore: randFloat(70, 90, 1),
      },
    });
    greenBeanLots.push(gbl);
    console.log(`  Created external green bean lot: Grade ${grade} (${weight.toFixed(1)}kg)`);
  }

  // ─── 8. Create Green Bean Withdrawals ──────────────────────
  console.log("\n--- Creating Green Bean Withdrawals ---");

  const withdrawnLots = greenBeanLots.filter((g) => g.availabilityStatus === GreenBeanAvailabilityStatus.Withdrawn);
  let withdrawalCount = 0;
  for (const gbl of withdrawnLots) {
    const wType = pick([WithdrawalType.Sale, WithdrawalType.RoastingStock, WithdrawalType.Sample, WithdrawalType.Export]);
    await prisma.greenBeanWithdrawal.create({
      data: {
        greenBeanLotId: gbl.id,
        amountKg: gbl.initialWeightKg - gbl.currentWeightKg,
        withdrawalType: wType,
        purpose: pick([
          "ขายให้ลูกค้าร้านคั่ว",
          "ส่งตัวอย่างให้ลูกค้า",
          "นำไปคั่วเพื่อทดสอบ",
          "ส่งออกไปญี่ปุ่น",
          "เก็บไว้สำหรับ cupping",
        ]),
        notes: pick(["ลูกค้าประจำ", "ออเดอร์ด่วน", "ตัวอย่างทดสอบ", null]),
        date: daysAgo(randInt(1, 30)),
        withdrawnBy: admin.id,
        withdrawnByName: admin.name,
        salePrice: wType === WithdrawalType.Sale ? randFloat(300, 900, 0) : null,
        currency: wType === WithdrawalType.Sale ? "THB" : null,
        customerName: wType === WithdrawalType.Sale ? pick(["ร้าน Akha Ama", "Pacamara Coffee", "Ristr8to", "Graph Coffee"]) : null,
      },
    });
    withdrawalCount++;
  }
  console.log(`  Created ${withdrawalCount} withdrawals`);

  // ─── 9. Create GAP Log Entries ─────────────────────────────
  console.log("\n--- Creating GAP Log Entries ---");

  let gapCount = 0;
  for (const farm of farms) {
    for (let j = 0; j < randInt(3, 8); j++) {
      const at = pick(activityTypes);
      await prisma.gAPLogEntry.create({
        data: {
          farmId: farm.id,
          farmPlotLocation: farm.location,
          activityTypeId: at.id,
          activityTypeName: at.name,
          date: daysAgo(randInt(1, 120)),
          productUsed: pick([
            "ปุ๋ยอินทรีย์ 15-15-15",
            "ปุ๋ยคอก",
            "สารกำจัดศัตรูพืชชีวภาพ",
            "ปุ๋ยหมักจากเปลือกกาแฟ",
            "น้ำหมักชีวภาพ",
            "ปุ๋ยเคมี NPK",
            "สารกำจัดวัชพืช",
          ]),
          quantity: pick(["50 kg", "100 kg", "200 ลิตร", "30 kg", "5 ลิตร", "80 kg"]),
          notes: pick([
            "ใส่ปุ๋ยรอบต้น",
            "ฉีดพ่นทั่วแปลง",
            "ให้น้ำตามระบบน้ำหยด",
            "ตัดกิ่งแห้งและกิ่งที่เป็นโรค",
            "เก็บเชอร์รี่สุกแดง",
            null,
          ]),
          createdBy: farmer.id,
        },
      });
      gapCount++;
    }
  }
  console.log(`  Created ${gapCount} GAP log entries`);

  // ─── 10. Create Weather Records ────────────────────────────
  console.log("\n--- Creating Weather Records ---");

  let weatherCount = 0;
  for (const farm of farms.slice(0, 3)) {
    for (let d = 0; d < 30; d++) {
      const tempMin = randFloat(12, 22, 1);
      const tempMax = randFloat(26, 36, 1);
      await prisma.weatherRecord.create({
        data: {
          farmId: farm.id,
          farmPlotLocation: farm.location,
          recordDate: daysAgo(d),
          temperatureMin: tempMin,
          temperatureMax: tempMax,
          temperatureAvg: parseFloat(((tempMin + tempMax) / 2).toFixed(1)),
          rainfall: d % 3 === 0 ? randFloat(0, 35, 1) : 0,
          humidity: randFloat(50, 85, 1),
          source: WeatherSource.Manual,
          notes: d % 7 === 0 ? "สภาพอากาศปกติ" : null,
          recordedBy: farmer.id,
        },
      });
      weatherCount++;
    }
  }
  console.log(`  Created ${weatherCount} weather records`);

  // ─── 11. Create Soil Analyses ──────────────────────────────
  console.log("\n--- Creating Soil Analyses ---");

  for (const farm of farms) {
    await prisma.soilAnalysis.create({
      data: {
        farmId: farm.id,
        farmPlotLocation: farm.location,
        testDate: daysAgo(randInt(30, 180)),
        labName: pick(["Chiang Mai Agricultural Lab", "MFU Soil Lab", "ห้องปฏิบัติการกรมพัฒนาที่ดิน"]),
        certificateNumber: `SOIL-${Date.now()}-${randInt(100, 999)}`,
        pH: randFloat(5.5, 6.8, 1),
        nitrogen: randFloat(0.8, 2.0, 2),
        phosphorus: randFloat(15, 40, 1),
        potassium: randFloat(80, 200, 0),
        calcium: randFloat(500, 1200, 0),
        magnesium: randFloat(80, 250, 0),
        organicMatter: randFloat(2.0, 5.0, 1),
        sulfur: randFloat(8, 25, 1),
        iron: randFloat(20, 60, 1),
        manganese: randFloat(10, 40, 1),
        zinc: randFloat(3, 15, 1),
        copper: randFloat(1, 5, 1),
        boron: randFloat(0.5, 2.0, 1),
        recommendations: pick([
          "ดินมีคุณภาพดี เหมาะแก่การปลูกกาแฟ",
          "แนะนำเพิ่มปุ๋ยอินทรีย์เพื่อปรับปรุงโครงสร้างดิน",
          "ควรเพิ่ม pH ด้วยปูนโดโลไมท์",
          "ดินดี แต่ควรเพิ่มโพแทสเซียม",
        ]),
        createdBy: admin.id,
        createdByRole: UserRole.Admin,
      },
    });
  }
  console.log(`  Created ${farms.length} soil analyses`);

  // ─── 12. Create Customers ──────────────────────────────────
  console.log("\n--- Creating Customers ---");

  const customersData = [
    { name: "Akha Ama Coffee", type: CustomerType.Roaster, contactEmail: "order@akhaama.com", contactPhone: "053-214-567", address: "เชียงใหม่" },
    { name: "Pacamara Coffee", type: CustomerType.Roaster, contactEmail: "buy@pacamara.co.th", contactPhone: "02-345-6789", address: "กรุงเทพ" },
    { name: "Graph Coffee", type: CustomerType.Retailer, contactEmail: "info@graphcoffee.com", contactPhone: "053-289-456", address: "เชียงใหม่" },
    { name: "หจก.กาแฟไทยพรีเมียม", type: CustomerType.Distributor, contactEmail: "sales@thaicoffee.co.th", contactPhone: "02-111-2222", address: "กรุงเทพ" },
    { name: "Roast8ry Lab", type: CustomerType.Roaster, contactEmail: "hello@roast8ry.com", contactPhone: "089-123-4567", address: "เชียงใหม่" },
    { name: "Sakura Coffee Japan", type: CustomerType.Distributor, contactEmail: "import@sakuracoffee.jp", contactPhone: "+81-3-1234-5678", address: "Tokyo, Japan" },
    { name: "ร้านกาแฟบ้านไร่", type: CustomerType.Retailer, contactEmail: "banrai@gmail.com", contactPhone: "081-234-5678", address: "เชียงราย" },
    { name: "บ.คอฟฟี่เวิลด์ จำกัด", type: CustomerType.Distributor, contactEmail: "purchase@coffeeworld.co.th", contactPhone: "02-999-8888", address: "กรุงเทพ" },
  ];

  const customers = [];
  for (const cd of customersData) {
    const customer = await prisma.customer.create({ data: cd });
    customers.push(customer);
    console.log(`  Created customer: ${customer.name} (${customer.type})`);
  }

  // ─── 13. Create Sale Orders ────────────────────────────────
  console.log("\n--- Creating Sale Orders ---");

  const availableLots = greenBeanLots.filter((g) => g.availabilityStatus === GreenBeanAvailabilityStatus.Available);
  const saleOrders = [];

  const orderStatuses = [SaleOrderStatus.Draft, SaleOrderStatus.Confirmed, SaleOrderStatus.Delivered, SaleOrderStatus.Confirmed, SaleOrderStatus.Delivered];

  for (let i = 0; i < 10; i++) {
    const customer = customers[i % customers.length];
    const lot = availableLots[i % availableLots.length];
    const qty = randFloat(5, 50, 1);
    const price = lot.pricePerKg || randFloat(300, 700, 0);
    const subtotal = parseFloat((qty * price).toFixed(2));
    const status = orderStatuses[i % orderStatuses.length];

    const order = await prisma.saleOrder.create({
      data: {
        orderNumber: `SO-2025-${String(i + 1).padStart(4, "0")}`,
        customerId: customer.id,
        customerName: customer.name,
        orderDate: daysAgo(randInt(1, 90)),
        status,
        totalAmount: subtotal,
        currency: "THB",
        notes: i % 3 === 0 ? "ลูกค้าประจำ ส่งด่วน" : null,
        createdBy: admin.id,
        items: {
          create: [
            {
              greenBeanLotId: lot.id,
              lotGrade: lot.grade,
              quantity: qty,
              pricePerKg: price,
              subtotal,
            },
          ],
        },
      },
    });
    saleOrders.push(order);
    console.log(`  Created sale order: ${order.orderNumber} - ${customer.name} (${status})`);
  }

  // ─── 14. Create Invoices ───────────────────────────────────
  console.log("\n--- Creating Invoices ---");

  const confirmedOrders = saleOrders.filter((_, i) => orderStatuses[i % orderStatuses.length] !== SaleOrderStatus.Draft);
  for (let i = 0; i < confirmedOrders.length; i++) {
    const order = confirmedOrders[i];
    const invoiceStatus = pick([InvoiceStatus.Sent, InvoiceStatus.Paid, InvoiceStatus.Paid, InvoiceStatus.Overdue]);
    const tax = parseFloat((order.totalAmount * 0.07).toFixed(2));

    // Get the order items for this invoice
    const orderItems = await prisma.saleOrderItem.findMany({ where: { saleOrderId: order.id } });

    await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-2025-${String(i + 1).padStart(4, "0")}`,
        saleOrderId: order.id,
        issueDate: daysAgo(randInt(1, 60)),
        dueDate: daysAgo(randInt(-30, 30)),
        status: invoiceStatus,
        subtotal: order.totalAmount,
        tax,
        totalAmount: parseFloat((order.totalAmount + tax).toFixed(2)),
        currency: "THB",
        notes: invoiceStatus === InvoiceStatus.Overdue ? "เกินกำหนดชำระ กรุณาติดต่อลูกค้า" : null,
        createdBy: admin.id,
        items: {
          create: orderItems.map((oi) => ({
            greenBeanLotId: oi.greenBeanLotId,
            lotGrade: oi.lotGrade,
            quantity: oi.quantity,
            pricePerKg: oi.pricePerKg,
            subtotal: oi.subtotal,
          })),
        },
      },
    });
    console.log(`  Created invoice: INV-2025-${String(i + 1).padStart(4, "0")} (${invoiceStatus})`);
  }

  // ─── 15. Create Pricing History ────────────────────────────
  console.log("\n--- Creating Pricing History ---");

  let pricingCount = 0;
  for (const gbl of greenBeanLots.slice(0, 8)) {
    for (let p = 0; p < randInt(2, 5); p++) {
      await prisma.pricingHistory.create({
        data: {
          greenBeanLotId: gbl.id,
          pricePerKg: randFloat(200, 800, 0),
          currency: "THB",
          effectiveDate: daysAgo(randInt(p * 15, (p + 1) * 30)),
          setBy: admin.id,
          notes: p === 0 ? "ราคาเริ่มต้น" : pick(["ปรับราคาตามตลาด", "ราคาพิเศษลูกค้าประจำ", "ปรับลดราคาเคลียร์สต็อก", null]),
        },
      });
      pricingCount++;
    }
  }
  console.log(`  Created ${pricingCount} pricing history entries`);

  // ─── 16. Create Roaster Inventory & Roast Batches ──────────
  console.log("\n--- Creating Roaster Inventory & Roast Batches ---");

  const roasterLots = availableLots.slice(0, 4);
  for (const gbl of roasterLots) {
    const claimedWeight = randFloat(10, 50, 1);
    const inv = await prisma.roasterInventoryItem.create({
      data: {
        roasterId: roaster.id,
        greenBeanLotId: gbl.id,
        claimedWeightKg: claimedWeight,
        remainingWeightKg: claimedWeight * randFloat(0.3, 0.8, 2),
      },
    });

    // Create 2-4 roast batches per inventory item
    for (let r = 0; r < randInt(2, 4); r++) {
      const batchSize = randFloat(2, 10, 1);
      const yieldPct = randFloat(82, 88, 1);
      const roastedWeight = parseFloat((batchSize * yieldPct / 100).toFixed(2));
      await prisma.roastBatch.create({
        data: {
          roasterId: roaster.id,
          roasterInventoryId: inv.id,
          greenBeanLotId: gbl.id,
          roastDate: daysAgo(randInt(1, 30)),
          batchSizeKg: batchSize,
          yieldPercentage: yieldPct,
          roastedWeightKg: roastedWeight,
          weightLossPct: parseFloat((100 - yieldPct).toFixed(1)),
          roastLevel: pick([RoastLevel.Light, RoastLevel.Medium, RoastLevel.Dark]),
          roastProfileNotes: pick([
            "Charge temp 200°C, first crack at 195°C, drop at 210°C",
            "Low and slow profile, extended development time",
            "Fast ramp, early first crack, light development",
            "Standard medium profile, balanced sweetness",
          ]),
          flavorNotes: pick([
            "Chocolate, Caramel, Nutty",
            "Citrus, Floral, Tea-like",
            "Berry, Wine, Dark chocolate",
            "Honey, Brown sugar, Vanilla",
            "Stone fruit, Jasmine, Clean finish",
          ]),
        },
      });
    }
    console.log(`  Created roaster inventory + roast batches for lot Grade ${gbl.grade}`);
  }

  // ─── 17. Create Cupping Sessions ───────────────────────────
  console.log("\n--- Creating Cupping Sessions ---");

  const sessionNames = [
    "QC ตรวจสอบล็อตใหม่ ม.ค. 2025",
    "QC ทดสอบ Washed Process",
    "QC ตรวจคุณภาพ Natural Process",
    "Competition รอบคัดเลือก",
    "Competition Thailand Coffee Award 2025",
    "QC ทดสอบ Honey Process ล็อตพิเศษ",
  ];

  const sessionStatuses = [
    CuppingSessionStatus.Finalized,
    CuppingSessionStatus.Finalized,
    CuppingSessionStatus.Scoring,
    CuppingSessionStatus.Adjudication,
    CuppingSessionStatus.Finalized,
    CuppingSessionStatus.Setup,
  ];

  for (let s = 0; s < sessionNames.length; s++) {
    const isQC = s < 3 || s === 5;
    const sessionType = isQC ? CuppingSessionType.QC : CuppingSessionType.Competition;
    const status = sessionStatuses[s];
    const sampleCount = randInt(3, 6);

    // Create session
    const session = await prisma.cuppingSession.create({
      data: {
        name: sessionNames[s],
        date: daysAgo(randInt(1, 90)),
        type: sessionType,
        status,
        createdBy: headJudge.id,
      },
    });

    // Create samples
    const samples = [];
    for (let i = 0; i < sampleCount; i++) {
      const linkedLot = greenBeanLots[i % greenBeanLots.length];
      const sample = await prisma.cuppingSample.create({
        data: {
          cuppingSessionId: session.id,
          blindCode: `${String.fromCharCode(65 + i)}${randInt(100, 999)}`,
          greenBeanLotId: linkedLot.id,
          submitterInfo: JSON.stringify({
            name: pick(farmerNames),
            organization: pick(["สหกรณ์กาแฟดอยช้าง", "กลุ่มวิสาหกิจชุมชน", "ไร่กาแฟอินทรีย์"]),
          }),
          originInfo: JSON.stringify({
            region: pick(["เชียงราย", "เชียงใหม่", "น่าน", "แม่ฮ่องสอน"]),
            altitude: pick(["1200m", "1400m", "1000m", "1600m"]),
            variety: pick(cherryVarieties),
            process: pick(processTypes),
          }),
          lotInfo: JSON.stringify({
            grade: linkedLot.grade,
            weight: `${linkedLot.currentWeightKg}kg`,
            harvestDate: daysAgo(randInt(30, 120)).toISOString(),
          }),
        },
      });
      samples.push(sample);
    }

    // Create judges
    const judgeUsers = [headJudge, ...cuppers];
    for (const ju of judgeUsers) {
      await prisma.cuppingSessionJudge.create({
        data: {
          cuppingSessionId: session.id,
          judgeId: ju.id,
          judgeName: ju.name,
          judgeRole: ju.roles[0],
        },
      });
    }

    // Create scores (only for sessions past Setup)
    if (status !== CuppingSessionStatus.Setup) {
      for (const sample of samples) {
        for (const ju of judgeUsers) {
          const fragrance = randFloat(6, 10, 1);
          const flavor = randFloat(6, 10, 1);
          const aftertaste = randFloat(6, 10, 1);
          const acidity = randFloat(6, 10, 1);
          const body = randFloat(6, 10, 1);
          const uniformity = randFloat(6, 10, 1);
          const cleanCup = randFloat(6, 10, 1);
          const sweetness = randFloat(6, 10, 1);
          const overall = randFloat(6, 10, 1);
          const balance = randFloat(6, 10, 1);
          const total = parseFloat(
            (fragrance + flavor + aftertaste + acidity + body + uniformity + cleanCup + sweetness + overall + balance).toFixed(2)
          );

          await prisma.judgeScore.create({
            data: {
              cuppingSessionId: session.id,
              sampleId: sample.id,
              judgeId: ju.id,
              judgeName: ju.name,
              scores: JSON.stringify({
                fragrance,
                flavor,
                aftertaste,
                acidity,
                body,
                uniformity,
                cleanCup,
                sweetness,
                overall,
                balance,
              }),
              notes: pick([
                "กลิ่นดอกมะลิ รสช็อกโกแลต",
                "ผลไม้สด รสหวานอมเปรี้ยว",
                "กลิ่นคาราเมล Body หนัก",
                "Clean cup ดีมาก ซับซ้อน",
                "หอมเบอร์รี่ Aftertaste ยาว",
                "กลิ่นถั่ว ช็อกโกแลตนม หวานสะอาด",
              ]),
              totalScore: total,
            },
          });
        }
      }

      // Create cupping scores for green bean lots
      for (const sample of samples) {
        if (sample.greenBeanLotId) {
          const existingScore = await prisma.cuppingScore.findUnique({
            where: {
              greenBeanLotId_sessionId: {
                greenBeanLotId: sample.greenBeanLotId,
                sessionId: session.id,
              },
            },
          });
          if (!existingScore) {
            await prisma.cuppingScore.create({
              data: {
                greenBeanLotId: sample.greenBeanLotId,
                sessionId: session.id,
                score: randFloat(75, 92, 2),
              },
            });
          }
        }
      }
    }

    console.log(`  Created cupping session: ${session.name} (${status}) - ${sampleCount} samples, ${judgeUsers.length} judges`);
  }

  // ─── Summary ───────────────────────────────────────────────
  console.log("\n=== Mock Data Generation Complete ===");
  console.log(`  Farms: ${farms.length}`);
  console.log(`  Harvest Lots: ${harvestLots.length}`);
  console.log(`  Processing Batches: ${processingBatches.length}`);
  console.log(`  Drying Log Entries: ${dryingLogCount}`);
  console.log(`  Parchment Lots: ${parchmentLots.length}`);
  console.log(`  Physical Tests: ${hulledParchments.length}`);
  console.log(`  Green Bean Lots: ${greenBeanLots.length}`);
  console.log(`  Customers: ${customers.length}`);
  console.log(`  Sale Orders: ${saleOrders.length}`);
  console.log(`  Cupping Sessions: ${sessionNames.length}`);
}

main()
  .catch((e) => {
    console.error("Mock data error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
