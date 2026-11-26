import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isFullAdminRole } from "@/lib/rbac";
import {
  fetchAllProglatPrograms,
  fetchProglatProgramsByKeyword,
  filterProglatPrograms,
  type ProglatFilterInput,
} from "@/lib/proglat";

export const maxDuration = 300;

function norm(val?: string | null): string {
  return (val || "").trim();
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
          "Hanya Administrator atau Super Administrator yang dapat menarik data Program Pelatihan.",
      },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json()) as {
      mode?: "penuh" | "pilihan";
      filters?: Partial<ProglatFilterInput>;
    };

    const mode = body.mode === "pilihan" ? "pilihan" : "penuh";
    const codeQuery = (body.filters?.code || "").trim();

    if (mode === "pilihan" && !codeQuery) {
      return NextResponse.json(
        {
          message: "Kode program wajib diisi pada mode Tarik Pilihan.",
        },
        { status: 400 }
      );
    }

    const [{ programs, totalFromApi, totalPages }, existingRows] =
      await Promise.all([
        mode === "pilihan"
          ? fetchProglatProgramsByKeyword(codeQuery, 4)
          : fetchAllProglatPrograms(4, { useCache: false }),
        prisma.proglatProgram.findMany({
          select: {
            id: true,
            code: true,
            title: true,
            totalModules: true,
            totalDuration: true,
            type: true,
            downloadMaterialUri: true,
            isManualEdited: true,
            _count: { select: { topics: true } },
          },
        }),
      ]);

    const selected =
      mode === "pilihan"
        ? filterProglatPrograms(programs, {
            code: codeQuery,
            title: body.filters?.title,
            type: body.filters?.type,
          })
        : programs;

    const localMap = new Map(existingRows.map((row) => [row.id, row]));

    let newCount = 0;
    let changedCount = 0;
    let manualProtectedCount = 0;
    let upToDateCount = 0;

    const previewItems = selected.map((prog) => {
      const local = localMap.get(prog.id);
      const baseSummary = {
        id: prog.id,
        code: prog.code ?? null,
        title: prog.title,
        total_modules: prog.total_modules,
        total_duration: prog.total_duration,
        type: prog.type ?? null,
        vocational_name: prog.vocational_name ?? null,
        topicsCount: prog.program_topics.length,
        hasPdf: Boolean(prog.download_material_uri),
      };

      if (!local) {
        newCount++;
        return {
          ...baseSummary,
          existsInLocal: false,
          isManualEdited: false,
          syncStatus: "NEW" as const,
          defaultAction: "ADD" as const,
        };
      }

      // Proteksi hasil edit manual: default SKIP agar koreksi kantor tidak tertimpa
      if (local.isManualEdited) {
        manualProtectedCount++;
        return {
          ...baseSummary,
          existsInLocal: true,
          isManualEdited: true,
          syncStatus: "MANUAL_EDITED" as const,
          defaultAction: "SKIP" as const,
        };
      }

      const hasChanged =
        norm(local.code) !== norm(prog.code) ||
        norm(local.title) !== norm(prog.title) ||
        local.totalModules !== prog.total_modules ||
        local.totalDuration !== prog.total_duration ||
        norm(local.type) !== norm(prog.type) ||
        norm(local.downloadMaterialUri) !== norm(prog.download_material_uri) ||
        local._count.topics !== prog.program_topics.length;

      if (hasChanged) {
        changedCount++;
        return {
          ...baseSummary,
          existsInLocal: true,
          isManualEdited: false,
          syncStatus: "CHANGED" as const,
          defaultAction: "UPDATE" as const,
        };
      }

      upToDateCount++;
      return {
        ...baseSummary,
        existsInLocal: true,
        isManualEdited: false,
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
        manualProtectedCount,
        upToDateCount,
        isUpToDate,
      },
      data: previewItems,
    });
  } catch (error) {
    console.error("[API PROGLAT FETCH] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal menarik data dari API Proglat Kemnaker.",
      },
      { status: 502 }
    );
  }
}
