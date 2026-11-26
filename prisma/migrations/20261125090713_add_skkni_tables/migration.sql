-- CreateTable
CREATE TABLE "skkni_documents" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "number_kepmen" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "title" TEXT,
    "availability" TEXT NOT NULL,
    "status" TEXT,
    "notes" TEXT,
    "published_at" TEXT,
    "file_name" TEXT,
    "file_path" TEXT,
    "tags" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skkni_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skkni_units" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "title_en" TEXT,
    "availability" TEXT,

    CONSTRAINT "skkni_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skkni_documents_availability_idx" ON "skkni_documents"("availability");

-- CreateIndex
CREATE INDEX "skkni_documents_number_kepmen_idx" ON "skkni_documents"("number_kepmen");

-- CreateIndex
CREATE INDEX "skkni_units_document_id_idx" ON "skkni_units"("document_id");

-- CreateIndex
CREATE INDEX "skkni_units_code_idx" ON "skkni_units"("code");

-- AddForeignKey
ALTER TABLE "skkni_units" ADD CONSTRAINT "skkni_units_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "skkni_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
