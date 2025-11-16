# Coffee Lab - Frontend

Frontend application สำหรับระบบ Coffee Lab: Digital Quality & Traceability Platform

## เทคโนโลยี

- **React 19** - UI Framework
- **Vite** - Build Tool & Development Server
- **TypeScript** - Type Safety
- **React Router 7** - Client-side Routing
- **Tailwind CSS** - Styling
- **Recharts** - Data Visualization
- **Lucide React** - Icons

## โครงสร้างโฟลเดอร์

```
frontend/
├── src/
│   ├── components/         # React Components
│   │   ├── admin/          # Admin Features
│   │   ├── auth/           # Authentication
│   │   ├── common/         # Reusable UI Components
│   │   ├── competition/    # Competition Features
│   │   ├── cupper/         # Cupper/Judge Features
│   │   ├── farmer/         # Farmer Features
│   │   ├── layout/         # Layout Components
│   │   ├── processor/      # Processor Features
│   │   └── roaster/        # Roaster Features
│   ├── contexts/           # React Context
│   ├── hooks/              # Custom Hooks
│   ├── types/              # TypeScript Type Definitions
│   ├── utils/              # Utility Functions
│   ├── App.tsx             # Main Application Component
│   ├── index.tsx           # Entry Point
│   ├── types.ts            # Shared Types
│   └── constants.ts        # Constants & Mock Data
├── index.html              # HTML Entry Point
├── vite.config.ts          # Vite Configuration
├── tsconfig.json           # TypeScript Configuration
└── package.json            # Dependencies

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

Application จะรันที่ `http://localhost:3000`

## Build สำหรับ Production

```bash
npm run build
```

## Features

- **Role-based Access Control** - Farmer, Processor, Roaster, Cupper, Admin
- **Traceability System** - ติดตามย้อนกลับทุกขั้นตอนของกาแฟ
- **Quality Insights** - วิเคราะห์คุณภาพและ Cupping Scores
- **Cupping Sessions** - จัดการการชิมและให้คะแนนกาแฟ
- **Competition Management** - จัดการการแข่งขันกาแฟ
- **GAP Compliance** - ช่วยเกษตรกรตาม GAP Standards
