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

## การตั้งค่าใน Vercel

1. ไปที่ Vercel Project Settings
2. ไปที่ Environment Variables
3. ตั้งค่า `DATABASE_URL` ด้วย connection string ที่มี connection pooling
4. Redeploy application

## ตรวจสอบ

หลังจากตั้งค่าแล้ว:
1. Deploy ใหม่
2. ตรวจสอบ logs ใน Vercel dashboard
3. ควรไม่เจอ `MaxClientsInSessionMode` error อีก

## หมายเหตุ

- Prisma Client ในโค้ดใช้ singleton pattern เพื่อ reuse connections
- แต่ยังต้องใช้ connection pooler เพื่อป้องกัน connection exhaustion
- Connection pooler จะจัดการ connections ที่ database level
