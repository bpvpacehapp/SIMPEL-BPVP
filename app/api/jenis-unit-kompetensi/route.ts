import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessMenu } from "@/lib/rbac";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canUserAccessMenu(
    session.user.id,
    session.user.role,
    "administrasi.jenis_unit"
  );
  if (!allowed) {
    return NextResponse.json(
      {
        message:
          "Anda tidak memiliki izin mengakses menu Jenis Unit Kompetensi.",
      },
      { status: 403 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const status = sp.get("status")?.trim() || "aktif";
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);
  const limit = Math.min(
    50,
    Math.max(1, Number(sp.get("limit") || "15") || 15)
  );

  const where: Prisma.JenisUnitKompetensiWhereInput = {};

  if (status === "aktif") {
    where.deletedAt = null;
  } else if (status === "terhapus") {
    where.deletedAt = { not: null };
  }

  if (search) {
    where.jenisUnit = { contains: search, mode: "insensitive" };
  }

  const [totalAktif, totalTerhapus, filteredTotal, rows] = await Promise.all([
    prisma.jenisUnitKompetensi.count({ where: { deletedAt: null } }),
    prisma.jenisUnitKompetensi.count({ where: { deletedAt: { not: null } } }),
    prisma.jenisUnitKompetensi.count({ where }),
    prisma.jenisUnitKompetensi.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { jenisUnit: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    success: true,
    stats: {
      totalAktif,
      totalTerhapus,
    },
    data: rows,
    pagination: {
      total: filteredTotal,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(filteredTotal / limit)),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canUserAccessMenu(
    session.user.id,
    session.user.role,
    "administrasi.jenis_unit"
  );
  if (!allowed || session.user.role === "USER") {
    return NextResponse.json(
      {
        message:
          "Hanya Administrator, Super Administrator, atau Admin Sub Unit berizin yang dapat menambahkan Jenis Unit Kompetensi.",
      },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json()) as { jenisUnit?: string };
    const jenisUnit = body.jenisUnit?.trim() || "";

    if (!jenisUnit) {
      return NextResponse.json(
        { message: "Nama Jenis Unit wajib diisi." },
        { status: 400 }
      );
    }

    const duplicate = await prisma.jenisUnitKompetensi.findFirst({
      where: {
        deletedAt: null,
        jenisUnit: { equals: jenisUnit, mode: "insensitive" },
      },
    });
    if (duplicate) {
      return NextResponse.json(
        { message: `Jenis unit "${jenisUnit}" sudah terdaftar.` },
        { status: 409 }
      );
    }

    const created = await prisma.jenisUnitKompetensi.create({
      data: { jenisUnit },
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "TAMBAH_JENIS_UNIT",
      modul: "ADMINISTRASI_JENIS_UNIT",
      detail: `Menambahkan jenis unit kompetensi "${created.jenisUnit}".`,
      dataSesudah: { id: created.id, jenisUnit: created.jenisUnit },
      ipAddress: extractClientIp(req.headers),
    });

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: `Jenis unit "${created.jenisUnit}" berhasil ditambahkan.`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API JENIS UNIT POST] Error:", error);
    return NextResponse.json(
      { message: "Gagal menambahkan Jenis Unit Kompetensi." },
      { status: 500 }
    );
  }
}
