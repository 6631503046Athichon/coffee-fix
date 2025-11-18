# โครงสร้างโปรเจกต์ Coffee Lab

โปรเจกต์นี้ถูกจัดระเบียบเป็น 3 ส่วนหลัก: Frontend, Backend และ Documentation

## 📁 โครงสร้างโฟลเดอร์

```
coffee-fix/
├── frontend/              # React + Vite Frontend Application
│   ├── src/               # Source Code
│   │   ├── components/    # React Components (44+ files)
│   │   ├── contexts/      # React Context (Authentication, etc.)
│   │   ├── hooks/         # Custom React Hooks
│   │   ├── services/      # Frontend Services (10 files)
│   │   │   ├── authService.ts          # Mock authentication
│   │   │   ├── activityTypeService.ts  # GAP activities
│   │   │   ├── processTypeService.ts   # Process types
│   │   │   ├── salesService.ts         # Sales data
│   │   │   ├── soilAnalysisService.ts  # Soil analysis
│   │   │   ├── weatherService.ts       # Weather records
│   │   │   ├── weatherApiService.ts    # Open-Meteo API
│   │   │   ├── geminiService.ts        # Google Gemini AI
│   │   │   └── api.ts                  # API utilities
│   │   ├── types/         # TypeScript Type Definitions
│   │   ├── utils/         # Utility Functions
│   │   ├── App.tsx        # Main App Component
│   │   └── index.tsx      # Entry Point
│   ├── index.html         # HTML Template
│   ├── vite.config.ts     # Vite Configuration
│   ├── package.json       # Frontend Dependencies
│   └── README.md          # Frontend Documentation
│
├── backend/               # Next.js Backend API (อยู่ระหว่างพัฒนา)
│   ├── src/               # API Source Code
│   │   ├── app/           # Next.js App Router
│   │   └── lib/           # Backend Libraries
│   ├── prisma/            # Database Schema & Migrations
│   ├── next.config.js     # Next.js Configuration
│   ├── package.json       # Backend Dependencies
│   └── README.md          # Backend Documentation
│
├── docs/                  # เอกสารโปรเจกต์
│   ├── backend/           # Backend Documentation
│   │   └── API_TESTING.md    # Backend API Testing Guide
│   ├── frontend/          # Frontend Documentation
│   │   └── API_INTEGRATION.md  # Frontend API Integration Guide
│   ├── API_TESTING.md     # General API Testing Guide
│   ├── README.md          # Project Overview
│   ├── PROJECT_STRUCTURE.md  # Project Structure (this file)
│   └── metadata.json      # Project Metadata
│
├── .git/                  # Git Repository
├── .gitignore             # Git Ignore Rules
└── node_modules/          # Dependencies (จะถูกย้ายเข้า frontend/ ในอนาคต)
```

## 🚀 เริ่มต้นใช้งาน

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Application จะรันที่ http://localhost:3000

### Backend

Backend ยังอยู่ในขั้นตอนการพัฒนา มีเฉพาะไฟล์ configuration

## 📋 สรุปส่วนประกอบ

### Frontend (✅ สมบูรณ์)
- **React 19** - UI Framework
- **Vite** - Build Tool
- **TypeScript** - Type Safety
- **React Router 7** - Routing
- **Tailwind CSS** - Styling
- **44+ React Components** - แยกตาม Role (Farmer, Processor, Roaster, Cupper, Admin)

### Backend (⚠️ อยู่ระหว่างพัฒนา)
- **Next.js 14** - API Framework (planned)
- **Prisma ORM** - Database ORM (planned)
- **PostgreSQL** - Database (planned)

### Documentation (✅ สมบูรณ์)
- Project Overview
- Setup Instructions
- API Documentation (planned)

## 📝 หมายเหตุ

- Frontend มีโค้ดสมบูรณ์และพร้อมใช้งาน
- Backend มีแค่ configuration ยังไม่มี API code
- โฟลเดอร์ `node_modules/` อยู่ที่ root ควรจะแยกไปอยู่ใน `frontend/` และ `backend/` ในอนาคต

## 🔄 การอัพเดทล่าสุด

- ✅ แยกโฟลเดอร์ Frontend ออกจาก root
- ✅ จัดระเบียบโฟลเดอร์ Backend
- ✅ ย้ายเอกสารเข้าโฟลเดอร์ docs/
- ✅ อัพเดท Vite config และ import paths
- ✅ สร้าง README สำหรับแต่ละส่วน
- ✅ ย้าย services/ มาอยู่ใน frontend/src/services/ (เป็น frontend utilities)
- ✅ ลบ services ออกจาก backend (ไม่ใช่ backend code)
