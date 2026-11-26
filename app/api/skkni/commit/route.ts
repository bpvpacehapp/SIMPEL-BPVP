import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";
import {
  extractSkkniYear,
  fetchAllSkkniDocuments,
  getSnapshotDocumentById,
  type ExternalSkkniDocument,
} from "@/lib/skkni";

type CommitAction = "ADD" | "UPDATE" | "SKIP";

interface CommitSelectionItem {
  id?: string;
  action: CommitAction;
  document?: ExternalSkkniDocument;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      {
        message: "Hanya ADMIN atau SUPER_ADMIN yang dapat menyimpan data SKKNI.",
      },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json()) as {
      mode?: "penuh" | "pilihan";
      skippedCount?: number;
      items?: CommitSelectionItem[];
    };

    const items = Array.isArray(body.items) ? body.items : [];
    let skippedCount =
      typeof body.skippedCount === "number" ? body.skippedCount : 0;

    const activeSelections = items.filter((item) => {
      const id = item?.id || item?.document?.id;
      if (!id || item.action === "SKIP") {
        skippedCount++;
        return false;
      }
      return true;
    });

    if (activeSelections.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          mode: body.mode || "penuh",
          addedCount: 0,
          updatedCount: 0,
          skippedCount,
          totalUnitsSaved: 0,
        },
        message: `Tidak ada perubahan disimpan (${skippedCount} dokumen dilewati).`,
      });
    }

    // Pastikan dokumen lengkap tersedia dari snapshot server (atau refresh jika snapshot sudah kedaluwarsa > 5 menit)
    const missingFromSnapshot = activeSelections.some(
      (s) => !s.document && !getSnapshotDocumentById(s.id!)
    );
    if (missingFromSnapshot) {
      await fetchAllSkkniDocuments(10, { useCache: false });
    }

    const resolvedDocs: Array<{
      action: CommitAction;
      document: ExternalSkkniDocument;
    }> = [];
    for (const sel of activeSelections) {
      const fullDoc =
        sel.document || (sel.id ? getSnapshotDocumentById(sel.id) : null);
      if (fullDoc) {
        resolvedDocs.push({ action: sel.action, document: fullDoc });
      }
    }

    const existingRows = await prisma.skkniDocument.findMany({
      select: { id: true },
    });
    const existingIds = new Set(existingRows.map((r) => r.id));

    let addedCount = 0;
    let updatedCount = 0;
    let totalUnitsSaved = 0;

    const BATCH_SIZE = 25;
    for (let i = 0; i < resolvedDocs.length; i += BATCH_SIZE) {
      const batch = resolvedDocs.slice(i, i + BATCH_SIZE);

      await prisma.$transaction(async (tx) => {
        for (const item of batch) {
          const doc = item.document;
          const exists = existingIds.has(doc.id);

          const numberKepmen = doc.number_kepmen || doc.number || "-";
          const docData = {
            number: doc.number ?? null,
            numberKepmen,
            year:
              typeof doc.year === "number"
                ? doc.year
                : extractSkkniYear(numberKepmen, doc.published_at),
            sector: doc.sector || doc.title || "-",
            title: doc.title ?? null,
            agencyId: doc.agency_id ?? null,
            agencyName: doc.agency_name ?? null,
            availability: doc.availability || "applied",
            status: doc.status ?? null,
            notes: doc.notes ?? null,
            publishedAt: doc.published_at ?? null,
            fileName: doc.file_name ?? null,
            filePath: doc.file_path ?? null,
            tags: Array.isArray(doc.tags) ? doc.tags : [],
            syncedAt: new Date(),
          };

          await tx.skkniDocument.upsert({
            where: { id: doc.id }, // ID asli API Kemnaker
            create: {
              id: doc.id,
              ...docData,
            },
            update: docData,
          });

          if (exists) {
            updatedCount++;
          } else {
            addedCount++;
            existingIds.add(doc.id);
          }

          if (Array.isArray(doc.units)) {
            await tx.skkniUnit.deleteMany({
              where: { documentId: doc.id },
            });

            const validUnits = doc.units
              .filter((u) => Boolean(u?.id))
              .map((u) => ({
                id: u.id, // ID asli unit kompetensi dari API Kemnaker
                documentId: doc.id,
                code: (u.code || "").trim(),
                title: (u.title || "").trim(),
                titleEn: u.title_en ?? null,
                availability: u.availability ?? null,
              }));

            if (validUnits.length > 0) {
              await tx.skkniUnit.createMany({
                data: validUnits,
                skipDuplicates: true,
              });
              totalUnitsSaved += validUnits.length;
            }
          }
        }
      });
    }

    const summary = {
      mode: body.mode || "penuh",
      addedCount,
      updatedCount,
      skippedCount,
      totalUnitsSaved,
    };

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "TARIK_DATA_SKKNI",
      modul: "ADMINISTRASI_SKKNI",
      detail: `Konfirmasi data SKKNI (${summary.mode}): ${addedCount} ditambah, ${updatedCount} diperbarui, ${skippedCount} dilewati (${totalUnitsSaved} unit kompetensi).`,
      dataSesudah: summary,
      ipAddress: extractClientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      summary,
      message: `Berhasil menyimpan data SKKNI: ${addedCount} ditambah, ${updatedCount} diperbarui, ${skippedCount} dilewati.`,
    });
  } catch (error) {
    console.error("[API SKKNI COMMIT] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal menyimpan data SKKNI ke database lokal.",
      },
      { status: 500 }
    );
  }
}
