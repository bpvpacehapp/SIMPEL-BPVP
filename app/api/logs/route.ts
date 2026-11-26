import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const modul = sp.get("modul")?.trim() || "";
  const aksi = sp.get("aksi")?.trim() || "";
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit") || "15") || 15));

  const where: Prisma.LogAktivitasWhereInput = {};

  if (search) {
    where.OR = [
      { userName: { contains: search, mode: "insensitive" } },
      { aksi: { contains: search, mode: "insensitive" } },
      { modul: { contains: search, mode: "insensitive" } },
      { detail: { contains: search, mode: "insensitive" } },
      { ipAddress: { contains: search, mode: "insensitive" } },
    ];
  }

  if (modul) where.modul = modul;
  if (aksi) where.aksi = aksi;

  const [total, logs, distinctModuls, distinctAksis] = await Promise.all([
    prisma.logAktivitas.count({ where }),
    prisma.logAktivitas.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        userId: true,
        userName: true,
        aksi: true,
        modul: true,
        detail: true,
        dataSebelum: true,
        dataSesudah: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
    prisma.logAktivitas.findMany({
      distinct: ["modul"],
      select: { modul: true },
      orderBy: { modul: "asc" },
    }),
    prisma.logAktivitas.findMany({
      distinct: ["aksi"],
      select: { aksi: true },
      orderBy: { aksi: "asc" },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: logs,
    filterOptions: {
      moduls: distinctModuls.map((m) => m.modul).filter(Boolean),
      aksis: distinctAksis.map((a) => a.aksi).filter(Boolean),
    },
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}
