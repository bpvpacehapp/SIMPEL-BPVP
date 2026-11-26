import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = (
    process.env.SEED_SUPERADMIN_EMAIL || "admin@bpvp.kemnaker.go.id"
  )
    .trim()
    .toLowerCase();
  const nama = (
    process.env.SEED_SUPERADMIN_NAMA || "Administrator Sistem"
  ).trim();

  const superAdmin = await prisma.user.upsert({
    where: { email },
    update: {
      nama,
      role: Role.SUPER_ADMIN,
      deletedAt: null,
    },
    create: {
      email,
      nama,
      nip: "199001012020011001",
      jabatan: "Administrator Sistem",
      unitKerja: "Balai Pelatihan Vokasi dan Produktivitas Banda Aceh",
      subUnitKerja: "Subbagian Umum",
      role: Role.SUPER_ADMIN,
      pegawaiId: "peg-001",
    },
  });

  await prisma.logAktivitas.create({
    data: {
      userId: superAdmin.id,
      userName: superAdmin.nama,
      aksi: "SEED_SUPER_ADMIN",
      modul: "SISTEM",
      detail: `Inisialisasi Super Admin awal (${superAdmin.email})`,
    },
  });

  console.log(`Seed selesai: ${superAdmin.nama} (${superAdmin.email}) [${superAdmin.role}]`);
}

main()
  .catch((e) => {
    console.error("Gagal menjalankan seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
