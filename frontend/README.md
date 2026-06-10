# Coffee Lab - Frontend

Frontend application สำหรับระบบ Coffee Lab: Digital Quality & Traceability Platform

## เทคโนโลยี

- **React 19** - UI Framework
- **Vite 6** - Build Tool & Development Server
- **TypeScript** - Type Safety
- **React Router DOM 7** - Client-side Routing
- **Tailwind CSS** - Styling
- **Recharts 3** - Data Visualization
- **Lucide React** - Icons

## โครงสร้างโฟลเดอร์

```
frontend/
├── src/
│   ├── components/                  # React Components
│   │   ├── admin/                   # Admin Features (users, system)
│   │   ├── auth/                    # Authentication (login, first-login)
│   │   ├── common/                  # Reusable UI (Button, Input, Select, etc.)
│   │   ├── competition/             # Competition/Cupping Management
│   │   ├── cupper/                  # Cupper/Judge Scoring
│   │   ├── farmer/                  # Farm & GAP Management
│   │   │   ├── AddFarmPage.tsx      # Create/Edit farm + caretakers
│   │   │   ├── FarmManagement.tsx   # Farm list view
│   │   │   └── ...
│   │   ├── layout/                  # Layout, Sidebar, Navigation
│   │   ├── modals/                  # Modal components
│   │   ├── processor/               # Processing & Parchment
│   │   └── roaster/                 # Roaster Inventory & Batches
│   ├── contexts/                    # React Context (Auth, Data)
│   ├── hooks/                       # Custom Hooks
│   ├── services/                    # API service layer
│   │   ├── api.ts                   # Base API client
│   │   ├── authService.ts
│   │   ├── farmService.ts
│   │   ├── farmCollaboratorService.ts
│   │   ├── harvestLotService.ts
│   │   ├── processingBatchService.ts
│   │   ├── parchmentLotService.ts
│   │   ├── greenBeanLotService.ts
│   │   ├── roasterService.ts
│   │   ├── customerService.ts
│   │   ├── saleOrderService.ts
│   │   ├── invoiceService.ts
│   │   ├── pricingHistoryService.ts
│   │   ├── gapLogService.ts
│   │   ├── soilAnalysisService.ts
│   │   ├── weatherService.ts
│   │   ├── weatherApiService.ts           # Weather API fetching
│   │   ├── weatherAutoFetchService.ts     # Auto-fetch weather
│   │   ├── geminiService.ts               # Gemini AI service
│   │   ├── userService.ts
│   │   ├── coffeeVarietyService.ts
│   │   ├── activityTypeService.ts
│   │   └── processTypeService.ts
│   ├── utils/                       # Utility modules
│   │   ├── connectionManager.ts     # Connection state management
│   │   ├── errorHandler.ts          # Error handling utilities
│   │   ├── formatters.ts            # Data formatting helpers
│   │   ├── formatDisplayId.ts       # Display ID formatting
│   │   ├── logger.ts                # Logging utility
│   │   ├── exportCSV.ts             # CSV export utility
│   │   └── idGenerator.ts           # ID generation utility
│   ├── constants.ts                 # App-wide constants
│   ├── types.ts                     # Shared TypeScript types
│   ├── App.tsx                      # Main Application + Routes
│   └── main.tsx                     # Entry Point
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## การติดตั้ง

```bash
cd frontend
npm install
```

## การรันโปรเจกต์

```bash
npm run dev
```

Application จะรันที่ `http://localhost:5173`

## Build สำหรับ Production

```bash
npm run build
```

## User Roles

| Role | สิทธิ์ |
|------|--------|
| **Admin** | จัดการทุกอย่าง, สร้าง/แก้ไข farm, จัดการ users |
| **Farmer** | ดู/แก้ไข farm ของตัวเอง, บันทึก GAP, weather |
| **Processor** | จัดการ harvest lots, processing batches, parchment |
| **Roaster** | จัดการ roaster inventory, roast batches |
| **HeadJudge** | จัดการ cupping sessions |
| **Cupper** | ให้คะแนน cupping samples |

## Features

- **Role-based Access Control** - ควบคุมสิทธิ์แยกตาม Role
- **Farm Management** - จัดการฟาร์ม + ผู้ดูแล (Caretakers)
- **Traceability System** - ติดตามย้อนกลับทุกขั้นตอนผ่าน QR Code
- **Coffee Pipeline** - Harvest → Processing → Parchment → Green Bean → Roast
- **Quality Insights** - วิเคราะห์คุณภาพและ Cupping Scores
- **Cupping Sessions** - จัดการการชิมและให้คะแนน (QC & Competition)
- **GAP Compliance** - บันทึก GAP activities ตามมาตรฐาน
- **Soil Analysis** - บันทึกผลวิเคราะห์ดิน
- **Weather Records** - บันทึกและ auto-fetch ข้อมูลอากาศ
- **Sales & Invoicing** - Sale Orders, Invoices, Pricing History
- **Password Reset** - ระบบ reset password ผ่าน email
