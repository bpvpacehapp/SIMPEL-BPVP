import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessMenu } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canUserAccessMenu(
    session.user.id,
    session.user.role,
    "administrasi.proglat"
  );
  if (!allowed) {
    return NextResponse.json(
      { message: "Anda tidak memiliki izin mengakses menu Program Pelatihan." },
      { status: 403 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const typeParam = sp.get("type")?.trim() || "";
  const vocationalParam = sp.get("vocational")?.trim() || "";
  const editFilter = sp.get("editFilter")?.trim() || "semua";
  const statusFilter = sp.get("status")?.trim() || "aktif";
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);
  const limit = Math.min(
    50,
    Math.max(1, Number(sp.get("limit") || "15") || 15)
  );

  const where: Prisma.ProglatProgramWhereInput = {};

  if (statusFilter === "aktif") {
    where.deletedAt = null;
  } else if (statusFilter === "terhapus") {
    where.deletedAt = { not: null };
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { vocationalName: { contains: search, mode: "insensitive" } },
      { subVocationalName: { contains: search, mode: "insensitive" } },
    ];
  }

  if (typeParam) {
    where.type = typeParam;
  }

  if (vocationalParam) {
    where.vocationalName = vocationalParam;
  }

  if (editFilter === "manual") {
    where.isManualEdited = true;
  } else if (editFilter === "asli") {
    where.isManualEdited = false;
  }

  const [
    totalProgram,
    totalTopics,
    aggDuration,
    totalManualEdited,
    filteredTotal,
    programs,
    distinctTypes,
    distinctVocationals,
  ] = await Promise.all([
    prisma.proglatProgram.count({ where: { deletedAt: null } }),
    prisma.proglatTopic.count({ where: { program: { deletedAt: null } } }),
    prisma.proglatProgram.aggregate({
      where: { deletedAt: null },
      _sum: { totalDuration: true },
    }),
    prisma.proglatProgram.count({
      where: { deletedAt: null, isManualEdited: true },
    }),
    prisma.proglatProgram.count({ where }),
    prisma.proglatProgram.findMany({
      where,
      orderBy: [{ syncedAt: "desc" }, { title: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        code: true,
        title: true,
        totalModules: true,
        totalDuration: true,
        type: true,
        version: true,
        publishedAt: true,
        vocationalName: true,
        subVocationalName: true,
        downloadMaterialUri: true,
        isManualEdited: true,
        deletedAt: true,
        syncedAt: true,
        _count: { select: { topics: true } },
      },
    }),
    prisma.proglatProgram.findMany({
      where: { type: { not: null } },
      distinct: ["type"],
      select: { type: true },
      orderBy: { type: "asc" },
    }),
    prisma.proglatProgram.findMany({
      where: { vocationalName: { not: null } },
      distinct: ["vocationalName"],
      select: { vocationalName: true },
      orderBy: { vocationalName: "asc" },
    }),
  ]);

  return NextResponse.json({
    success: true,
    stats: {
      totalProgram,
      totalTopics,
      totalDurasiJp: aggDuration._sum.totalDuration ?? 0,
      totalManualEdited,
    },
    filterOptions: {
      types: distinctTypes
        .map((t) => t.type)
        .filter((t): t is string => Boolean(t)),
      vocationals: distinctVocationals
        .map((v) => v.vocationalName)
        .filter((v): v is string => Boolean(v)),
    },
    data: programs,
    pagination: {
      total: filteredTotal,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(filteredTotal / limit)),
    },
  });
}
