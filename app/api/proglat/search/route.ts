import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessAnyProglat } from "@/lib/rbac";
import { searchProglatProgramsAjax } from "@/lib/proglat";

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

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";

  try {
    const { programs, totalFromApi } = await searchProglatProgramsAjax(q, 10);

    const ids = programs.map((p) => p.id);
    const existing = ids.length
      ? await prisma.proglatProgram.findMany({
          where: { id: { in: ids }, deletedAt: null },
          select: { id: true, category: true },
        })
      : [];
    const existingMap = new Map(existing.map((e) => [e.id, e.category]));

    return NextResponse.json({
      success: true,
      totalFromApi,
      data: programs.map((p) => ({
        ...p,
        existsInLocal: existingMap.has(p.id),
        localCategory: existingMap.get(p.id) ?? null,
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
