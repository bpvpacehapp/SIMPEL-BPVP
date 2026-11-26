import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma, Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";

const VALID_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ADMIN_SUB_UNIT,
  Role.USER,
];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const roleParam = sp.get("role")?.trim() || "";
  const statusParam = sp.get("status")?.trim() || "semua";
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") || "10") || 10));

  const where: Prisma.UserWhereInput = {};

  if (search) {
    where.OR = [
      { nama: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { nip: { contains: search, mode: "insensitive" } },
      { jabatan: { contains: search, mode: "insensitive" } },
    ];
  }

  if (roleParam && VALID_ROLES.includes(roleParam as Role)) {
    where.role = roleParam as Role;
  }

  if (statusParam === "aktif") {
    where.deletedAt = null;
  } else if (statusParam === "nonaktif") {
    where.deletedAt = { not: null };
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ deletedAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        nama: true,
        email: true,
        nip: true,
        jabatan: true,
        unitKerja: true,
        subUnitKerja: true,
        role: true,
        deletedAt: true,
        fotoUrl: true,
        pegawaiId: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: users,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      nama?: string;
      email?: string;
      nip?: string | null;
      jabatan?: string | null;
      unitKerja?: string | null;
      subUnitKerja?: string | null;
      fotoUrl?: string | null;
      pegawaiId?: string | null;
      role?: Role;
    };

    const nama = body.nama?.trim();
    const email = body.email?.trim().toLowerCase();
    const nip = body.nip?.trim() || null;
    const role: Role =
      body.role && VALID_ROLES.includes(body.role) ? body.role : Role.USER;

    if (!nama || !email) {
      return NextResponse.json(
        { message: "Nama dan email pegawai wajib diisi." },
        { status: 400 }
      );
    }

    if (role === Role.SUPER_ADMIN && session.user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json(
        { message: "Hanya SUPER_ADMIN yang dapat menetapkan role SUPER_ADMIN." },
        { status: 403 }
      );
    }

    const duplicateChecks: Prisma.UserWhereInput[] = [{ email }];
    if (nip) duplicateChecks.push({ nip });

    const existing = await prisma.user.findFirst({
      where: { OR: duplicateChecks },
      select: { id: true, email: true, nip: true },
    });

    if (existing) {
      return NextResponse.json(
        {
          message:
            existing.email === email
              ? `Email ${email} sudah terdaftar di aplikasi.`
              : `NIP ${nip} sudah terdaftar di aplikasi.`,
        },
        { status: 409 }
      );
    }

    const created = await prisma.user.create({
      data: {
        nama,
        email,
        nip,
        jabatan: body.jabatan?.trim() || null,
        unitKerja: body.unitKerja?.trim() || null,
        subUnitKerja: body.subUnitKerja?.trim() || null,
        fotoUrl: body.fotoUrl?.trim() || null,
        pegawaiId: body.pegawaiId?.trim() || null,
        role,
      },
      select: {
        id: true,
        nama: true,
        email: true,
        nip: true,
        jabatan: true,
        unitKerja: true,
        subUnitKerja: true,
        role: true,
        deletedAt: true,
        pegawaiId: true,
        createdAt: true,
      },
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "TAMBAH_USER",
      modul: "MANAJEMEN_USER",
      detail: `Mendaftarkan pengguna baru ${created.nama} (${created.email}) sebagai ${created.role}`,
      dataSesudah: created,
      ipAddress: extractClientIp(req.headers),
    });

    return NextResponse.json(
      { success: true, data: created },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API USERS POST] Error:", error);
    return NextResponse.json(
      { message: "Gagal menambahkan pengguna baru." },
      { status: 500 }
    );
  }
}
