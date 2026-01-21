import { PrismaClient, UserRole } from '@prisma/client'
import { hashPassword } from '../src/lib/auth'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')
  
  // Check if we're in development environment
  const isDevelopment = process.env.NODE_ENV !== 'production' && !process.env.VERCEL && !process.env.RAILWAY_ENVIRONMENT

  // Create default admin user
  const adminPassword = await hashPassword('admin123')
  const admin = await prisma.user.upsert({
    where: { email: '6631503046@lamduan.mfu.ac.th' },
    update: {
      password: adminPassword, // Update password if user exists
      username: 'admin',
      name: 'Admin User',
      roles: [UserRole.Admin],
      isActive: true,
      isSuperAdmin: true,
      mustChangePassword: false,
    },
    create: {
      email: '6631503046@lamduan.mfu.ac.th',
      username: 'admin',
      password: adminPassword,
      name: 'Admin User',
      roles: [UserRole.Admin],
      isActive: true,
      isSuperAdmin: true,
      mustChangePassword: false,
    },
  })
  console.log('✅ Created/Updated admin user:', admin.email)

  // Create second admin user for ownership transfer
  const secondAdminPassword = await hashPassword('admin123')
  const secondAdmin = await prisma.user.upsert({
    where: { email: 'admin2@coffee.com' },
    update: {
      password: secondAdminPassword, // Update password if user exists
      username: 'admin2',
      name: 'Second Admin',
      roles: [UserRole.Admin],
      isActive: true,
      isSuperAdmin: false,
      mustChangePassword: false,
    },
    create: {
      email: 'admin2@coffee.com',
      username: 'admin2',
      password: secondAdminPassword,
      name: 'Second Admin',
      roles: [UserRole.Admin],
      isActive: true,
      isSuperAdmin: false,
      mustChangePassword: false,
    },
  })
  console.log('✅ Created/Updated second admin user:', secondAdmin.email)

  // Create default users from mock data
  const users = [
    // Test users - ONLY created in development environment
    ...(isDevelopment ? [
      {
        email: 'test@example.com',
        username: 'testuser',
        password: await hashPassword('test123456'),
        name: 'Test User (Admin)',
        roles: [UserRole.Farmer, UserRole.Admin],
        isActive: true,
        mustChangePassword: false, // Allow immediate testing
      },
      {
        email: 'farmer-test@example.com',
        username: 'farmer-test',
        password: await hashPassword('test123456'),
        name: 'Test Farmer',
        roles: [UserRole.Farmer], // Only Farmer role for access control testing
        isActive: true,
        mustChangePassword: false, // Allow immediate testing
      }
    ] : []),
    {
      email: 'farmer@coffee.com',
      username: 'farmer1',
      password: await hashPassword('farmer123'),
      name: 'Maria Rodriguez',
      roles: [UserRole.Farmer],
    },
    {
      email: 'processor@coffee.com',
      username: 'processor1',
      password: await hashPassword('processor123'),
      name: 'Alarak',
      roles: [UserRole.Processor],
    },
    {
      email: 'roaster@coffee.com',
      username: 'roaster1',
      password: await hashPassword('roaster123'),
      name: 'Jim Raynor',
      roles: [UserRole.Roaster],
    },
    {
      email: 'headjudge@coffee.com',
      username: 'headjudge',
      password: await hashPassword('headjudge123'),
      name: 'Artanis',
      roles: [UserRole.HeadJudge],
    },
    {
      email: 'cupper@coffee.com',
      username: 'cupper1',
      password: await hashPassword('cupper123'),
      name: 'Tassadar',
      roles: [UserRole.Cupper],
    },
  ]

  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        password: userData.password, // Update password if user exists
        username: userData.username,
        name: userData.name,
        roles: userData.roles,
        isActive: userData.isActive !== undefined ? userData.isActive : true,
        mustChangePassword: userData.mustChangePassword !== undefined ? userData.mustChangePassword : false,
      },
      create: {
        ...userData,
        // Preserve isActive and mustChangePassword if already set in userData
        isActive: userData.isActive !== undefined ? userData.isActive : true,
        mustChangePassword: userData.mustChangePassword !== undefined ? userData.mustChangePassword : false,
      },
    })
    console.log('✅ Created/Updated user:', user.email)
  }
  
  if (isDevelopment) {
    console.log('⚠️  Test user (test@example.com) created for development/testing only')
  }

  // Create sample farms for testing (only in development)
  if (isDevelopment) {
    // Get test users
    const testUser = await prisma.user.findUnique({
      where: { email: 'test@example.com' }
    })
    const farmerUser = await prisma.user.findUnique({
      where: { email: 'farmer@coffee.com' }
    })

    if (testUser) {
      // Check if farm already exists for test user
      const existingTestFarm = await prisma.farm.findFirst({
        where: {
          ownerId: testUser.id,
          farmName: 'Test Coffee Farm'
        }
      })

      if (!existingTestFarm) {
        const testFarm = await prisma.farm.create({
          data: {
            farmName: 'Test Coffee Farm',
            location: 'Chiang Mai, Thailand',
            latitude: 18.7883,
            longitude: 98.9853,
            altitude: '1200m',
            ownerId: testUser.id,
            caretakerName: 'John Doe',
            sizeHectares: 5.5,
            varieties: ['Gesha', 'Caturra', 'Typica'],
            archived: false,
          },
        })
        console.log('✅ Created test farm:', testFarm.farmName)
      } else {
        console.log('ℹ️  Test farm already exists:', existingTestFarm.farmName)
      }
    }

    if (farmerUser) {
      // Check if farm already exists for farmer user
      const existingFarmerFarm = await prisma.farm.findFirst({
        where: {
          ownerId: farmerUser.id,
          farmName: 'Maria\'s Coffee Estate'
        }
      })

      if (!existingFarmerFarm) {
        const farmerFarm = await prisma.farm.create({
          data: {
            farmName: 'Maria\'s Coffee Estate',
            location: 'Doi Inthanon, Chiang Mai, Thailand',
            latitude: 18.5883,
            longitude: 98.4869,
            altitude: '1500m',
            ownerId: farmerUser.id,
            caretakerName: 'Maria Rodriguez',
            sizeHectares: 12.0,
            varieties: ['Bourbon', 'SL28', 'SL34'],
            archived: false,
          },
        })
        console.log('✅ Created farmer farm:', farmerFarm.farmName)
      } else {
        console.log('ℹ️  Farmer farm already exists:', existingFarmerFarm.farmName)
      }
    }
  }

  // Create default activity types
  const activityTypes = [
    { name: 'Fertilizer', description: 'Fertilizer application' },
    { name: 'Pest Management', description: 'Pest control activities' },
    { name: 'Water Management', description: 'Irrigation and water management' },
    { name: 'Pruning', description: 'Tree pruning activities' },
    { name: 'Harvesting', description: 'Coffee cherry harvesting' },
  ]

  for (const at of activityTypes) {
    const activityType = await prisma.activityType.upsert({
      where: { name: at.name },
      update: {},
      create: {
        ...at,
        isActive: true,
      },
    })
    console.log('✅ Created activity type:', activityType.name)
  }

  // Create default process types
  const processTypes = [
    {
      name: 'Washed',
      description: 'Washed process',
      colorScheme: {
        borderColor: 'border-l-blue-500',
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
        badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
      },
    },
    {
      name: 'Natural',
      description: 'Natural/dry process',
      colorScheme: {
        borderColor: 'border-l-yellow-500',
        iconBg: 'bg-yellow-100',
        iconColor: 'text-yellow-600',
        badgeColor: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      },
    },
    {
      name: 'Honey',
      description: 'Honey process',
      colorScheme: {
        borderColor: 'border-l-amber-500',
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600',
        badgeColor: 'bg-amber-100 text-amber-700 border-amber-200',
      },
    },
  ]

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
    })
    console.log('✅ Created process type:', processType.name)
  }

  // Create crop years automatically based on current date
  // Coffee crop year typically runs from October to September
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1-12
  
  // Determine the active crop year based on current date
  // If month >= 10 (October), we're in the new crop year
  // If month < 10, we're still in the previous crop year
  let activeCropYearStart: number
  if (currentMonth >= 10) {
    activeCropYearStart = currentYear
  } else {
    activeCropYearStart = currentYear - 1
  }
  
  // Create crop years: previous 2 years, current year, and next 2 years
  const cropYearsToCreate = []
  for (let i = -2; i <= 2; i++) {
    const yearStart = activeCropYearStart + i
    const yearEnd = yearStart + 1
    const yearString = `${yearStart}/${yearEnd}`
    
    cropYearsToCreate.push({
      year: yearString,
      startDate: new Date(`${yearStart}-10-01`),
      endDate: new Date(`${yearEnd}-09-30`),
      description: i === 0 
        ? `Current crop year ${yearString}` 
        : i < 0 
          ? `Previous crop year ${yearString}`
          : `Next crop year ${yearString}`,
    })
  }

  for (const cy of cropYearsToCreate) {
    const cropYear = await prisma.cropYear.upsert({
      where: { year: cy.year },
      update: {
        // Update dates in case they changed (shouldn't happen, but just in case)
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
    })
    console.log('✅ Created/Updated crop year:', cropYear.year, `(${cy.description})`)
  }

  console.log('🎉 Seed completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

