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
    "pelatihan.jenis_pelatihan"
  );
  if (!allowed) {
    return NextResponse.json(
      { message: "Anda tidak memiliki izin mengakses menu Jenis Pelatihan." },
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

  const where: Prisma.JenisPelatihanWhereInput = {};

  if (status === "aktif") {
    where.deletedAt = null;
  } else if (status === "terhapus") {
    where.deletedAt = { not: null };
  }

  if (search) {
    where.jenisPelatihan = { contains: search, mode: "insensitive" };
  }

  const [filteredTotal, rows] = await Promise.all([
    prisma.jenisPelatihan.count({ where }),
    prisma.jenisPelatihan.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { jenisPelatihan: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    success: true,
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
    "pelatihan.jenis_pelatihan"
  );
  if (!allowed || session.user.role === "USER") {
    return NextResponse.json(
      {
        message:
          "Hanya Administrator, Super Administrator, atau Admin Sub Unit berizin yang dapat menambahkan Jenis Pelatihan.",
      },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json()) as { jenisPelatihan?: string };
    const jenisPelatihan = body.jenisPelatihan?.trim() || "";

    if (!jenisPelatihan) {
      return NextResponse.json(
        { message: "Nama Jenis Pelatihan wajib diisi." },
        { status: 400 }
      );
    }

    const duplicate = await prisma.jenisPelatihan.findFirst({
      where: {
        deletedAt: null,
        jenisPelatihan: { equals: jenisPelatihan, mode: "insensitive" },
      },
    });
    if (duplicate) {
      return NextResponse.json(
        { message: `Jenis pelatihan "${jenisPelatihan}" sudah terdaftar.` },
        { status: 409 }
      );
    }

    const created = await prisma.jenisPelatihan.create({
      data: { jenisPelatihan },
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "TAMBAH_JENIS_PELATIHAN",
      modul: "PELATIHAN_JENIS",
      detail: `Menambahkan jenis pelatihan "${created.jenisPelatihan}".`,
      dataSesudah: {
        id: created.id,
        jenisPelatihan: created.jenisPelatihan,
      },
      ipAddress: extractClientIp(req.headers),
    });

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: `Jenis pelatihan "${created.jenisPelatihan}" berhasil ditambahkan.`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API JENIS PELATIHAN POST] Error:", error);
    return NextResponse.json(
      { message: "Gagal menambahkan Jenis Pelatihan." },
      { status: 500 }
    );
  }
}
