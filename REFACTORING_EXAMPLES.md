# ตัวอย่างการ Refactor โค้ด

เอกสารนี้แสดงตัวอย่างการ refactor โค้ดเดิมให้ใช้ components และ utilities ใหม่

## 1. แทนที่ Custom Dropdown ด้วย Reusable Dropdown Component

### ตัวอย่าง: ProcessorWorkbench.tsx

#### ก่อน Refactor

```typescript
// ProcessorWorkbench.tsx (lines 24-95)
const ProcessTypeDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  processTypes: { value: string; label: string; }[];
}> = ({ value, onChange, processTypes }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ... 70+ lines of dropdown logic
};

// Usage in component
<ProcessTypeDropdown
  value={formData.processTypeId}
  onChange={(value) => setFormData({...formData, processTypeId: value})}
  processTypes={processTypeOptions}
/>
```

#### หลัง Refactor

```typescript
// Remove custom ProcessTypeDropdown component entirely

// Import reusable Dropdown
import { Dropdown, DropdownOption } from '../common';

// Usage in component
<Dropdown
  value={formData.processTypeId}
  onChange={(value) => setFormData({...formData, processTypeId: value})}
  options={processTypeOptions}
  label="Process Type"
  placeholder="Select process type"
  required
/>
```

**ผลลัพธ์:**
- ลดโค้ดลง ~70 บรรทัด
- ใช้ component ที่ทดสอบและบำรุงรักษาได้ง่าย
- มี features เพิ่มเติม (label, error, required)

---

## 2. แทนที่ console.error ด้วย Logger

### ตัวอย่าง: farmService.ts

#### ก่อน Refactor

```typescript
// farmService.ts
export const getFarms = async (): Promise<Farm[]> => {
  try {
    const response = await api.get('/farms');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch farms:', error);
    throw error;
  }
};
```

#### หลัง Refactor

```typescript
import { logger } from '../utils/logger';

export const getFarms = async (): Promise<Farm[]> => {
  try {
    const response = await api.get('/farms');
    logger.info('Farms fetched successfully', { count: response.data.length });
    return response.data;
  } catch (error) {
    logger.error('Failed to fetch farms', error, { endpoint: '/farms' });
    throw error;
  }
};
```

**ผลลัพธ์:**
- Log ที่มีโครงสร้างและ context
- พร้อมเชื่อมต่อกับ monitoring service
- แยก log levels (info, error)
- ไม่แสดง log ใน production (ตามการตั้งค่า)

---

## 3. เพิ่ม Error Boundary

### ตัวอย่าง: App.tsx

#### ก่อน Refactor

```typescript
// App.tsx
import { Routes, Route } from 'react-router-dom';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/farmer" element={<FarmerDashboard />} />
        <Route path="/processor" element={<ProcessorWorkbench />} />
        {/* ... more routes */}
      </Routes>
    </AuthProvider>
  );
}
```

#### หลัง Refactor

```typescript
import ErrorBoundary from './components/common/ErrorBoundary';
import { Routes, Route } from 'react-router-dom';
import { logger } from './utils/logger';

function App() {
  const handleError = (error: Error, errorInfo: ErrorInfo) => {
    // Log to monitoring service
    logger.error('React Error Boundary caught error', error, {
      componentStack: errorInfo.componentStack
    });
  };

  return (
    <ErrorBoundary onError={handleError}>
      <AuthProvider>
        <Routes>
          <Route
            path="/farmer"
            element={
              <ErrorBoundary>
                <FarmerDashboard />
              </ErrorBoundary>
            }
          />
          <Route
            path="/processor"
            element={
              <ErrorBoundary>
                <ProcessorWorkbench />
              </ErrorBoundary>
            }
          />
          {/* ... more routes */}
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  );
}
```

**ผลลัพธ์:**
- จับ runtime errors ได้ทั้งแอป
- แสดง UI ที่เป็นมิตรกับผู้ใช้เมื่อเกิด error
- แยก error boundaries ตาม section
- Log errors อย่างเป็นระบบ

---

## 4. ตัวอย่างการใช้ Logger ในหลาย Scenarios

### A. การ fetch ข้อมูล

