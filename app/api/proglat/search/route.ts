import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessAnyProglat } from "@/lib/rbac";
import {
  getSnapshotProglatById,
  searchProglatProgramsAjax,
} from "@/lib/proglat";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canUserAccessAnyProglat(
    session.user.id,
    session.user.role
  );
  if (!allowed) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  // Mode 1: Ambil detail penuh 1 program dari server cache saat user memilih di Combobox (<10ms)
  const id = req.nextUrl.searchParams.get("id")?.trim();
  const codeHint = req.nextUrl.searchParams.get("code")?.trim() || "";
  if (id) {
    try {
      let full = getSnapshotProglatById(id);
      if (!full && codeHint) {
        const res = await searchProglatProgramsAjax(codeHint, 10);
        full = res.programs.find((p) => p.id === id) ?? null;
      }
      if (!full) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Cache detail program sudah kedaluwarsa. Silakan cari ulang program tersebut.",
          },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: full });
    } catch (error) {
      console.error("[API PROGLAT SEARCH DETAIL] Error:", error);
      return NextResponse.json(
        { success: false, message: "Gagal mengambil detail program." },
        { status: 502 }
      );
    }
  }

  // Mode 2: Pencarian AJAX ringan (limit=10, payload ringkas tanpa program_topics[])
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";

  try {
    const { programs, totalFromApi } = await searchProglatProgramsAjax(q, 10);

    const ids = programs.map((p) => p.id);
    const existing = ids.length
      ? await prisma.proglatProgram.findMany({
          where: { id: { in: ids }, deletedAt: null },
          select: { id: true },
        })
      : [];
    const existingSet = new Set(existing.map((e) => e.id));

    return NextResponse.json({
      success: true,
      totalFromApi,
      data: programs.map((p) => ({
        id: p.id,
        code: p.code ?? null,
        title: p.title,
        type: p.type ?? null,
        version: p.version || 1,
        published_at: p.published_at ?? null,
        total_duration: p.total_duration,
        topicsCount: p.program_topics.length,
        existsInLocal: existingSet.has(p.id),
      })),
    });
  } catch (error) {
    console.error("[API PROGLAT SEARCH] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal mencari program pada API Proglat Kemnaker.",
      },
      { status: 502 }
    );
  }
}
