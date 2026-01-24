# การปรับปรุงโค้ดและ Components ใหม่

เอกสารนี้อธิบายการปรับปรุงที่ได้ทำไปแล้วและวิธีการใช้งาน components/utilities ใหม่

## 📋 สรุปการปรับปรุง

### 1. ✅ แก้ไขปัญหาความปลอดภัย JWT Secret
**ไฟล์:** `backend/src/lib/auth.ts`

**ปัญหาเดิม:** JWT_SECRET มีค่า fallback เป็น hardcoded string
**การแก้ไข:** เปลี่ยนให้ระบบหยุดทำงานทันทีถ้าไม่มี JWT_SECRET ใน environment

```typescript
// Before
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production'

// After
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set.')
}
const JWT_SECRET: string = process.env.JWT_SECRET
```

### 2. ✅ สร้างไฟล์ .env.example
**ไฟล์:** `backend/.env.example`

ไฟล์ตัวอย่างสำหรับการตั้งค่า environment variables โดยไม่มีข้อมูลลับจริง

**วิธีใช้:**
```bash
# Copy ไฟล์ตัวอย่างไปเป็น .env ของคุณ
cp backend/.env.example backend/.env

# แก้ไขค่าต่างๆ ในไฟล์ .env ให้เป็นค่าจริงของคุณ
```

### 3. ✅ Logger Utility
**ไฟล์:** `frontend/src/utils/logger.ts`

Centralized logging system ที่มี log levels และรองรับการเชื่อมต่อกับ monitoring services

**วิธีใช้:**

```typescript
import { logger } from '../utils/logger';

// Debug (เฉพาะ development)
logger.debug('Processing batch created', { batchId: '123' });

// Info
logger.info('User logged in successfully', { userId: '456' });

// Warning
logger.warn('API response slow', { duration: 5000 });

// Error
logger.error('Failed to fetch data', error, { endpoint: '/api/farms' });
```

**แทนที่ console.error เดิม:**
```typescript
// Before
try {
  await fetchData();
} catch (error) {
  console.error('Failed to fetch data:', error);
}

// After
import { logger } from '../utils/logger';

try {
  await fetchData();
} catch (error) {
  logger.error('Failed to fetch data', error);
}
```

### 4. ✅ Reusable Dropdown Component
**ไฟล์:** `frontend/src/components/common/Dropdown.tsx`

Dropdown component ที่ใช้ซ้ำได้ พร้อม type-safety และ features ครบครัน

**Features:**
- Type-safe generic support
- Click outside to close
- Keyboard navigation
- Label และ error message
- Disabled state
- Custom styling

**วิธีใช้:**

```typescript
import { Dropdown, DropdownOption } from '../components/common/Dropdown';

const processTypes: DropdownOption[] = [
  { value: 'washed', label: 'Washed Process' },
  { value: 'natural', label: 'Natural Process' },
  { value: 'honey', label: 'Honey Process' }
];

function MyComponent() {
  const [selectedProcess, setSelectedProcess] = useState('washed');

  return (
    <Dropdown
      value={selectedProcess}
      onChange={setSelectedProcess}
      options={processTypes}
      label="Process Type"
      placeholder="Select a process"
      required
    />
  );
}
```

**แทนที่ ProcessTypeDropdown และ GradeDropdown:**

```typescript
// Before (ProcessorWorkbench.tsx)
<ProcessTypeDropdown
  value={formData.processTypeId}
  onChange={(value) => setFormData({...formData, processTypeId: value})}
  processTypes={processTypeOptions}
/>

// After
import { Dropdown } from '../common/Dropdown';

<Dropdown
  value={formData.processTypeId}
  onChange={(value) => setFormData({...formData, processTypeId: value})}
  options={processTypeOptions}
  label="Process Type"
/>
```

### 5. ✅ Error Boundary Component
**ไฟล์:** `frontend/src/components/common/ErrorBoundary.tsx`

React Error Boundary สำหรับจับ runtime errors และแสดง fallback UI

**วิธีใช้:**

**1. Wrap ทั้งแอป (แนะนำ):**
```typescript
// App.tsx or main.tsx
import ErrorBoundary from './components/common/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <YourApp />
    </ErrorBoundary>
  );
}
```

**2. Wrap แต่ละ section:**
```typescript
import ErrorBoundary from '../components/common/ErrorBoundary';

function Dashboard() {
  return (
    <div>
      <ErrorBoundary>
        <FarmerDashboard />
      </ErrorBoundary>

      <ErrorBoundary>
        <ProcessorWorkbench />
      </ErrorBoundary>
    </div>
  );
}
```

