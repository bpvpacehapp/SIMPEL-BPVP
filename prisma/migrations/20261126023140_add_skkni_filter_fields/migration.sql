-- AlterTable
ALTER TABLE "skkni_documents" ADD COLUMN     "agency_id" TEXT,
ADD COLUMN     "agency_name" TEXT,
ADD COLUMN     "year" INTEGER;

-- CreateIndex
CREATE INDEX "skkni_documents_year_idx" ON "skkni_documents"("year");

-- CreateIndex
CREATE INDEX "skkni_documents_agency_name_idx" ON "skkni_documents"("agency_name");
