import { AppData, UserRole, ProcessingBatchStatus, CuppingSessionType, SCA_ATTRIBUTES, Farm, ActivityType, ProcessType, GreenBeanSourceType, RoastLevel } from './types';

export const MOCK_DATA: AppData = {
    users: [
      { id: 'user-headjudge', name: 'Artanis', roles: [UserRole.HeadJudge], isActive: true },
      { id: 'user-cupper1', name: 'Tassadar', roles: [UserRole.Cupper], isActive: true },
      { id: 'user-cupper2', name: 'Zeratul', roles: [UserRole.Cupper], isActive: true },
      { id: 'user-cupper3', name: 'Fenix', roles: [UserRole.Cupper], isActive: true },
      { id: 'user-roaster1', name: 'Jim Raynor', roles: [UserRole.Roaster], isActive: true },
      { id: 'user-processor1', name: 'Alarak', roles: [UserRole.Processor], isActive: true },
      { id: 'user-farmer1', name: 'Maria Rodriguez', roles: [UserRole.Farmer], isActive: true },
    ],
    farms: [
      {
        id: 'F001',
        name: 'Finca La Esmeralda',
        farmerName: 'Maria Rodriguez',
        ownerName: 'Maria Rodriguez',
        caretakerName: 'Carlos Gomez',
        location: 'Plot A, Boquete, Panama',
        latitude: 8.8137,
        longitude: -82.5853,
        createdAt: '2025-10-01T08:30:00.000Z',
        updatedAt: '2025-10-08T10:15:00.000Z',
        archived: false,
        ownerUserId: 'user-farmer1',
        varieties: ['Gesha', 'Typica', 'Caturra'],
      }, // Boquete, Panama
      {
        id: 'F002',
        name: 'Hacienda Elida',
        farmerName: 'John Doe',
        ownerName: 'John Doe',
        caretakerName: 'Nattapong Sriwattana',
        location: 'Plot C4, Chiang Mai, Thailand',
        latitude: 18.9712,
        longitude: 98.9867,
        createdAt: '2025-09-20T06:00:00.000Z',
        updatedAt: '2025-10-05T09:45:00.000Z',
        archived: false,
        varieties: ['Caturra', 'Catuai'],
      }, // Chiang Mai, Thailand
      {
        id: 'F003',
        name: 'Doi Tung Coffee Garden',
        farmerName: 'Somchai Jaidee',
        ownerName: 'Somchai Jaidee',
        caretakerName: 'Nok Phimchan',
        location: 'Mae Fah Luang, Chiang Rai',
        latitude: 19.9105,
        longitude: 99.8406,
        createdAt: '2025-09-10T03:45:00.000Z',
        updatedAt: '2025-10-02T14:20:00.000Z',
        archived: false,
        varieties: ['Typica', 'Bourbon'],
      }, // Doi Tung, Chiang Rai, Thailand
    ],
  harvestLots: [
    { id: 'HL001', farmerName: 'Maria Rodriguez', cherryVariety: 'Gesha', weightKg: 150, farmPlotLocation: 'Finca La Esmeralda, Plot A', harvestDate: '2025-08-15', status: 'Processing' },
    { id: 'HL002', farmerName: 'John Doe', cherryVariety: 'Caturra', weightKg: 300, farmPlotLocation: 'Hacienda Elida, Plot C4', harvestDate: '2025-08-16', status: 'Ready for Processing' },
  ],
  processingBatches: [
    { 
      id: 'PB001', 
      harvestLotId: 'HL001', 
      status: ProcessingBatchStatus.Drying, 
      processType: 'Washed', 
      dryingStartDate: '2025-08-16',
      dryingLog: [
        { date: '2025-08-16', moistureContent: 55.0, ambientTemp: 28, relativeHumidity: 75 },
        { date: '2025-08-17', moistureContent: 48.5, ambientTemp: 29, relativeHumidity: 72 },
        { date: '2025-08-18', moistureContent: 41.2, ambientTemp: 30, relativeHumidity: 68 },
        { date: '2025-08-19', moistureContent: 35.8, ambientTemp: 29, relativeHumidity: 70 },
      ]
    },
    { id: 'PB002', harvestLotId: 'HL002', status: ProcessingBatchStatus.ToProcess, processType: 'Natural' },
    { 
      id: 'PB003', 
      harvestLotId: 'HL001', 
      status: ProcessingBatchStatus.Completed, 
      processType: 'Honey', 
      parchmentWeightKg: 55, 
      moistureContent: 11.5, 
      baggingDate: '2025-08-25', 
      dryingStartDate: '2025-08-17', 
      dryingEndDate: '2025-08-25',
      dryingLog: [
        { date: '2025-08-17', moistureContent: 58.0, ambientTemp: 27, relativeHumidity: 78 },
        { date: '2025-08-18', moistureContent: 50.1, ambientTemp: 28, relativeHumidity: 75 },
        { date: '2025-08-19', moistureContent: 42.5, ambientTemp: 29, relativeHumidity: 71 },
        { date: '2025-08-20', moistureContent: 35.2, ambientTemp: 30, relativeHumidity: 65 },
        { date: '2025-08-21', moistureContent: 28.9, ambientTemp: 31, relativeHumidity: 62 },
        { date: '2025-08-22', moistureContent: 22.4, ambientTemp: 30, relativeHumidity: 64 },
        { date: '2025-08-23', moistureContent: 17.6, ambientTemp: 29, relativeHumidity: 68 },
        { date: '2025-08-24', moistureContent: 13.8, ambientTemp: 28, relativeHumidity: 70 },
        { date: '2025-08-25', moistureContent: 11.5, ambientTemp: 28, relativeHumidity: 72 },
      ]
    },
  ],
  parchmentLots: [
    { id: 'PL001', processingBatchId: 'PB003', harvestLotId: 'HL001', initialWeightKg: 55, currentWeightKg: 55, moistureContent: 11.5, processType: 'Honey', status: 'Hulled'},
    { 
      id: 'PL002', processingBatchId: 'PB001', harvestLotId: 'HL001', initialWeightKg: 60, currentWeightKg: 59.7, moistureContent: 11.2, processType: 'Washed', status: 'Awaiting Hulling',
      physicalTestResults: {
        sampleWeightGrams: 300,
        greenBeanWeightGrams: 255,
        greenBeanMoisture: 10.8,
        waterActivity: 0.58,
        density: 0.71,
        defectCount: 2,
        notes: 'Clean, no visible issues.'
      }
    }
  ],
  greenBeanLots: [
      { id: 'GBL001', sourceType: GreenBeanSourceType.Internal, parchmentLotId: 'PL001', grade: 'Grade A', initialWeightKg: 45, currentWeightKg: 32.5, availabilityStatus: 'Available', cuppingScores: [{sessionId: 'CS001', score: 88.5}],
        withdrawalHistory: [
          { amountKg: 2.5, withdrawalType: 'Sample' as const, purpose: 'Quality testing sample', date: '2025-09-01', withdrawnBy: 'user-processor1', withdrawnByName: 'Alarak', notes: 'Sent for cupping evaluation' },
          { amountKg: 10.0, withdrawalType: 'Sale' as const, purpose: 'Sale to premium roaster', date: '2025-09-15', withdrawnBy: 'user-processor1', withdrawnByName: 'Alarak', salePrice: 450, currency: 'THB', customerName: 'Golden Bean Roasters' }
        ]
      },
      { id: 'GBL002', sourceType: GreenBeanSourceType.Internal, parchmentLotId: 'PL002', grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 50, availabilityStatus: 'Available', cuppingScores: [{sessionId: 'CS001', score: 86.75}],
      }
      ,
      // External purchases examples
      { id: 'GBL003', sourceType: GreenBeanSourceType.External, grade: 'Grade A', initialWeightKg: 60, currentWeightKg: 60, availabilityStatus: 'Available', cuppingScores: [],
        externalSource: { originName: 'Ethiopia Guji Cooperative', variety: 'Heirloom', processType: 'Natural', purchaseDate: '2025-09-20', pricePerKg: 380, currency: 'THB', supplierNotes: 'Winey, berry notes' } },
      { id: 'GBL004', sourceType: GreenBeanSourceType.External, grade: 'Grade B', initialWeightKg: 40, currentWeightKg: 40, availabilityStatus: 'Available', cuppingScores: [],
        externalSource: { originName: 'Colombia Huila Producer', variety: 'Caturra', processType: 'Washed', purchaseDate: '2025-10-05', pricePerKg: 320, currency: 'THB' } }
  ],
  cuppingSessions: [
    {
      id: 'CS001',
      name: 'National Coffee Championship 2025',
      date: '2025-09-10',
      type: CuppingSessionType.Competition,
      status: 'Adjudication',
      judges: [
        { id: 'user-headjudge', name: 'Artanis', role: UserRole.HeadJudge },
        { id: 'user-cupper1', name: 'Tassadar', role: UserRole.Cupper },
        { id: 'user-cupper2', name: 'Zeratul', role: UserRole.Cupper },
      ],
      samples: [
        { id: 'S01', blindCode: '650', greenBeanLotId: 'GBL001', submitterInfo: { name: 'Maria Rodriguez' }, originInfo: { farm: 'Finca La Esmeralda' }, lotInfo: { process: 'Honey' } },
        { id: 'S02', blindCode: '503', greenBeanLotId: 'EXT01', submitterInfo: { name: 'External Producer' }, originInfo: { farm: 'Some Other Farm' }, lotInfo: { process: 'Natural' } },
      ],
      scores: {
        'S01': [
          { judgeId: 'user-cupper1', judgeName: 'Tassadar', scores: { 'Fragrance/Aroma': 8.75, 'Flavor': 8.5, 'Aftertaste': 8.25, 'Acidity': 8.75, 'Body': 8.0, 'Uniformity': 10, 'Balance': 8.5, 'Clean Cup': 10, 'Sweetness': 10, 'Overall': 8.5 }, totalScore: 89.25, notes: 'Bright citrus, floral notes of jasmine. Very clean and sweet. Elegant acidity.' },
          { judgeId: 'user-cupper2', judgeName: 'Zeratul', scores: { 'Fragrance/Aroma': 8.5, 'Flavor': 8.75, 'Aftertaste': 8.5, 'Acidity': 8.5, 'Body': 8.25, 'Uniformity': 10, 'Balance': 8.25, 'Clean Cup': 10, 'Sweetness': 10, 'Overall': 8.75 }, totalScore: 89.5, notes: 'Stone fruit, honey, and a hint of black tea. Silky body. Well-balanced.' },
          { judgeId: 'user-headjudge', judgeName: 'Artanis', scores: { 'Fragrance/Aroma': 8.75, 'Flavor': 8.5, 'Aftertaste': 8.25, 'Acidity': 8.75, 'Body': 8.0, 'Uniformity': 10, 'Balance': 8.25, 'Clean Cup': 10, 'Sweetness': 10, 'Overall': 8.5 }, totalScore: 89, notes: 'Tropical fruit notes, papaya and mango. A very complex and satisfying cup.' },
        ],
        'S02': [
          { judgeId: 'user-cupper1', judgeName: 'Tassadar', scores: { 'Fragrance/Aroma': 8.25, 'Flavor': 8.0, 'Aftertaste': 7.75, 'Acidity': 8.0, 'Body': 8.5, 'Uniformity': 10, 'Balance': 8.0, 'Clean Cup': 10, 'Sweetness': 10, 'Overall': 8.0 }, totalScore: 86.5, notes: 'Berry jam, winey notes. Full body.' },
          { judgeId: 'user-cupper2', judgeName: 'Zeratul', scores: { 'Fragrance/Aroma': 8.5, 'Flavor': 8.25, 'Aftertaste': 8.0, 'Acidity': 7.75, 'Body': 8.25, 'Uniformity': 10, 'Balance': 7.75, 'Clean Cup': 10, 'Sweetness': 10, 'Overall': 8.25 }, totalScore: 86.75, notes: 'Fermented fruit, dark chocolate. A bit rustic but enjoyable.' },
        ]
      },
      finalResults: {
        'S01': {
            avgScores: SCA_ATTRIBUTES.reduce((acc, attr) => ({ ...acc, [attr]: 8.5 }), {}),
            totalScore: 89.25,
            finalNotes: 'A consensus of bright citrus, floral jasmine, and tropical fruits like papaya and mango characterizes this complex and satisfying cup. It presents with a silky body, elegant acidity, and exceptional sweetness, often described as clean, balanced, and honey-like.'
        }
      }
    },
     {
      id: 'CS002',
      name: 'Regional Qualifiers 2025',
      date: '2025-08-20',
      type: CuppingSessionType.Competition,
      status: 'Scoring',
      judges: [
        { id: 'user-headjudge', name: 'Artanis', role: UserRole.HeadJudge },
        { id: 'user-cupper1', name: 'Tassadar', role: UserRole.Cupper },
        { id: 'user-cupper3', name: 'Fenix', role: UserRole.Cupper },
      ],
      samples: [
        { id: 'S01', blindCode: 'A11', greenBeanLotId: 'GBL002', submitterInfo: { name: 'John Doe' }, originInfo: { farm: 'Hacienda Elida' }, lotInfo: { process: 'Washed' } },
        { id: 'S02', blindCode: 'B22', greenBeanLotId: 'EXT02', submitterInfo: { name: 'Another Producer' }, originInfo: { farm: 'Finca Naranja' }, lotInfo: { process: 'Natural' } },
      ],
      scores: {
        'S01': [
           { judgeId: 'user-cupper1', judgeName: 'Tassadar', scores: { 'Fragrance/Aroma': 8.5, 'Flavor': 8.5, 'Aftertaste': 8.0, 'Acidity': 8.25, 'Body': 8.0, 'Uniformity': 10, 'Balance': 8.25, 'Clean Cup': 10, 'Sweetness': 10, 'Overall': 8.5 }, totalScore: 88, notes: 'Clean, balanced, classic washed profile.' },
        ],
         'S02': [
           { judgeId: 'user-cupper1', judgeName: 'Tassadar', scores: { 'Fragrance/Aroma': 8.0, 'Flavor': 8.25, 'Aftertaste': 8.0, 'Acidity': 8.0, 'Body': 8.5, 'Uniformity': 10, 'Balance': 8.0, 'Clean Cup': 10, 'Sweetness': 10, 'Overall': 8.0 }, totalScore: 86.75, notes: 'Fruity and sweet.' },
           { judgeId: 'user-cupper3', judgeName: 'Fenix', scores: { 'Fragrance/Aroma': 8.25, 'Flavor': 8.0, 'Aftertaste': 7.75, 'Acidity': 8.0, 'Body': 8.25, 'Uniformity': 10, 'Balance': 8.0, 'Clean Cup': 10, 'Sweetness': 10, 'Overall': 8.0 }, totalScore: 86.25, notes: 'Nice berry notes.' },
        ]
      }
    },
    {
      id: 'CS003',
      name: 'Producer Expo Showcase',
      date: '2025-10-01',
      type: CuppingSessionType.Competition,
      status: 'Setup',
      judges: [
        { id: 'user-headjudge', name: 'Artanis', role: UserRole.HeadJudge },
        { id: 'user-cupper2', name: 'Zeratul', role: UserRole.Cupper },
      ],
      samples: [
        { id: 'S01', blindCode: 'X99', greenBeanLotId: 'GBL001', submitterInfo: { name: 'Maria Rodriguez' }, originInfo: { farm: 'Finca La Esmeralda' }, lotInfo: { process: 'Honey' } },
      ],
      scores: {}
    },
    {
      id: 'CS004',
      name: 'Golden Bean Award 2024',
      date: '2024-12-15',
      type: CuppingSessionType.Competition,
      status: 'Finalized',
      judges: [
        { id: 'user-headjudge', name: 'Artanis', role: UserRole.HeadJudge },
        { id: 'user-cupper1', name: 'Tassadar', role: UserRole.Cupper },
        { id: 'user-cupper2', name: 'Zeratul', role: UserRole.Cupper },
      ],
      samples: [
        { id: 'S01', blindCode: '78A', greenBeanLotId: 'GBL001', submitterInfo: { name: 'Maria Rodriguez' }, originInfo: { farm: 'Finca La Esmeralda' }, lotInfo: { process: 'Honey' } },
        { id: 'S02', blindCode: '92B', greenBeanLotId: 'GBL002', submitterInfo: { name: 'John Doe' }, originInfo: { farm: 'Hacienda Elida' }, lotInfo: { process: 'Washed' } },
      ],
      scores: { 'S01': [], 'S02': [] },
      finalResults: {
        'S01': {
            avgScores: SCA_ATTRIBUTES.reduce((acc, attr) => ({ ...acc, [attr]: 8.75 }), {}),
            totalScore: 90.50,
            finalNotes: 'An absolutely stunning coffee, with remarkable complexity and clarity. Layers of tropical fruit, jasmine, and a honey-sweet finish.',
            rank: 1
        },
        'S02': {
            avgScores: SCA_ATTRIBUTES.reduce((acc, attr) => ({ ...acc, [attr]: 8.5 }), {}),
            totalScore: 88.25,
            finalNotes: 'A very clean and elegant washed coffee. Notes of citrus, green apple, and a delicate floral quality. Crisp acidity.',
            rank: 2
        }
      }
    }
  ],
  gapLogs: [
    { id: 'GAP001', farmId: 'F001', farmPlotLocation: 'Finca La Esmeralda, Plot A', activityType: 'Fertilizer', date: '2025-06-15', productUsed: 'Organic Compost', quantity: '200 kg', notes: 'Applied around the base of the plants.' },
    { id: 'GAP002', farmId: 'F001', farmPlotLocation: 'Finca La Esmeralda, Plot A', activityType: 'Pest Management', date: '2025-07-01', productUsed: 'Neem Oil Solution', quantity: '5 L', notes: 'Preventative spraying for coffee berry borer.' },
    { id: 'GAP003', farmId: 'F002', farmPlotLocation: 'Hacienda Elida, Plot C4', activityType: 'Water Management', date: '2025-07-10', productUsed: 'Drip Irrigation', quantity: '2 hours', notes: 'Morning irrigation cycle.' },
    { id: 'GAP004', farmId: 'F001', farmPlotLocation: 'Finca La Esmeralda, Plot A', activityType: 'Water Management', date: '2025-07-12', productUsed: 'Drip Irrigation', quantity: '1.5 hours', notes: 'Soil moisture was adequate.' },
  ],
  activityTypes: [
    { id: 'AT001', name: 'Fertilizer', description: 'Application of fertilizers and nutrients', createdDate: '2025-01-01', isActive: true },
    { id: 'AT002', name: 'Pest Management', description: 'Pest control and management activities', createdDate: '2025-01-01', isActive: true },
    { id: 'AT003', name: 'Water Management', description: 'Irrigation and water management', createdDate: '2025-01-01', isActive: true },
    { id: 'AT004', name: 'Pruning', description: 'Tree pruning and maintenance', createdDate: '2025-01-01', isActive: true },
    { id: 'AT005', name: 'Soil Management', description: 'Soil preparation and management', createdDate: '2025-01-01', isActive: true },
  ],
  processTypes: [
    {
      id: 'PT001',
      name: 'Washed',
      description: 'Washed process - cherries are pulped and fermented to remove mucilage before drying',
      colorScheme: {
        borderColor: 'border-l-blue-500',
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
        badgeColor: 'bg-blue-100 text-blue-700 border-blue-200'
      },
      createdDate: '2025-01-01',
      isActive: true
    },
    {
      id: 'PT002',
      name: 'Natural',
      description: 'Natural process - cherries are dried whole with the fruit intact',
      colorScheme: {
        borderColor: 'border-l-amber-500',
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600',
        badgeColor: 'bg-amber-100 text-amber-700 border-amber-200'
      },
      createdDate: '2025-01-01',
      isActive: true
    },
    {
      id: 'PT003',
      name: 'Honey',
      description: 'Honey process - cherries are pulped but some or all mucilage is left on during drying',
      colorScheme: {
        borderColor: 'border-l-yellow-500',
        iconBg: 'bg-yellow-100',
        iconColor: 'text-yellow-600',
        badgeColor: 'bg-yellow-100 text-yellow-700 border-yellow-200'
      },
      createdDate: '2025-01-01',
      isActive: true
    },
  ],
  soilAnalyses: [
    {
      id: 'SA001',
      farmId: 'F001',
      farmPlotLocation: 'Finca La Esmeralda, Plot A',
      testDate: '2025-03-15',
      labName: 'Chiang Mai Agricultural Testing Laboratory',
      certificateNumber: 'CMATL-2025-0342',
      pH: 6.2,
      phosphorus: 45,
      potassium: 180,
      nitrogen: 2.8,
      calcium: 1200,
      magnesium: 150,
      organicMatter: 4.5,
      recommendations: 'pH is suitable for coffee cultivation. Increase organic fertilizers to maintain organic matter levels. Potassium levels are adequate.',
      createdBy: 'user-farmer1',
      createdByRole: UserRole.Farmer,
      notes: 'Annual soil test — Spring'
    },
    {
      id: 'SA002',
      farmId: 'F002',
      farmPlotLocation: 'Hacienda Elida, Plot C4',
      testDate: '2025-02-20',
      labName: 'Chiang Mai Agricultural Testing Laboratory',
      certificateNumber: 'CMATL-2025-0211',
      pH: 5.8,
      phosphorus: 32,
      potassium: 145,
      nitrogen: 2.2,
      calcium: 980,
      magnesium: 125,
      organicMatter: 3.8,
      recommendations: 'pH is somewhat low; apply agricultural lime to adjust pH to 6.0–6.5. Nitrogen is sufficient. Consider supplementing potassium.',
      createdBy: 'user-farmer1',
      createdByRole: UserRole.Farmer,
      notes: 'Pre-season baseline test'
    },
    {
      id: 'SA003',
      farmId: 'F003',
      farmPlotLocation: 'Elsa\'s Farm, Main Plot',
      testDate: '2024-12-10',
      labName: 'Chiang Rai Soil Analysis Center',
      certificateNumber: 'CRSAC-2024-1245',
      pH: 6.5,
      phosphorus: 52,
      potassium: 195,
      nitrogen: 3.1,
      calcium: 1350,
      magnesium: 165,
      organicMatter: 5.2,
      recommendations: 'Soil quality is excellent with nutrients in optimal ranges. Maintain organic amendments for sustainability.',
      createdBy: 'user-processor1',
      createdByRole: UserRole.Processor,
      notes: 'Soil quality assessment for production planning'
    }
  ],
  roasterInventory: [
    { id: 'RI001', roasterId: 'user-roaster1', greenBeanLotId: 'GBL001', claimedWeightKg: 10, remainingWeightKg: 7.5 }
  ],
  roastBatches: [
    { id: 'RB001', roasterId: 'user-roaster1', roasterInventoryId: 'RI001', greenBeanLotId: 'GBL001', roastDate: '2025-09-15', batchSizeKg: 2.5, yieldPercentage: 85, roastLevel: RoastLevel.Medium, roastProfileNotes: 'Medium roast profile. First crack at 9:30. Dropped at 11:15.', flavorNotes: 'Chocolate, Orange Peel, Brown Sugar'},
    { id: 'RB002', roasterId: 'user-roaster1', roasterInventoryId: 'RI001', greenBeanLotId: 'GBL001', roastDate: '2025-09-20', batchSizeKg: 1.0, yieldPercentage: 84.5, roastLevel: RoastLevel.Light, roastProfileNotes: 'Light roast for cupping.', flavorNotes: 'Jasmine, Citrus, Honey'},
    { id: 'RB003', roasterId: 'user-roaster1', roasterInventoryId: 'RI001', greenBeanLotId: 'GBL001', roastDate: '2025-09-25', batchSizeKg: 1.5, yieldPercentage: 83.2, roastLevel: RoastLevel.Dark, roastProfileNotes: 'Dark roast test.', flavorNotes: 'Cocoa, Caramelized Sugar'},
    { id: 'RB004', roasterId: 'user-roaster1', roasterInventoryId: 'RI001', greenBeanLotId: 'GBL001', roastDate: '2025-10-02', batchSizeKg: 1.8, yieldPercentage: 86.0, roastLevel: RoastLevel.Medium, roastProfileNotes: 'Production batch.', flavorNotes: 'Stone Fruit, Floral'},
    { id: 'RB005', roasterId: 'user-roaster1', roasterInventoryId: 'RI001', greenBeanLotId: 'GBL001', roastDate: '2025-10-10', batchSizeKg: 2.0, yieldPercentage: 85.5, roastLevel: RoastLevel.Medium, roastProfileNotes: 'Dialed in profile.', flavorNotes: 'Honey, Tea-like'},
    { id: 'RB006', roasterId: 'user-roaster1', roasterInventoryId: 'RI001', greenBeanLotId: 'GBL001', roastDate: '2025-10-18', batchSizeKg: 1.2, yieldPercentage: 84.0, roastLevel: RoastLevel.Light, roastProfileNotes: 'Sample for client.', flavorNotes: 'Floral, Citrus'}
  ],
  cropYears: [
    { id: 'CY2024', year: '2024/2025', startDate: '2024-10-01', endDate: '2025-09-30', description: 'Current crop year' },
    { id: 'CY2023', year: '2023/2024', startDate: '2023-10-01', endDate: '2024-09-30', description: 'Previous crop year' },
    { id: 'CY2025', year: '2025/2026', startDate: '2025-10-01', endDate: '2026-09-30', description: 'Next crop year' }
  ],
  weatherRecords: [
    { id: 'WR001', farmId: 'F001', farmPlotLocation: 'Finca La Esmeralda, Plot A', recordDate: '2025-11-01', temperatureMin: 18, temperatureMax: 28, temperatureAvg: 23, rainfall: 5.2, humidity: 75, source: 'Manual', recordedBy: 'user-farmer1', notes: 'Light rain in the afternoon' },
    { id: 'WR002', farmId: 'F001', farmPlotLocation: 'Finca La Esmeralda, Plot A', recordDate: '2025-10-31', temperatureMin: 19, temperatureMax: 29, temperatureAvg: 24, rainfall: 0, humidity: 70, source: 'Manual', recordedBy: 'user-farmer1' },
    { id: 'WR003', farmId: 'F002', farmPlotLocation: 'Hacienda Elida, Plot C4', recordDate: '2025-11-01', temperatureMin: 17, temperatureMax: 27, temperatureAvg: 22, rainfall: 12.5, humidity: 82, source: 'Manual', recordedBy: 'user-farmer1', notes: 'Heavy rain overnight' }
  ],
  pricingHistory: [
    { id: 'PH001', greenBeanLotId: 'GBL001', pricePerKg: 450, currency: 'THB', effectiveDate: '2025-09-01', setBy: 'user-processor1', notes: 'Premium Gesha pricing' }
  ],
  customers: [
    { id: 'CUST001', name: 'Bangkok Coffee Roasters', type: 'Roaster', contactEmail: 'orders@bangkokcoffee.com', contactPhone: '02-123-4567', address: '123 Sukhumvit Rd, Bangkok 10110', notes: 'Regular customer, pays on time' },
    { id: 'CUST002', name: 'Chiang Mai Specialty Coffee', type: 'Distributor', contactEmail: 'info@cmspecialty.com', contactPhone: '053-456-789', address: '456 Nimmanhaemin Rd, Chiang Mai 50200' },
    { id: 'CUST003', name: 'The Coffee Bean Shop', type: 'Retailer', contactEmail: 'shop@coffebean.co.th', contactPhone: '081-234-5678', address: '789 Pattaya Rd, Chonburi 20150', notes: 'Prefers organic certified beans' }
  ],
  saleOrders: [
    {
      id: 'SO001',
      orderNumber: 'SO-2025-001',
      customerId: 'CUST001',
      customerName: 'Bangkok Coffee Roasters',
      orderDate: '2025-10-15',
      status: 'Confirmed',
      items: [
        { id: 'SOI001', greenBeanLotId: 'GBL001', lotGrade: 'Grade A', quantity: 25, pricePerKg: 450, subtotal: 11250 }
      ],
      totalAmount: 11250,
      currency: 'THB',
      notes: 'Delivery scheduled for next week',
      createdBy: 'user-processor1'
    }
  ],
  invoices: [
    {
      id: 'INV001',
      invoiceNumber: 'INV-2025-001',
      saleOrderId: 'SO001',
      issueDate: '2025-10-15',
      dueDate: '2025-11-15',
      status: 'Sent',
      items: [
        { id: 'SOI001', greenBeanLotId: 'GBL001', lotGrade: 'Grade A', quantity: 25, pricePerKg: 450, subtotal: 11250 }
      ],
      subtotal: 11250,
      tax: 787.5,
      totalAmount: 12037.5,
      currency: 'THB',
      notes: 'Payment terms: Net 30 days'
    }
  ]
};