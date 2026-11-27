import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessAnyProglat } from "@/lib/rbac";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";
import {
  fetchAllProglatPrograms,
  fetchProglatProgramsByKeyword,
} from "@/lib/proglat";
import {
  parseOriginalSnapshot,
  type ProglatOriginalSnapshot,
} from "@/lib/proglat-types";

export const maxDuration = 120;

async function resolveOriginalSnapshot(
  existing: {
    id: string;
    code: string | null;
    title: string;
    originalSnapshot: unknown;
  }
): Promise<{
  snapshot: ProglatOriginalSnapshot;
  source: "LOCAL_SNAPSHOT" | "API_FALLBACK";
} | null> {
  // 1. Prioritas utama: pakai originalSnapshot lokal (instan <50ms, tahan offline/API down)
  const local = parseOriginalSnapshot(existing.originalSnapshot);
  if (local) {
    return { snapshot: local, source: "LOCAL_SNAPSHOT" };
  }

  // 2. Fallback untuk data lama yang ditarik sebelum kolom originalSnapshot ada
  let apiProg = null;
  if (existing.code && existing.code.trim()) {
    const byCode = await fetchProglatProgramsByKeyword(existing.code.trim(), 4);
    apiProg = byCode.programs.find((p) => p.id === existing.id) ?? null;
  }
  if (!apiProg && existing.title && existing.title.trim()) {
    const byTitle = await fetchProglatProgramsByKeyword(
      existing.title.trim(),
      4
    );
    apiProg = byTitle.programs.find((p) => p.id === existing.id) ?? null;
  }
  if (!apiProg) {
    const all = await fetchAllProglatPrograms(4, { useCache: true });
    apiProg = all.programs.find((p) => p.id === existing.id) ?? null;
  }

  if (!apiProg) return null;

  const snapshot: ProglatOriginalSnapshot = {
    code: apiProg.code ?? null,
    title: apiProg.title,
    totalModules: apiProg.total_modules,
    totalDuration: apiProg.total_duration,
    type: apiProg.type ?? null,
    topics: apiProg.program_topics
      .filter((t) => Boolean(t?.id))
      .map((t) => ({
        id: t.id,
        code: t.code ?? null,
        title: t.title,
        duration: t.duration,
        references: t.references ?? null,
        description: t.description ?? null,
        type: t.type ?? null,
        skkniId: t.skkni_id ?? null,
        skkniUnitId: t.skkni_unit_id ?? null,
      })),
  };

  return { snapshot, source: "API_FALLBACK" };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canUserAccessAnyProglat(
    session.user.id,
    session.user.role
  );
  if (!allowed || session.user.role === "USER") {
    return NextResponse.json(
      {
        message:
          "Hanya Administrator, Super Administrator, atau Admin Sub Unit berizin yang dapat mereset data program.",
      },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const existing = await prisma.proglatProgram.findUnique({
    where: { id },
    include: { topics: true },
  });

  if (!existing) {
    return NextResponse.json(
      { message: "Program pelatihan tidak ditemukan." },
      { status: 404 }
    );
  }

  try {
    let body: { scope?: "all" | "topic"; topicId?: string } = {};
    try {
      body = (await req.json()) as { scope?: "all" | "topic"; topicId?: string };
    } catch {
      body = { scope: "all" };
    }

    const scope = body.scope === "topic" && body.topicId ? "topic" : "all";
    const resolved = await resolveOriginalSnapshot(existing);

    if (!resolved) {
      return NextResponse.json(
        {
          message:
            "Data bawaan tidak ditemukan di snapshot lokal maupun API Proglat Kemnaker.",
        },
        { status: 404 }
      );
    }

    const { snapshot, source } = resolved;
    const ipAddress = extractClientIp(req.headers);

    // Reset 1 unit kompetensi saja dari originalSnapshot
    if (scope === "topic" && body.topicId) {
      const localTopic = existing.topics.find((t) => t.id === body.topicId);
      const origTopic = snapshot.topics.find((t) => t.id === body.topicId);

      if (!localTopic || !origTopic) {
        return NextResponse.json(
          {
            message:
              "Unit kompetensi bawaan tidak ditemukan pada snapshot program.",
          },
          { status: 404 }
        );
      }

      await prisma.proglatTopic.update({
        where: { id: localTopic.id },
        data: {
          code: origTopic.code ?? null,
          title: origTopic.title,
          duration: origTopic.duration,
          references: origTopic.references ?? null,
          description: origTopic.description ?? null,
          type: origTopic.type ?? null,
          isManualEdited: false,
        },
      });

      const currentTopics = await prisma.proglatTopic.findMany({
        where: { programId: existing.id },
        select: { duration: true, isManualEdited: true },
      });
      const autoModules = currentTopics.length;
      const autoDuration = currentTopics.reduce(
        (acc, t) => acc + (t.duration || 0),
        0
      );
      const remainingManualTopics = currentTopics.filter(
        (t) => t.isManualEdited
      ).length;
      const programMatchesOrig =
        existing.title === snapshot.title &&
        autoModules === snapshot.totalModules &&
        autoDuration === snapshot.totalDuration &&
        (existing.type || null) === (snapshot.type || null);

      await prisma.proglatProgram.update({
        where: { id: existing.id },
        data: {
          totalModules: autoModules,
          totalDuration: autoDuration,
          ...(remainingManualTopics === 0 && programMatchesOrig
            ? { isManualEdited: false }
            : {}),
          ...(source === "API_FALLBACK"
            ? { originalSnapshot: snapshot as unknown as object }
            : {}),
        },
      });

      const refreshed = await prisma.proglatProgram.findUnique({
        where: { id: existing.id },
        include: {
          topics: { orderBy: [{ code: "asc" }, { title: "asc" }] },
        },
      });

      await catatLogAktivitas({
        userId: session.user.id,
        userName: session.user.nama,
        aksi: "RESET_PROGLAT_TOPIC_SNAPSHOT",
        modul: "ADMINISTRASI_PROGLAT",
        detail: `Reset unit kompetensi ${localTopic.code || localTopic.id} pada program "${existing.title}" ke data bawaan (${source}).`,
        dataSebelum: {
          topicId: localTopic.id,
          title: localTopic.title,
          duration: localTopic.duration,
          references: localTopic.references,
        },
        dataSesudah: {
          topicId: origTopic.id,
          title: origTopic.title,
          duration: origTopic.duration,
          references: origTopic.references,
          isManualEdited: false,
          source,
        },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        data: refreshed,
        message: `Unit kompetensi ${localTopic.code || ""} berhasil dikembalikan ke data bawaan.`,
      });
    }

    // Reset keseluruhan program & seluruh unit kompetensinya dari originalSnapshot
    await prisma.$transaction(async (tx) => {
      await tx.proglatProgram.update({
        where: { id: existing.id },
        data: {
          code: snapshot.code ?? null,
          title: snapshot.title,
          totalModules: snapshot.totalModules,
          totalDuration: snapshot.totalDuration,
          type: snapshot.type ?? null,
          isManualEdited: false,
          ...(source === "API_FALLBACK"
            ? { originalSnapshot: snapshot as unknown as object }
            : {}),
        },
      });

      await tx.proglatTopic.deleteMany({
        where: { programId: existing.id },
      });

      if (snapshot.topics.length > 0) {
        const snapSkkniIds = Array.from(
          new Set(
            snapshot.topics
              .map((t) => t.skkniId)
              .filter((v): v is string => Boolean(v))
          )
        );
        const snapSkkniUnitIds = Array.from(
          new Set(
            snapshot.topics
              .map((t) => t.skkniUnitId)
              .filter((v): v is string => Boolean(v))
          )
        );
        const [validDocs, validUnits] = await Promise.all([
          snapSkkniIds.length > 0
            ? tx.skkniDocument.findMany({
                where: { id: { in: snapSkkniIds } },
                select: { id: true },
              })
            : Promise.resolve([]),
          snapSkkniUnitIds.length > 0
            ? tx.skkniUnit.findMany({
                where: { id: { in: snapSkkniUnitIds } },
                select: { id: true },
              })
            : Promise.resolve([]),
        ]);
        const validDocSet = new Set(validDocs.map((d) => d.id));
        const validUnitSet = new Set(validUnits.map((u) => u.id));

        await tx.proglatTopic.createMany({
          data: snapshot.topics.map((t) => ({
            id: t.id,
            programId: existing.id,
            code: t.code ?? null,
            title: t.title,
            duration: t.duration,
            references: t.references ?? null,
            description: t.description ?? null,
            type: t.type ?? null,
            jenisUnitId: t.jenisUnitId ?? null,
            skkniId: t.skkniId && validDocSet.has(t.skkniId) ? t.skkniId : null,
            skkniUnitId:
              t.skkniUnitId && validUnitSet.has(t.skkniUnitId)
                ? t.skkniUnitId
                : null,
            isManualEdited: false,
          })),
          skipDuplicates: true,
        });
      }
    });

    const refreshed = await prisma.proglatProgram.findUnique({
      where: { id: existing.id },
      include: {
        topics: { orderBy: [{ code: "asc" }, { title: "asc" }] },
      },
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "RESET_PROGLAT_SNAPSHOT",
      modul: "ADMINISTRASI_PROGLAT",
      detail: `Reset program "${existing.title}" (${existing.code || existing.id}) ke data bawaan (${source}).`,
      dataSebelum: {
        title: existing.title,
        totalModules: existing.totalModules,
        totalDuration: existing.totalDuration,
        type: existing.type,
        isManualEdited: existing.isManualEdited,
      },
      dataSesudah: {
        title: snapshot.title,
        totalModules: snapshot.totalModules,
        totalDuration: snapshot.totalDuration,
        type: snapshot.type,
        topicsCount: snapshot.topics.length,
        isManualEdited: false,
        source,
      },
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      data: refreshed,
      message: `Program "${snapshot.title}" berhasil dikembalikan ke data bawaan.`,
    });
  } catch (error) {
    console.error("[API PROGLAT RESET] Error:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Gagal mereset data Program Pelatihan.",
      },
      { status: 500 }
    );
  }
}
