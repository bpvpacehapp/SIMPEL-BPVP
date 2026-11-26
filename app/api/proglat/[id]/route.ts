import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessMenu } from "@/lib/rbac";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const program = await prisma.proglatProgram.findUnique({
    where: { id },
    include: {
      topics: {
        orderBy: [{ code: "asc" }, { title: "asc" }],
      },
    },
  });

  if (!program) {
    return NextResponse.json(
      { message: "Program pelatihan tidak ditemukan." },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: program });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
          "Hanya Administrator, Super Administrator, atau Admin Sub Unit berizin yang dapat menyesuaikan data program.",
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
    const body = (await req.json()) as {
      program?: {
        title?: string;
        type?: string | null;
      };
      topic?: {
        id: string;
        title?: string;
        duration?: number;
        references?: string | null;
      };
      addTopic?: {
        code?: string | null;
        title?: string;
        duration?: number;
        references?: string | null;
        type?: string | null;
      };
      deleteTopicId?: string;
    };

    const ipAddress = extractClientIp(req.headers);

    // Pengaman untuk data lama yang ditarik sebelum kolom originalSnapshot ada:
    const fallbackSnapshotIfMissing = !existing.originalSnapshot
      ? {
          code: existing.code ?? null,
          title: existing.title,
          totalModules: existing.totalModules,
          totalDuration: existing.totalDuration,
          type: existing.type ?? null,
          topics: existing.topics.map((t) => ({
            id: t.id,
            code: t.code ?? null,
            title: t.title,
            duration: t.duration,
            references: t.references ?? null,
            description: t.description ?? null,
            type: t.type ?? null,
            skkniId: t.skkniId ?? null,
            skkniUnitId: t.skkniUnitId ?? null,
          })),
        }
      : undefined;

    // 1. Update manual level Program (field `code` read-only; totalModules & totalDuration otomatis dari topics)
    if (body.program) {
      const nextTitle = body.program.title?.trim() || existing.title;
      const nextType =
        body.program.type !== undefined
          ? body.program.type?.trim() || null
          : existing.type;

      const autoModules = existing.topics.length;
      const autoDuration = existing.topics.reduce(
        (acc, t) => acc + (t.duration || 0),
        0
      );

      const updated = await prisma.proglatProgram.update({
        where: { id },
        data: {
          title: nextTitle,
          type: nextType,
          totalModules: autoModules,
          totalDuration: autoDuration,
          isManualEdited: true,
          ...(fallbackSnapshotIfMissing
            ? { originalSnapshot: fallbackSnapshotIfMissing }
            : {}),
        },
        include: {
          topics: { orderBy: [{ code: "asc" }, { title: "asc" }] },
        },
      });

      await catatLogAktivitas({
        userId: session.user.id,
        userName: session.user.nama,
        aksi: "UPDATE_PROGLAT_MANUAL",
        modul: "ADMINISTRASI_PROGLAT",
        detail: `Penyesuaian manual informasi program "${updated.title}" (${updated.code || updated.id})`,
        dataSebelum: {
          title: existing.title,
          type: existing.type,
        },
        dataSesudah: {
          title: updated.title,
          type: updated.type,
          totalModules: updated.totalModules,
          totalDuration: updated.totalDuration,
          isManualEdited: true,
        },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        data: updated,
        message: "Informasi program berhasil disesuaikan secara manual.",
      });
    }

    // 2. Update manual 1 Unit Kompetensi (field `code` tetap read-only; otomatis hitung ulang totalModules & totalDuration)
    if (body.topic?.id) {
      const targetTopic = existing.topics.find((t) => t.id === body.topic!.id);
      if (!targetTopic) {
        return NextResponse.json(
          { message: "Unit kompetensi tidak ditemukan pada program ini." },
          { status: 404 }
        );
      }

      const nextTitle = body.topic.title?.trim() || targetTopic.title;
      const nextDuration =
        typeof body.topic.duration === "number" &&
        Number.isFinite(body.topic.duration)
          ? Math.max(0, Math.round(body.topic.duration))
          : targetTopic.duration;
      const nextRefs =
        body.topic.references !== undefined
          ? body.topic.references?.trim() || null
          : targetTopic.references;

      const autoModules = existing.topics.length;
      const autoDuration = existing.topics.reduce(
        (acc, t) =>
          acc + (t.id === targetTopic.id ? nextDuration : t.duration || 0),
        0
      );

      await prisma.$transaction([
        prisma.proglatTopic.update({
          where: { id: targetTopic.id },
          data: {
            title: nextTitle,
            duration: nextDuration,
            references: nextRefs,
            isManualEdited: true,
          },
        }),
        prisma.proglatProgram.update({
          where: { id },
          data: {
            totalModules: autoModules,
            totalDuration: autoDuration,
            isManualEdited: true,
            ...(fallbackSnapshotIfMissing
              ? { originalSnapshot: fallbackSnapshotIfMissing }
              : {}),
          },
        }),
      ]);

      const refreshed = await prisma.proglatProgram.findUnique({
        where: { id },
        include: {
          topics: { orderBy: [{ code: "asc" }, { title: "asc" }] },
        },
      });

      await catatLogAktivitas({
        userId: session.user.id,
        userName: session.user.nama,
        aksi: "UPDATE_PROGLAT_TOPIC_MANUAL",
        modul: "ADMINISTRASI_PROGLAT",
        detail: `Penyesuaian manual unit kompetensi ${targetTopic.code || targetTopic.id} pada program "${existing.title}"`,
        dataSebelum: {
          topicId: targetTopic.id,
          code: targetTopic.code,
          title: targetTopic.title,
          duration: targetTopic.duration,
          references: targetTopic.references,
        },
        dataSesudah: {
          topicId: targetTopic.id,
          code: targetTopic.code,
          title: nextTitle,
          duration: nextDuration,
          references: nextRefs,
          programTotalModules: autoModules,
          programTotalDuration: autoDuration,
          isManualEdited: true,
        },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        data: refreshed,
        message: `Unit kompetensi ${targetTopic.code || ""} berhasil disesuaikan.`,
      });
    }

    // 3. Tambah Unit Kompetensi baru secara manual (otomatis hitung ulang totalModules & totalDuration)
    if (body.addTopic) {
      const newTitle = body.addTopic.title?.trim() || "";
      if (!newTitle) {
        return NextResponse.json(
          { message: "Judul unit kompetensi wajib diisi." },
          { status: 400 }
        );
      }
      const newCode = body.addTopic.code?.trim() || null;
      const newDuration =
        typeof body.addTopic.duration === "number" &&
        Number.isFinite(body.addTopic.duration)
          ? Math.max(0, Math.round(body.addTopic.duration))
          : 0;
      const newRefs = body.addTopic.references?.trim() || null;
      const newType = body.addTopic.type?.trim() || "skkni";
      const newId = randomUUID();

      const autoModules = existing.topics.length + 1;
      const autoDuration =
        existing.topics.reduce((acc, t) => acc + (t.duration || 0), 0) +
        newDuration;

      await prisma.$transaction([
        prisma.proglatTopic.create({
          data: {
            id: newId,
            programId: id,
            code: newCode,
            title: newTitle,
            duration: newDuration,
            references: newRefs,
            type: newType,
            isManualEdited: true,
          },
        }),
        prisma.proglatProgram.update({
          where: { id },
          data: {
            totalModules: autoModules,
            totalDuration: autoDuration,
            isManualEdited: true,
            ...(fallbackSnapshotIfMissing
              ? { originalSnapshot: fallbackSnapshotIfMissing }
              : {}),
          },
        }),
      ]);

      const refreshed = await prisma.proglatProgram.findUnique({
        where: { id },
        include: {
          topics: { orderBy: [{ code: "asc" }, { title: "asc" }] },
        },
      });

      await catatLogAktivitas({
        userId: session.user.id,
        userName: session.user.nama,
        aksi: "ADD_PROGLAT_TOPIC_MANUAL",
        modul: "ADMINISTRASI_PROGLAT",
        detail: `Penambahan manual unit kompetensi "${newTitle}" pada program "${existing.title}"`,
        dataSebelum: {
          totalModules: existing.totalModules,
          totalDuration: existing.totalDuration,
        },
        dataSesudah: {
          topicId: newId,
          code: newCode,
          title: newTitle,
          duration: newDuration,
          references: newRefs,
          type: newType,
          programTotalModules: autoModules,
          programTotalDuration: autoDuration,
        },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        data: refreshed,
        message: `Unit kompetensi "${newTitle}" berhasil ditambahkan.`,
      });
    }

    // 4. Hapus Unit Kompetensi (otomatis hitung ulang totalModules & totalDuration)
    if (body.deleteTopicId) {
      const targetTopic = existing.topics.find(
        (t) => t.id === body.deleteTopicId
      );
      if (!targetTopic) {
        return NextResponse.json(
          { message: "Unit kompetensi tidak ditemukan." },
          { status: 404 }
        );
      }

      const remaining = existing.topics.filter((t) => t.id !== targetTopic.id);
      const autoModules = remaining.length;
      const autoDuration = remaining.reduce(
        (acc, t) => acc + (t.duration || 0),
        0
      );

      await prisma.$transaction([
        prisma.proglatTopic.delete({
          where: { id: targetTopic.id },
        }),
        prisma.proglatProgram.update({
          where: { id },
          data: {
            totalModules: autoModules,
            totalDuration: autoDuration,
            isManualEdited: true,
            ...(fallbackSnapshotIfMissing
              ? { originalSnapshot: fallbackSnapshotIfMissing }
              : {}),
          },
        }),
      ]);

      const refreshed = await prisma.proglatProgram.findUnique({
        where: { id },
        include: {
          topics: { orderBy: [{ code: "asc" }, { title: "asc" }] },
        },
      });

      await catatLogAktivitas({
        userId: session.user.id,
        userName: session.user.nama,
        aksi: "DELETE_PROGLAT_TOPIC_MANUAL",
        modul: "ADMINISTRASI_PROGLAT",
        detail: `Penghapusan unit kompetensi "${targetTopic.title}" (${targetTopic.code || targetTopic.id}) pada program "${existing.title}"`,
        dataSebelum: {
          topicId: targetTopic.id,
          code: targetTopic.code,
          title: targetTopic.title,
          duration: targetTopic.duration,
          totalModules: existing.totalModules,
          totalDuration: existing.totalDuration,
        },
        dataSesudah: {
          programTotalModules: autoModules,
          programTotalDuration: autoDuration,
        },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        data: refreshed,
        message: `Unit kompetensi "${targetTopic.title}" berhasil dihapus.`,
      });
    }

    return NextResponse.json(
      { message: "Tidak ada data perubahan yang dikirim." },
      { status: 400 }
    );
  } catch (error) {
    console.error("[API PROGLAT PATCH] Error:", error);
    return NextResponse.json(
      { message: "Gagal menyimpan penyesuaian manual program pelatihan." },
      { status: 500 }
    );
  }
}
