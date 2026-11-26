import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isFullAdminRole } from "@/lib/rbac";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";
import {
  fetchAllProglatPrograms,
  getSnapshotProglatById,
  type ExternalProglatProgram,
} from "@/lib/proglat";

type CommitAction = "ADD" | "UPDATE" | "SKIP";

interface CommitSelectionItem {
  id: string;
  action: CommitAction;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!isFullAdminRole(session.user.role)) {
    return NextResponse.json(
      {
        message:
          "Hanya Administrator atau Super Administrator yang dapat menyimpan data Program Pelatihan.",
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
      if (!item?.id || item.action === "SKIP") {
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
          totalTopicsSaved: 0,
        },
        message: `Tidak ada perubahan disimpan (${skippedCount} program dilewati).`,
      });
    }

    const missing = activeSelections.some((s) => !getSnapshotProglatById(s.id));
    if (missing) {
      await fetchAllProglatPrograms(4, { useCache: false });
    }

    const resolved: Array<{
      action: CommitAction;
      program: ExternalProglatProgram;
    }> = [];
    for (const sel of activeSelections) {
      const full = getSnapshotProglatById(sel.id);
      if (full) resolved.push({ action: sel.action, program: full });
    }

    const existingRows = await prisma.proglatProgram.findMany({
      select: { id: true },
    });
    const existingIds = new Set(existingRows.map((r) => r.id));

    let addedCount = 0;
    let updatedCount = 0;
    let totalTopicsSaved = 0;

    const BATCH_SIZE = 20;
    for (let i = 0; i < resolved.length; i += BATCH_SIZE) {
      const batch = resolved.slice(i, i + BATCH_SIZE);

      await prisma.$transaction(async (tx) => {
        for (const item of batch) {
          const prog = item.program;
          const exists = existingIds.has(prog.id);

          const validTopics = prog.program_topics
            .filter((t) => Boolean(t?.id))
            .map((t) => ({
              id: t.id, // ID asli API Proglat
              programId: prog.id,
              code: t.code ?? null,
              title: t.title,
              duration: t.duration,
              references: t.references ?? null,
              description: t.description ?? null,
              type: t.type ?? null,
              skkniId: t.skkni_id ?? null,
              skkniUnitId: t.skkni_unit_id ?? null,
              isManualEdited: false,
            }));

          const originalSnapshot = {
            code: prog.code ?? null,
            title: prog.title,
            totalModules: prog.total_modules,
            totalDuration: prog.total_duration,
            type: prog.type ?? null,
            topics: validTopics.map((t) => ({
              id: t.id,
              code: t.code,
              title: t.title,
              duration: t.duration,
              references: t.references,
              description: t.description,
              type: t.type,
              skkniId: t.skkniId,
              skkniUnitId: t.skkniUnitId,
            })),
          };

          const progData = {
            code: prog.code ?? null,
            title: prog.title,
            totalModules: prog.total_modules,
            totalDuration: prog.total_duration,
            type: prog.type ?? null,
            coverImage: prog.cover_image ?? null,
            downloadMaterialUri: prog.download_material_uri ?? null,
            vocationalName: prog.vocational_name ?? null,
            subVocationalName: prog.sub_vocational_name ?? null,
            status: prog.status ?? null,
            version: prog.version || 1,
            isManualEdited: false,
            originalSnapshot,
            syncedAt: new Date(),
          };

          await tx.proglatProgram.upsert({
            where: { id: prog.id }, // ID asli API Proglat
            create: { id: prog.id, ...progData },
            update: progData,
          });

          if (exists) {
            updatedCount++;
          } else {
            addedCount++;
            existingIds.add(prog.id);
          }

          await tx.proglatTopic.deleteMany({
            where: { programId: prog.id },
          });

          if (validTopics.length > 0) {
            await tx.proglatTopic.createMany({
              data: validTopics,
              skipDuplicates: true,
            });
            totalTopicsSaved += validTopics.length;
          }
        }
      });
    }

    const summary = {
      mode: body.mode || "penuh",
      addedCount,
      updatedCount,
      skippedCount,
      totalTopicsSaved,
    };

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "TARIK_DATA_PROGLAT",
      modul: "ADMINISTRASI_PROGLAT",
      detail: `Konfirmasi data Program Pelatihan (${summary.mode}): ${addedCount} ditambah, ${updatedCount} diperbarui, ${skippedCount} dilewati (${totalTopicsSaved} unit kompetensi).`,
      dataSesudah: summary,
      ipAddress: extractClientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      summary,
      message: `Berhasil menyimpan Program Pelatihan: ${addedCount} ditambah, ${updatedCount} diperbarui, ${skippedCount} dilewati.`,
    });
  } catch (error) {
    console.error("[API PROGLAT COMMIT] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal menyimpan data Program Pelatihan.",
      },
      { status: 500 }
    );
  }
}
