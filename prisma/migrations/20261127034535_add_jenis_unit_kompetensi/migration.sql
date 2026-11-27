-- CreateTable
CREATE TABLE "jenis_unit_kompetensi" (
    "id" TEXT NOT NULL,
    "jenis_unit" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jenis_unit_kompetensi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jenis_unit_kompetensi_deleted_at_idx" ON "jenis_unit_kompetensi"("deleted_at");

-- CreateIndex
CREATE INDEX "jenis_unit_kompetensi_jenis_unit_idx" ON "jenis_unit_kompetensi"("jenis_unit");