```typescript
// Before
try {
  const data = await fetchHarvestLots();
  setHarvestLots(data);
} catch (error) {
  console.error('Error fetching harvest lots:', error);
}

// After
import { logger } from '../utils/logger';

try {
  const data = await fetchHarvestLots();
  logger.info('Harvest lots loaded', { count: data.length });
  setHarvestLots(data);
} catch (error) {
  logger.error('Failed to fetch harvest lots', error, {
    farmId: selectedFarm?.id
  });
}
```

### B. การบันทึกข้อมูล

```typescript
// Before
const handleSubmit = async () => {
  try {
    await createProcessingBatch(formData);
    console.log('Batch created successfully');
  } catch (error) {
    console.error('Failed to create batch:', error);
  }
};

// After
import { logger } from '../utils/logger';

const handleSubmit = async () => {
  try {
    const batch = await createProcessingBatch(formData);
    logger.info('Processing batch created', {
      batchId: batch.id,
      processType: formData.processTypeId
    });
  } catch (error) {
    logger.error('Failed to create processing batch', error, {
      processType: formData.processTypeId,
      harvestLotCount: formData.harvestLots.length
    });
  }
};
```

### C. Debug logging

```typescript
// Before
console.log('Form data:', formData);

// After
import { logger } from '../utils/logger';

logger.debug('Form validation', {
  formData,
  isValid: validateForm(formData)
});
// จะแสดงเฉพาะใน development mode
```

---

## 5. การสร้าง Dropdown แบบ Advanced

### Dropdown พร้อม Description

```typescript
import { Dropdown, DropdownOption } from '../components/common';

const processOptions: DropdownOption[] = [
  {
    value: 'washed',
    label: 'Washed Process',
    description: 'Clean, bright flavor profile'
  },
  {
    value: 'natural',
    label: 'Natural Process',
    description: 'Fruity, complex flavors'
  },
  {
    value: 'honey',
    label: 'Honey Process',
    description: 'Sweet, balanced taste'
  }
];

<Dropdown
  value={selectedProcess}
  onChange={setSelectedProcess}
  options={processOptions}
  label="Processing Method"
  required
/>
```

### Dropdown พร้อม Error Handling

```typescript
const [selectedGrade, setSelectedGrade] = useState('');
const [error, setError] = useState('');

const handleSubmit = () => {
  if (!selectedGrade) {
    setError('Please select a grade');
    return;
  }
  setError('');
  // Continue with submission
};

<Dropdown
  value={selectedGrade}
  onChange={(value) => {
    setSelectedGrade(value);
    setError(''); // Clear error on change
  }}
  options={gradeOptions}
  label="Grade"
  required
  error={error}
/>
```

---

## 6. Custom Error Boundary Fallback

### Simple Fallback

```typescript
import ErrorBoundary from '../components/common/ErrorBoundary';

const SimpleFallback = () => (
  <div className="p-8 text-center">
    <h2 className="text-xl font-bold text-red-600">
      เกิดข้อผิดพลาด
    </h2>
    <p className="text-gray-600 mt-2">
      กรุณารีเฟรชหน้านี้
    </p>
  </div>
);

<ErrorBoundary fallback={<SimpleFallback />}>
  <ComplexComponent />
</ErrorBoundary>
```

### Dashboard-specific Fallback

```typescript
const DashboardErrorFallback = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        ไม่สามารถโหลด Dashboard ได้
      </h2>
      <p className="text-gray-600 mb-6">
        เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่อีกครั้ง
      </p>
      <button
        onClick={() => window.location.reload()}
        className="w-full bg-indigo-600 text-white px-6 py-3 rounded-lg"
      >
        รีเฟรชหน้านี้
      </button>
    </div>
  </div>
);

<ErrorBoundary fallback={<DashboardErrorFallback />}>
  <FarmerDashboard />
</ErrorBoundary>
```

---

## 7. ตัวอย่างการ Refactor Component ขนาดใหญ่

### แยก ProcessorWorkbench.tsx

