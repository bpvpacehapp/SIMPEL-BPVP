import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessMenu } from "@/lib/rbac";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";
import type { ProglatOriginalSnapshot } from "@/lib/proglat-types";

interface SaveTopicInput {
  id?: string;
  code?: string | null;
  title: string;
  duration: number;
  references?: string | null;
  description?: string | null;
  type?: string | null;
  jenisUnitId?: string | null;
  skkniId?: string | null;
  skkniUnitId?: string | null;
  isManualEdited?: boolean;
}

interface SaveProgramBody {
  program?: {
    id: string;
    code?: string | null;
    title: string;
    type?: string | null;
    publishedAt?: string | null;
    coverImage?: string | null;
    downloadMaterialUri?: string | null;
    vocationalName?: string | null;
    subVocationalName?: string | null;
    status?: string | null;
    version?: number;
  };
  topics?: SaveTopicInput[];
  originalSnapshot?: ProglatOriginalSnapshot | null;
  isManualEdited?: boolean;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canUserAccessMenu(
    session.user.id,
    session.user.role,
    "administrasi.proglat"
  );
  if (!allowed || session.user.role === "USER") {
    return NextResponse.json(
      {
        message:
          "Anda tidak memiliki izin menambahkan Program Pelatihan.",
      },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json()) as SaveProgramBody;
    const prog = body.program;
    if (!prog?.id || !prog.title?.trim()) {
      return NextResponse.json(
        { message: "Data program pelatihan tidak lengkap." },
        { status: 400 }
      );
    }

    const topicsInput = Array.isArray(body.topics) ? body.topics : [];
    const missingJenis = topicsInput.filter((t) => !t?.jenisUnitId?.trim());
    if (missingJenis.length > 0) {
      return NextResponse.json(
        {
          message: `Terdapat ${missingJenis.length} unit kompetensi yang belum dipilih Jenis Unit-nya. Harap lengkapi semua Jenis Unit sebelum menyimpan.`,
        },
        { status: 400 }
      );
    }

    const candidateSkkniIds = Array.from(
      new Set(
        topicsInput
          .map((t) => t.skkniId?.trim())
          .filter((v): v is string => Boolean(v))
      )
    );
    const candidateSkkniUnitIds = Array.from(
      new Set(
        topicsInput
          .map((t) => t.skkniUnitId?.trim())
          .filter((v): v is string => Boolean(v))
      )
    );

    const [validSkkniDocs, validSkkniUnits] = await Promise.all([
      candidateSkkniIds.length > 0
        ? prisma.skkniDocument.findMany({
            where: { id: { in: candidateSkkniIds } },
            select: { id: true },
          })
        : Promise.resolve([]),
      candidateSkkniUnitIds.length > 0
        ? prisma.skkniUnit.findMany({
            where: { id: { in: candidateSkkniUnitIds } },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    const validSkkniIdSet = new Set(validSkkniDocs.map((d) => d.id));
    const validSkkniUnitIdSet = new Set(validSkkniUnits.map((u) => u.id));

    const normalizedTopics = topicsInput
      .filter((t) => Boolean(t?.title?.trim()))
      .map((t) => ({
        id: t.id?.trim() || randomUUID(),
        programId: prog.id,
        code: t.code ? String(t.code).trim() : null,
        title: t.title.trim(),
        duration: Math.max(0, Math.round(Number(t.duration) || 0)),
        references: t.references ? String(t.references).trim() : null,
        description: t.description ? String(t.description).trim() : null,
        type: t.type ? String(t.type).trim() : null,
        jenisUnitId: t.jenisUnitId?.trim() || null,
        skkniId:
          t.skkniId && validSkkniIdSet.has(t.skkniId.trim())
            ? t.skkniId.trim()
            : null,
        skkniUnitId:
          t.skkniUnitId && validSkkniUnitIdSet.has(t.skkniUnitId.trim())
            ? t.skkniUnitId.trim()
            : null,
        isManualEdited: Boolean(t.isManualEdited),
      }));

    const totalModules = normalizedTopics.length;
    const totalDuration = normalizedTopics.reduce(
      (acc, t) => acc + t.duration,
      0
    );

    const publishedAtDate = prog.publishedAt
      ? (() => {
          const d = new Date(prog.publishedAt);
          return Number.isNaN(d.getTime()) ? null : d;
        })()
      : null;

    const snapshotToStore = body.originalSnapshot ?? {
      code: prog.code ?? null,
      title: prog.title.trim(),
      totalModules,
      totalDuration,
      type: prog.type ?? null,
      topics: normalizedTopics.map((t) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        duration: t.duration,
        references: t.references,
        description: t.description,
        type: t.type,
        jenisUnitId: t.jenisUnitId,
        skkniId: t.skkniId,
        skkniUnitId: t.skkniUnitId,
      })),
    };

    const existing = await prisma.proglatProgram.findUnique({
      where: { id: prog.id },
      select: { id: true, title: true },
    });

    await prisma.$transaction(async (tx) => {
      const dataPayload = {
        code: prog.code ? String(prog.code).trim() : null,
        title: prog.title.trim(),
        totalModules,
        totalDuration,
        type: prog.type ? String(prog.type).trim() : null,
        publishedAt: publishedAtDate,
        coverImage: prog.coverImage ?? null,
        downloadMaterialUri: prog.downloadMaterialUri ?? null,
        vocationalName: prog.vocationalName ?? null,
        subVocationalName: prog.subVocationalName ?? null,
        status: prog.status ?? null,
        version: prog.version || 1,
        isManualEdited: Boolean(body.isManualEdited),
        originalSnapshot: snapshotToStore as unknown as object,
        deletedAt: null,
        syncedAt: new Date(),
      };

      await tx.proglatProgram.upsert({
        where: { id: prog.id },
        create: { id: prog.id, ...dataPayload },
        update: dataPayload,
      });

      await tx.proglatTopic.deleteMany({
        where: { programId: prog.id },
      });

      if (normalizedTopics.length > 0) {
        await tx.proglatTopic.createMany({
          data: normalizedTopics,
          skipDuplicates: true,
        });
      }
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: existing ? "UPDATE_PROGLAT_INPUT" : "TAMBAH_PROGLAT_MANUAL",
      modul: "ADMINISTRASI_PROGLAT",
      detail: `${existing ? "Memperbarui" : "Menambahkan"} program "${prog.title.trim()}" dengan ${totalModules} unit kompetensi (${totalDuration} JP).`,
      dataSesudah: {
        id: prog.id,
        code: prog.code ?? null,
        title: prog.title.trim(),
        version: prog.version || 1,
        publishedAt: publishedAtDate?.toISOString() ?? null,
        totalModules,
        totalDuration,
        isManualEdited: Boolean(body.isManualEdited),
      },
      ipAddress: extractClientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      id: prog.id,
      message: `Program "${prog.title.trim()}" berhasil disimpan ke database lokal.`,
    });
  } catch (error) {
    console.error("[API PROGLAT SAVE] Error:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Gagal menyimpan data Program Pelatihan.",
      },
      { status: 500 }
    );
  }
}
