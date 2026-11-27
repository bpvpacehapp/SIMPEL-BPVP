-- CreateTable
CREATE TABLE "jenis_pelatihan" (
    "id" TEXT NOT NULL,
    "jenis_pelatihan" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jenis_pelatihan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jenis_pelatihan_deleted_at_idx" ON "jenis_pelatihan"("deleted_at");

-- CreateIndex
CREATE INDEX "jenis_pelatihan_jenis_pelatihan_idx" ON "jenis_pelatihan"("jenis_pelatihan");
