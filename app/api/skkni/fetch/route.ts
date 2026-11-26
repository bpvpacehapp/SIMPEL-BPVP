import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchAllSkkniDocuments,
  filterSkkniDocuments,
  type SkkniFilterInput,
} from "@/lib/skkni";

function normalizeStr(val?: string | null): string {
  return (val || "").trim();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { message: "Hanya ADMIN atau SUPER_ADMIN yang dapat menarik data SKKNI." },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json()) as {
      mode?: "penuh" | "pilihan";
      filters?: Partial<SkkniFilterInput>;
    };

    const mode = body.mode === "pilihan" ? "pilihan" : "penuh";
    const numberQuery = (
      body.filters?.number ||
      body.filters?.numberKepmen ||
      ""
    ).trim();

    if (mode === "pilihan" && !numberQuery) {
      return NextResponse.json(
        {
          message: "Nomor dokumen wajib diisi pada mode Tarik Pilihan.",
        },
        { status: 400 }
      );
    }

    // Worker pool concurrency=10; mode pilihan boleh memanfaatkan snapshot cache 5 menit jika ada
    const [{ documents, totalFromApi, totalPages }, existingRows] =
      await Promise.all([
        fetchAllSkkniDocuments(10, { useCache: mode === "pilihan" }),
        prisma.skkniDocument.findMany({
          select: {
            id: true,
            numberKepmen: true,
            year: true,
            sector: true,
            agencyName: true,
            availability: true,
            notes: true,
            _count: { select: { units: true } },
          },
        }),
      ]);

    const selectedDocs =
      mode === "pilihan"
        ? filterSkkniDocuments(documents, {
            number: numberQuery,
            year: body.filters?.year?.trim() || undefined,
            sector: body.filters?.sector,
            tag: body.filters?.tag,
          })
        : documents;

    // Smart Diff Check O(1) via Map
    const localMap = new Map(existingRows.map((row) => [row.id, row]));

    let newCount = 0;
    let changedCount = 0;
    let upToDateCount = 0;

    // Kirim payload ringan ke browser (tanpa puluhan ribu objek unit — unit diambil on-demand saat klik "Lihat Unit")
    const previewItems = selectedDocs.map((doc) => {
      const local = localMap.get(doc.id);
      const baseSummary = {
        id: doc.id,
        number_kepmen: doc.number_kepmen,
        year: doc.year ?? null,
        sector: doc.sector,
        agency_name: doc.agency_name ?? null,
        availability: doc.availability,
        notes: doc.notes ?? null,
        unitsCount: doc.units.length,
      };

      if (!local) {
        newCount++;
        return {
          ...baseSummary,
          existsInLocal: false,
          syncStatus: "NEW" as const,
          defaultAction: "ADD" as const,
        };
      }

      const hasChanged =
        normalizeStr(local.numberKepmen) !== normalizeStr(doc.number_kepmen) ||
        (local.year ?? null) !== (doc.year ?? null) ||
        normalizeStr(local.sector) !== normalizeStr(doc.sector) ||
        normalizeStr(local.agencyName) !== normalizeStr(doc.agency_name) ||
        normalizeStr(local.availability) !== normalizeStr(doc.availability) ||
        normalizeStr(local.notes) !== normalizeStr(doc.notes) ||
        local._count.units !== doc.units.length;

      if (hasChanged) {
        changedCount++;
        return {
          ...baseSummary,
          existsInLocal: true,
          syncStatus: "CHANGED" as const,
          defaultAction: "UPDATE" as const,
        };
      }

      upToDateCount++;
      return {
        ...baseSummary,
        existsInLocal: true,
        syncStatus: "UP_TO_DATE" as const,
        defaultAction: "SKIP" as const,
      };
    });

    const isUpToDate =
      previewItems.length > 0 && newCount === 0 && changedCount === 0;

    return NextResponse.json({
      success: true,
      mode,
      meta: {
        totalFromApi,
        totalPages,
        matchedCount: previewItems.length,
        newCount,
        changedCount,
        upToDateCount,
        isUpToDate,
      },
      data: previewItems,
    });
  } catch (error) {
    console.error("[API SKKNI FETCH] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal menarik data dari API SKKNI Kemnaker.",
      },
      { status: 502 }
    );
  }
}
