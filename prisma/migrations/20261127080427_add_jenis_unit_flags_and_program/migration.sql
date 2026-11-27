-- AlterTable
ALTER TABLE "jenis_unit_kompetensi" ADD COLUMN     "memiliki_program_tersendiri" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "memiliki_sk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "memiliki_surat_keputusan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "program_id" TEXT;

-- CreateIndex
CREATE INDEX "jenis_unit_kompetensi_program_id_idx" ON "jenis_unit_kompetensi"("program_id");

-- AddForeignKey
ALTER TABLE "jenis_unit_kompetensi" ADD CONSTRAINT "jenis_unit_kompetensi_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "proglat_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
