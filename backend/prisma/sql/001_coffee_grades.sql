-- Coffee grades: the list behind every grade dropdown.
--
-- Run this once in the Supabase SQL Editor before (or right after) deploying
-- the CoffeeGrade feature. Deploys run `prisma generate`, not `db push`, so
-- the table has to be created here.
--
-- Safe to re-run: every statement is guarded.

CREATE TABLE IF NOT EXISTS "CoffeeGrade" (
    "id"          TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "sortOrder"   INTEGER      NOT NULL DEFAULT 0,
    "isActive"    BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoffeeGrade_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CoffeeGrade_name_key"       ON "CoffeeGrade" ("name");
CREATE        INDEX IF NOT EXISTS "CoffeeGrade_isActive_idx"   ON "CoffeeGrade" ("isActive");
CREATE        INDEX IF NOT EXISTS "CoffeeGrade_sortOrder_idx"  ON "CoffeeGrade" ("sortOrder");
CREATE        INDEX IF NOT EXISTS "CoffeeGrade_updatedAt_idx"  ON "CoffeeGrade" ("updatedAt");

-- The eight grades the app shipped with, in the order the dropdowns used to
-- show them. sortOrder is spaced by 10 so a new grade can be slotted between
-- two existing ones without renumbering.
INSERT INTO "CoffeeGrade" ("id", "name", "description", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
    (gen_random_uuid(), 'Grade A',   'เกรดพรีเมียม คัดคุณภาพสูงสุด',        10, true, NOW(), NOW()),
    (gen_random_uuid(), 'Grade B',   'เกรดมาตรฐาน',                        20, true, NOW(), NOW()),
    (gen_random_uuid(), 'Grade C',   'เกรดรอง',                            30, true, NOW(), NOW()),
    (gen_random_uuid(), 'Peaberry',  'เมล็ดกลมเดี่ยว ไม่แยกเป็นสองซีกตามปกติ', 40, true, NOW(), NOW()),
    (gen_random_uuid(), 'Screen 18', 'ขนาดตะแกรง 18 (เมล็ดใหญ่ที่สุด)',      50, true, NOW(), NOW()),
    (gen_random_uuid(), 'Screen 17', 'ขนาดตะแกรง 17',                      60, true, NOW(), NOW()),
    (gen_random_uuid(), 'Screen 16', 'ขนาดตะแกรง 16',                      70, true, NOW(), NOW()),
    (gen_random_uuid(), 'Screen 15', 'ขนาดตะแกรง 15',                      80, true, NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;

-- Check: should return the eight rows above, in dropdown order.
SELECT "name", "sortOrder", "isActive" FROM "CoffeeGrade" ORDER BY "sortOrder", "name";
