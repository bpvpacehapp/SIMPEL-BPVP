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

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const availability = sp.get("availability")?.trim() || "applied";
  const yearParam = sp.get("year")?.trim() || "";
  const sectorParam = sp.get("sector")?.trim() || "";
  const agencyParam = sp.get("agency")?.trim() || "";
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit") || "15") || 15));

  const where: Prisma.SkkniDocumentWhereInput = {};

  if (search) {
    where.OR = [
      { numberKepmen: { contains: search, mode: "insensitive" } },
      { sector: { contains: search, mode: "insensitive" } },
      { agencyName: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
    ];
  }

  if (availability === "applied" || availability === "cancelled") {
    where.availability = availability;
  }

  if (yearParam && /^\d{4}$/.test(yearParam)) {
    where.year = Number(yearParam);
  }

  if (sectorParam) {
    where.sector = sectorParam;
  }

  if (agencyParam) {
    where.agencyName = agencyParam;
  }

  const [
    totalDokumen,
    totalUnitKerja,
    jumlahBerlaku,
    jumlahDicabut,
    filteredTotal,
    documents,
    distinctYears,
    distinctSectors,
    distinctAgencies,
  ] = await Promise.all([
    prisma.skkniDocument.count(),
    prisma.skkniUnit.count(),
    prisma.skkniDocument.count({ where: { availability: "applied" } }),
    prisma.skkniDocument.count({ where: { availability: "cancelled" } }),
    prisma.skkniDocument.count({ where }),
    prisma.skkniDocument.findMany({
      where,
      orderBy: [{ year: "desc" }, { syncedAt: "desc" }, { numberKepmen: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        units: {
          orderBy: { code: "asc" },
          select: {
            id: true,
            code: true,
            title: true,
            titleEn: true,
            availability: true,
          },
        },
      },
    }),
    prisma.skkniDocument.findMany({
      where: { year: { not: null } },
      distinct: ["year"],
      select: { year: true },
      orderBy: { year: "desc" },
    }),
    prisma.skkniDocument.findMany({
      distinct: ["sector"],
      select: { sector: true },
      orderBy: { sector: "asc" },
    }),
    prisma.skkniDocument.findMany({
      where: { agencyName: { not: null } },
      distinct: ["agencyName"],
      select: { agencyName: true },
      orderBy: { agencyName: "asc" },
    }),
  ]);

  return NextResponse.json({
    success: true,
    stats: {
      totalDokumen,
      totalUnitKerja,
      jumlahBerlaku,
      jumlahDicabut,
    },
    filterOptions: {
      years: distinctYears
        .map((y) => y.year)
        .filter((y): y is number => typeof y === "number"),
      sectors: distinctSectors.map((s) => s.sector).filter(Boolean),
      agencies: distinctAgencies
        .map((a) => a.agencyName)
        .filter((a): a is string => Boolean(a)),
    },
    data: documents,
    pagination: {
      total: filteredTotal,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(filteredTotal / limit)),
    },
  });
}
