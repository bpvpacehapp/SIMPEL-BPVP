-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'USER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nip" TEXT,
    "jabatan" TEXT,
    "unit_kerja" TEXT,
    "sub_unit_kerja" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "deleted_at" TIMESTAMP(3),
    "password" TEXT,
    "foto_url" TEXT,
    "pegawai_id" TEXT,
    "session_token" TEXT,
    "token_expired_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_aktivitas" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_name" TEXT,
    "aksi" TEXT NOT NULL,
    "modul" TEXT NOT NULL,
    "detail" TEXT,
    "data_sebelum" JSONB,
    "data_sesudah" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_aktivitas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_nip_key" ON "users"("nip");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "log_aktivitas_created_at_idx" ON "log_aktivitas"("created_at");

-- CreateIndex
CREATE INDEX "log_aktivitas_modul_idx" ON "log_aktivitas"("modul");

-- AddForeignKey
ALTER TABLE "log_aktivitas" ADD CONSTRAINT "log_aktivitas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