**3. Custom fallback UI:**
```typescript
function CustomErrorFallback() {
  return (
    <div className="p-8 text-center">
      <h2>โอ๊ะ! มีบางอย่างผิดพลาด</h2>
      <p>กรุณาลองใหม่อีกครั้ง</p>
    </div>
  );
}

<ErrorBoundary fallback={<CustomErrorFallback />}>
  <YourComponent />
</ErrorBoundary>
```

**4. Custom error handler:**
```typescript
const handleError = (error: Error, errorInfo: ErrorInfo) => {
  // Send to analytics
  analytics.trackError(error);
};

<ErrorBoundary onError={handleError}>
  <YourComponent />
</ErrorBoundary>
```

## 🔐 ขั้นตอนด้านความปลอดภัยที่ต้องทำ

### ⚠️ สำคัญมาก: เปลี่ยน Credentials ทั้งหมด

ไฟล์ `backend/.env` ของคุณมีข้อมูลลับจริงที่ **ต้องเปลี่ยนทันที**:

1. **เปลี่ยนรหัสผ่าน Supabase Database**
   - ไปที่ Supabase Dashboard
   - Settings → Database → Reset password
   - อัพเดท DATABASE_URL ในไฟล์ .env

2. **สร้าง JWT Secret ใหม่**
   ```bash
   # สร้าง random secret
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

   # Copy ค่าที่ได้ไปใส่ใน .env
   JWT_SECRET="ค่าที่ได้จากคำสั่งด้านบน"
   ```

3. **เปลี่ยน Brevo SMTP API Key**
   - ไปที่ https://app.brevo.com/settings/keys/smtp
   - ยกเลิก key เดิม
   - สร้าง key ใหม่
   - อัพเดทในไฟล์ .env

4. **ตรวจสอบว่า .env ไม่ถูก commit ไปใน git**
   ```bash
   git log --all --full-history -- "**/.env"
   ```

   ถ้าพบว่ามีการ commit ไปแล้ว:
   - เปลี่ยน credentials ทั้งหมดทันที
   - พิจารณาลบ git history หรือสร้าง repository ใหม่

## 📚 แนะนำการใช้งานต่อ

### การใช้ Dropdown Component แทน Custom Dropdowns

**ไฟล์ที่ควร refactor:**
1. `frontend/src/components/processor/ProcessorWorkbench.tsx`
   - ProcessTypeDropdown (line 24-95)
   - GradeDropdown (line 98-150)

2. ไฟล์อื่นๆ ที่มี custom dropdown

### การใช้ Logger แทน console.error

**ไฟล์ที่ควร refactor (50+ ไฟล์):**

ค้นหา pattern นี้:
```typescript
console.error('Error message:', error);
```

แทนที่ด้วย:
```typescript
import { logger } from '../utils/logger';
logger.error('Error message', error);
```

### การเพิ่ม Error Boundary

**แนะนำให้เพิ่มใน:**
1. `frontend/src/App.tsx` - Wrap ทั้งแอป
2. `frontend/src/components/farmer/FarmerDashboard.tsx`
3. `frontend/src/components/processor/ProcessorWorkbench.tsx`
4. `frontend/src/components/roaster/RoasterWorkbench.tsx`

## 🎯 การ Refactor ขั้นต่อไป

### 1. แยก ProcessorWorkbench.tsx (3,019 lines)

สร้างโครงสร้างใหม่:
```
components/processor/
├── ProcessorWorkbench/
│   ├── index.tsx                    # Main container (~200 lines)
│   ├── components/
│   │   ├── BatchKanbanView.tsx
│   │   ├── BatchTableView.tsx
│   │   ├── ParchmentInventory.tsx
│   │   └── GreenBeanInventory.tsx
│   ├── hooks/
│   │   ├── useProcessorData.ts
│   │   └── useBatchOperations.ts
│   └── types.ts
```

### 2. แยก Business Logic จาก API Routes

สร้าง service layer:
```
backend/src/
├── app/api/users/route.ts           # HTTP handlers (~50 lines)
└── services/
    └── userService.ts               # Business logic (~150 lines)
```

### 3. เพิ่ม TypeScript Strict Mode

อัพเดท `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

## 📞 การติดต่อสนับสนุน

หากมีคำถามหรือพบปัญหา:
1. ตรวจสอบ console logs
2. ตรวจสอบไฟล์ .env ว่าตั้งค่าถูกต้อง
3. ดู error boundary UI สำหรับรายละเอียดข้อผิดพลาด

---

อัพเดทล่าสุด: 2026-01-24
