-- AlterTable
ALTER TABLE "proglat_programs" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "proglat_programs_deleted_at_idx" ON "proglat_programs"("deleted_at");
