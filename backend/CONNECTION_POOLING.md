# Database Connection Pooling สำหรับ Vercel

## ปัญหา

เมื่อ deploy บน Vercel (serverless environment) คุณอาจเจอ error:
```
FATAL: MaxClientsInSessionMode: max clients reached - in Session mode max clients are limited to pool_size
```

ปัญหานี้เกิดจาก:
- Serverless functions แต่ละ invocation อาจสร้าง database connection ใหม่
- Database connection pool หมดเร็วมาก
- Prisma Client ต้องใช้ connection pooler เพื่อจัดการ connections

## วิธีแก้ไข

### วิธีที่ 1: ใช้ Prisma Accelerate (แนะนำ)

Prisma Accelerate จัดการ connection pooling ให้อัตโนมัติ:

1. สร้าง account ที่ [Prisma Accelerate](https://www.prisma.io/accelerate)
2. สร้าง Accelerate project
3. ใช้ Accelerate connection string แทน DATABASE_URL ปกติ

```env
DATABASE_URL="prisma://accelerate.prisma-data.net/?api_key=YOUR_API_KEY"
```

### วิธีที่ 2: ใช้ PgBouncer

ถ้าใช้ PostgreSQL database (เช่น Supabase, Neon, Railway):

1. ตั้งค่า PgBouncer connection pooler
2. ใช้ connection string ที่มี `pgbouncer=true`:

```env
DATABASE_URL="postgresql://user:pass@host:port/db?pgbouncer=true&connection_limit=1"
```

**สำหรับ Supabase:**
```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@[PROJECT_REF].supabase.co:6543/postgres?pgbouncer=true"
```

**สำหรับ Neon:**
```env
DATABASE_URL="postgresql://user:pass@host.neon.tech/db?sslmode=require&pgbouncer=true&connection_limit=1"
```

### วิธีที่ 3: ใช้ Vercel Postgres

ถ้าใช้ Vercel Postgres:

1. สร้าง Vercel Postgres database
2. Vercel จะจัดการ connection pooling ให้อัตโนมัติ
3. ใช้ connection string จาก Vercel dashboard

## การตั้งค่าใน Vercel (ขั้นตอนละเอียด)

### ขั้นตอนที่ 1: เข้าไปที่ Vercel Dashboard

1. ไปที่ [Vercel Dashboard](https://vercel.com/dashboard)
2. เลือก project ของคุณ (coffee-fix-backend)
3. คลิกที่ **Settings** → **Environment Variables**

### ขั้นตอนที่ 2: ตรวจสอบ DATABASE_URL ปัจจุบัน

1. ดูว่ามี `DATABASE_URL` อยู่แล้วหรือไม่
2. คัดลอกค่า DATABASE_URL ปัจจุบันไว้ก่อน (เพื่อแก้ไข)

### ขั้นตอนที่ 3: แก้ไข DATABASE_URL

เลือกวิธีที่เหมาะสมกับ database provider ของคุณ:

#### สำหรับ Supabase:

1. ไปที่ Supabase Dashboard → Project Settings → Database
2. คัดลอก **Connection string** (ใช้ **Connection Pooling** mode)
3. หรือแก้ไข DATABASE_URL ปัจจุบัน:
   - เปลี่ยน port จาก `5432` เป็น `6543` (PgBouncer port)
   - เพิ่ม `?pgbouncer=true` ที่ท้าย URL
   
   ตัวอย่าง:
   ```
   postgresql://postgres:[PASSWORD]@[PROJECT_REF].supabase.co:6543/postgres?pgbouncer=true
   ```

#### สำหรับ Neon:

1. ไปที่ Neon Dashboard → Connection Details
2. เลือก **Connection pooling** mode
3. คัดลอก connection string
4. หรือเพิ่ม `?pgbouncer=true&connection_limit=1` ที่ท้าย URL
   
   ตัวอย่าง:
   ```
   postgresql://user:pass@host.neon.tech/db?sslmode=require&pgbouncer=true&connection_limit=1
   ```

#### สำหรับ Prisma Accelerate (แนะนำ - ง่ายที่สุด):

1. ไปที่ [Prisma Accelerate](https://www.prisma.io/accelerate)
2. สร้าง account (ฟรี tier มีให้ใช้)
3. สร้าง Accelerate project
4. คัดลอก Accelerate connection string
   
   ตัวอย่าง:
   ```
   prisma://accelerate.prisma-data.net/?api_key=YOUR_API_KEY
   ```

### ขั้นตอนที่ 4: ตั้งค่าใน Vercel

1. ใน Vercel Environment Variables:
   - คลิก **Add New** หรือแก้ไข `DATABASE_URL` ที่มีอยู่
   - วาง connection string ใหม่
   - เลือก **Production**, **Preview**, และ **Development** (หรือตามต้องการ)
   - คลิก **Save**

### ขั้นตอนที่ 5: Redeploy

1. ไปที่ **Deployments** tab
2. คลิก **...** (three dots) บน deployment ล่าสุด
3. เลือก **Redeploy**
4. หรือ push code ใหม่เพื่อ trigger deployment อัตโนมัติ

### ขั้นตอนที่ 6: ตรวจสอบ

1. หลังจาก deploy เสร็จ ลองใช้งาน application
2. ตรวจสอบ Vercel Function Logs:
   - ไปที่ **Deployments** → เลือก deployment → **Functions** tab
   - ดู logs ว่ายังมี connection pool error หรือไม่
3. ถ้ายังมี error ให้ตรวจสอบ:
   - DATABASE_URL ถูกต้องหรือไม่
   - Connection pooler ทำงานหรือไม่
   - Database provider มี connection limit หรือไม่

## ตรวจสอบ

หลังจากตั้งค่าแล้ว:
1. Deploy ใหม่
2. ตรวจสอบ logs ใน Vercel dashboard
3. ควรไม่เจอ `MaxClientsInSessionMode` error อีก

## หมายเหตุ

- Prisma Client ในโค้ดใช้ singleton pattern เพื่อ reuse connections
- แต่ยังต้องใช้ connection pooler เพื่อป้องกัน connection exhaustion
- Connection pooler จะจัดการ connections ที่ database level