#### โครงสร้างเดิม (3,019 lines)
```
ProcessorWorkbench.tsx (3,019 lines)
├── ProcessTypeDropdown component (72 lines)
├── GradeDropdown component (52 lines)
├── Main component logic (2,895 lines)
│   ├── State management (200+ lines)
│   ├── Kanban view (500+ lines)
│   ├── Table view (400+ lines)
│   ├── Parchment inventory (800+ lines)
│   └── Green bean inventory (800+ lines)
```

#### โครงสร้างใหม่ (แนะนำ)
```
components/processor/
├── ProcessorWorkbench/
│   ├── index.tsx                          (~150 lines)
│   │   - Main container
│   │   - Layout and routing
│   │
│   ├── components/
│   │   ├── BatchKanbanView.tsx           (~300 lines)
│   │   ├── BatchTableView.tsx            (~250 lines)
│   │   ├── ParchmentInventory.tsx        (~400 lines)
│   │   ├── GreenBeanInventory.tsx        (~400 lines)
│   │   └── BatchFilters.tsx              (~100 lines)
│   │
│   ├── hooks/
│   │   ├── useProcessorData.ts           (~150 lines)
│   │   │   - Fetch all data
│   │   │   - Handle loading states
│   │   │
│   │   ├── useBatchOperations.ts         (~200 lines)
│   │   │   - CRUD operations
│   │   │   - Batch status updates
│   │   │
│   │   └── useInventoryFilters.ts        (~100 lines)
│   │       - Filter and sort logic
│   │
│   ├── modals/
│   │   ├── StartProcessingModal.tsx      (existing)
│   │   ├── HullAndGradeModal.tsx         (existing)
│   │   └── CompleteBatchModal.tsx        (existing)
│   │
│   └── types.ts                          (~50 lines)
│       - Local types and interfaces
```

#### ตัวอย่างโค้ดที่ถูก refactor:

**hooks/useProcessorData.ts**
```typescript
import { useState, useEffect } from 'react';
import { logger } from '../../../utils/logger';

export function useProcessorData() {
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [parchmentLots, setParchmentLots] = useState([]);
  const [greenBeanLots, setGreenBeanLots] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [batchesData, parchmentData, greenBeanData] = await Promise.all([
        fetchProcessingBatches(),
        fetchParchmentLots(),
        fetchGreenBeanLots()
      ]);

      setBatches(batchesData);
      setParchmentLots(parchmentData);
      setGreenBeanLots(greenBeanData);

      logger.info('Processor data loaded', {
        batches: batchesData.length,
        parchment: parchmentData.length,
        greenBean: greenBeanData.length
      });
    } catch (error) {
      logger.error('Failed to load processor data', error);
    } finally {
      setLoading(false);
    }
  };

  return { loading, batches, parchmentLots, greenBeanLots, reload: loadData };
}
```

**index.tsx**
```typescript
import ErrorBoundary from '../../common/ErrorBoundary';
import { useProcessorData } from './hooks/useProcessorData';
import BatchKanbanView from './components/BatchKanbanView';
import ParchmentInventory from './components/ParchmentInventory';

export default function ProcessorWorkbench() {
  const { loading, batches, parchmentLots, greenBeanLots, reload } = useProcessorData();
  const [activeTab, setActiveTab] = useState('batches');

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="processor-workbench">
      <ErrorBoundary>
        {activeTab === 'batches' && (
          <BatchKanbanView batches={batches} onUpdate={reload} />
        )}
        {activeTab === 'parchment' && (
          <ParchmentInventory lots={parchmentLots} onUpdate={reload} />
        )}
        {/* ... other tabs */}
      </ErrorBoundary>
    </div>
  );
}
```

---

## สรุป

การ refactor เหล่านี้จะช่วย:
- ✅ ลดขนาดไฟล์และความซับซ้อน
- ✅ เพิ่มความสามารถในการนำโค้ดกลับมาใช้ใหม่
- ✅ ทำให้ทดสอบได้ง่ายขึ้น
- ✅ ปรับปรุงการจัดการ errors
- ✅ มี logging ที่ดีขึ้น
- ✅ บำรุงรักษาได้ง่ายขึ้น

เริ่มต้นจากการ refactor ทีละส่วนเล็กๆ และทดสอบให้แน่ใจว่าทุกอย่างยังทำงานได้ตามปกติก่อนดำเนินการต่อ
