-- AlterTable
ALTER TABLE "proglat_programs" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'UNIT_SKKNI',
ADD COLUMN     "published_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "proglat_programs_category_idx" ON "proglat_programs"("category");
