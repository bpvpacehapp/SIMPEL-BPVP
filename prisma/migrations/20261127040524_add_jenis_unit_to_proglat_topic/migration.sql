-- AlterTable
ALTER TABLE "proglat_topics" ADD COLUMN     "jenis_unit_id" TEXT;

-- CreateIndex
CREATE INDEX "proglat_topics_jenis_unit_id_idx" ON "proglat_topics"("jenis_unit_id");

-- AddForeignKey
ALTER TABLE "proglat_topics" ADD CONSTRAINT "proglat_topics_jenis_unit_id_fkey" FOREIGN KEY ("jenis_unit_id") REFERENCES "jenis_unit_kompetensi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
