-- DropForeignKey
ALTER TABLE "jenis_unit_kompetensi" DROP CONSTRAINT "jenis_unit_kompetensi_program_id_fkey";

-- DropForeignKey
ALTER TABLE "proglat_topics" DROP CONSTRAINT "proglat_topics_jenis_unit_id_fkey";

-- CreateIndex
CREATE INDEX "proglat_topics_skkni_id_idx" ON "proglat_topics"("skkni_id");

-- CreateIndex
CREATE INDEX "proglat_topics_skkni_unit_id_idx" ON "proglat_topics"("skkni_unit_id");

-- AddForeignKey
ALTER TABLE "proglat_topics" ADD CONSTRAINT "proglat_topics_jenis_unit_id_fkey" FOREIGN KEY ("jenis_unit_id") REFERENCES "jenis_unit_kompetensi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proglat_topics" ADD CONSTRAINT "proglat_topics_skkni_id_fkey" FOREIGN KEY ("skkni_id") REFERENCES "skkni_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proglat_topics" ADD CONSTRAINT "proglat_topics_skkni_unit_id_fkey" FOREIGN KEY ("skkni_unit_id") REFERENCES "skkni_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jenis_unit_kompetensi" ADD CONSTRAINT "jenis_unit_kompetensi_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "proglat_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
