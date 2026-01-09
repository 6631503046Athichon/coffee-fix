# 🔧 คู่มือแก้ปัญหา (Troubleshooting Guide)

## ปัญหาที่พบบ่อย

### 1. ❌ Error 500 Internal Server Error จาก `/api/auth/login`

**สาเหตุ:**
- ไม่มีไฟล์ `.env` ใน `backend/`
- `DATABASE_URL` ไม่ถูกต้องหรือไม่มี
- `JWT_SECRET` ไม่มี
- Database connection ล้มเหลว
- Prisma Client ยังไม่ได้ generate

**วิธีแก้:**
1. ตรวจสอบว่ามีไฟล์ `backend/.env` หรือไม่
   ```bash
   cd backend
   ls .env  # หรือ dir .env (Windows)
   ```

2. ถ้าไม่มี ให้สร้างจาก `.env.example`:
   ```bash
   # Windows (PowerShell)
   Copy-Item .env.example .env
   
   # Mac/Linux
   cp .env.example .env
   ```

3. แก้ไข `.env` ให้มีค่าเหล่านี้:
   ```env
   DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"
   JWT_SECRET="your-random-secret-key-here"
   FRONTEND_URL="http://localhost:5173"
   NODE_ENV="development"
   ```

4. Generate Prisma Client:
   ```bash
   npm run db:generate
   ```

5. Push schema to database:
   ```bash
   npm run db:push
   ```

6. Seed database:
   ```bash
   npm run db:seed
   ```

7. Restart backend server:
   ```bash
   npm run dev
   ```

---

### 2. ❌ Error 401 Unauthorized จาก `/api/auth/me`

**สาเหตุ:**
- ยังไม่ได้ login
- Token หมดอายุ
- Backend ไม่ได้รัน

**วิธีแก้:**
1. ตรวจสอบว่า backend รันอยู่ที่ `http://localhost:3001`
2. ลอง login ใหม่
3. ตรวจสอบ console logs ใน backend terminal

---

### 3. ⚠️ Warning: "VITE_GEMINI_API_KEY environment variable not set"

**สาเหตุ:**
- ยังมีโค้ดที่อ้างอิง geminiService (ควรลบออกแล้ว)

**วิธีแก้:**
- Warning นี้ไม่เป็นปัญหา - ระบบจะใช้ mock data แทน
- หรือ hard refresh browser (Ctrl+Shift+R)

---

### 4. ❌ Frontend เชื่อมต่อ Backend ไม่ได้

**สาเหตุ:**
- Backend ไม่ได้รัน
- Port ไม่ตรงกัน
- CORS error

**วิธีแก้:**
1. ตรวจสอบว่า backend รันอยู่:
   ```bash
   cd backend
   npm run dev
   ```
   ควรเห็น: `Ready - started server on 0.0.0.0:3001`

2. ตรวจสอบ frontend `.env.local` (ถ้ามี):
   ```env
   VITE_API_URL="http://localhost:3001/api"
   ```

3. ตรวจสอบ browser console สำหรับ CORS errors

---

### 5. ❌ Database Error: Column ไม่มี

**สาเหตุ:**
- Schema ไม่ sync กับ database

**วิธีแก้:**
```bash
cd backend
npm run db:push
npm run db:generate
```

---

### 6. ❌ ไม่มีข้อมูล Users

**สาเหตุ:**
- ยังไม่ได้รัน seed

**วิธีแก้:**
```bash
cd backend
npm run db:seed
```

หลังจากรัน seed จะมี users:
- Admin: `6631503046@lamduan.mfu.ac.th` / `admin123`
- Farmer: `farmer@coffee.com` / `farmer123`
- และอื่นๆ (ดูใน `prisma/seed.ts`)

---

## 📋 Checklist สำหรับเพื่อน

ก่อนรัน localhost ต้องทำ:

- [ ] Clone repository
- [ ] `cd backend && npm install`
- [ ] สร้างไฟล์ `backend/.env` (คัดลอกจาก `.env.example`)
- [ ] แก้ไข `DATABASE_URL` และ `JWT_SECRET` ใน `.env`
- [ ] `npm run db:generate`
- [ ] `npm run db:push`
- [ ] `npm run db:seed`
- [ ] `npm run dev` (backend)
- [ ] `cd ../frontend && npm install`
- [ ] `npm run dev` (frontend)

---

## 🔍 ตรวจสอบ Logs

### Backend Logs
ดูที่ terminal ที่รัน `npm run dev` ใน `backend/`

Error ที่พบบ่อย:
- `PrismaClientInitializationError` → Database connection ผิด
- `JWT_SECRET is not defined` → ไม่มี JWT_SECRET ใน `.env`
- `Column does not exist` → Schema ไม่ sync

### Frontend Logs
เปิด Browser DevTools (F12) → Console tab

Error ที่พบบ่อย:
- `401 Unauthorized` → ยังไม่ได้ login หรือ token หมดอายุ
- `500 Internal Server Error` → Backend error (ดู backend logs)
- `Failed to fetch` → Backend ไม่ได้รัน

---

## 📞 ถ้ายังแก้ไม่ได้

1. ตรวจสอบ console logs ทั้ง backend และ frontend
2. ตรวจสอบว่า `.env` มีค่าถูกต้อง
3. ลอง restart servers
4. ลอง clear browser cache
5. ตรวจสอบว่า ports ไม่ถูกใช้งาน (3001, 5173)
