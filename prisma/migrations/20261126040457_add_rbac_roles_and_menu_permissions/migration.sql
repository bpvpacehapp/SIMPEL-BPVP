-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ADMIN_SUB_UNIT';

-- CreateTable
CREATE TABLE "role_menu_permissions" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "menu_key" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_menu_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_menu_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "menu_key" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_menu_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_menu_permissions_role_idx" ON "role_menu_permissions"("role");

-- CreateIndex
CREATE UNIQUE INDEX "role_menu_permissions_role_menu_key_key" ON "role_menu_permissions"("role", "menu_key");

-- CreateIndex
CREATE INDEX "user_menu_permissions_user_id_idx" ON "user_menu_permissions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_menu_permissions_user_id_menu_key_key" ON "user_menu_permissions"("user_id", "menu_key");

-- AddForeignKey
ALTER TABLE "user_menu_permissions" ADD CONSTRAINT "user_menu_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
