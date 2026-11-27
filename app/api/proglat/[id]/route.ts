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
      action?: "restore";
      program?: {
        title?: string;
        type?: string | null;
      };
      topic?: {
        id: string;
        duration?: number;
        jenisUnitId?: string | null;
      };
      addSkkniUnit?: {
        skkniUnitId: string;
        duration?: number;
        jenisUnitId?: string | null;
      };
      deleteTopicId?: string;
    };

    const ipAddress = extractClientIp(req.headers);

    // 0. Pulihkan program hasil soft delete
    if (body.action === "restore") {
      const restored = await prisma.proglatProgram.update({
        where: { id },
        data: { deletedAt: null },
        include: {
          topics: { orderBy: [{ code: "asc" }, { title: "asc" }] },
        },
      });

      await catatLogAktivitas({
        userId: session.user.id,
        userName: session.user.nama,
        aksi: "RESTORE_PROGLAT",
        modul: "ADMINISTRASI_PROGLAT",
        detail: `Memulihkan program pelatihan "${restored.title}" (${restored.code || restored.id}).`,
        dataSebelum: { id: existing.id, deletedAt: existing.deletedAt },
        dataSesudah: { id: restored.id, deletedAt: null },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        data: restored,
        message: `Program "${restored.title}" berhasil dipulihkan.`,
      });
    }

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
            jenisUnitId: t.jenisUnitId ?? null,
            skkniId: t.skkniId ?? null,
            skkniUnitId: t.skkniUnitId ?? null,
          })),
        }
      : undefined;

    // 1. Update ringkasan program (code, version, publishedAt tetap read-only)
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
        dataSebelum: { title: existing.title, type: existing.type },
        dataSesudah: {
          title: updated.title,
          type: updated.type,
          totalModules: updated.totalModules,
          totalDuration: updated.totalDuration,
        },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        data: updated,
        message: "Informasi program berhasil disimpan.",
      });
    }

    // 2. Update langsung Durasi (JP) dan/atau Jenis Unit pada 1 unit kompetensi
    if (body.topic?.id) {
      const targetTopic = existing.topics.find((t) => t.id === body.topic!.id);
      if (!targetTopic) {
        return NextResponse.json(
          { message: "Unit kompetensi tidak ditemukan pada program ini." },
          { status: 404 }
        );
      }

      const nextDuration =
        typeof body.topic.duration === "number" &&
        Number.isFinite(body.topic.duration)
          ? Math.max(0, Math.round(body.topic.duration))
          : targetTopic.duration;

      const nextJenisUnitId =
        body.topic.jenisUnitId !== undefined
          ? body.topic.jenisUnitId?.trim() || null
          : targetTopic.jenisUnitId;

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
            duration: nextDuration,
            jenisUnitId: nextJenisUnitId,
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
        detail: `Penyesuaian unit ${targetTopic.code || targetTopic.title} pada program "${existing.title}"`,
        dataSebelum: {
          topicId: targetTopic.id,
          duration: targetTopic.duration,
          jenisUnitId: targetTopic.jenisUnitId,
        },
        dataSesudah: {
          topicId: targetTopic.id,
          duration: nextDuration,
          jenisUnitId: nextJenisUnitId,
          programTotalDuration: autoDuration,
        },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        data: refreshed,
        message: "Unit kompetensi berhasil diperbarui.",
      });
    }

    // 3. Tambah Unit Kompetensi dari master SKKNI (`skkni_units`)
    if (body.addSkkniUnit?.skkniUnitId) {
      const skkniUnit = await prisma.skkniUnit.findUnique({
        where: { id: body.addSkkniUnit.skkniUnitId },
        include: { document: { select: { id: true, numberKepmen: true } } },
      });

      if (!skkniUnit) {
        return NextResponse.json(
          { message: "Unit kerja SKKNI tidak ditemukan." },
          { status: 404 }
        );
      }

      const duplicate = existing.topics.some(
        (t) =>
          (t.skkniUnitId && t.skkniUnitId === skkniUnit.id) ||
          (t.code &&
            skkniUnit.code &&
            t.code.trim().toLowerCase() === skkniUnit.code.trim().toLowerCase())
      );
      if (duplicate) {
        return NextResponse.json(
          {
            message: `Unit dengan kode "${skkniUnit.code}" sudah ada pada program ini.`,
          },
          { status: 409 }
        );
      }

      // Default Jenis Unit -> "Teknis" jika belum dipilih eksplisit
      let resolvedJenisUnitId = body.addSkkniUnit.jenisUnitId?.trim() || null;
      if (!resolvedJenisUnitId) {
        const teknis = await prisma.jenisUnitKompetensi.findFirst({
          where: {
            deletedAt: null,
            jenisUnit: { equals: "Teknis", mode: "insensitive" },
          },
          select: { id: true },
        });
        resolvedJenisUnitId = teknis?.id ?? null;
      }

      const newDuration =
        typeof body.addSkkniUnit.duration === "number" &&
        Number.isFinite(body.addSkkniUnit.duration)
          ? Math.max(0, Math.round(body.addSkkniUnit.duration))
          : 0;

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
            code: skkniUnit.code,
            title: skkniUnit.title,
            duration: newDuration,
            references: skkniUnit.document?.numberKepmen ?? null,
            type: "skkni",
            jenisUnitId: resolvedJenisUnitId,
            skkniId: skkniUnit.documentId,
            skkniUnitId: skkniUnit.id,
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
        aksi: "ADD_PROGLAT_TOPIC_SKKNI",
        modul: "ADMINISTRASI_PROGLAT",
        detail: `Menambahkan unit SKKNI ${skkniUnit.code} ("${skkniUnit.title}") pada program "${existing.title}"`,
        dataSesudah: {
          topicId: newId,
          code: skkniUnit.code,
          title: skkniUnit.title,
          skkniUnitId: skkniUnit.id,
          duration: newDuration,
          jenisUnitId: resolvedJenisUnitId,
          programTotalModules: autoModules,
          programTotalDuration: autoDuration,
        },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        data: refreshed,
        message: `Unit SKKNI ${skkniUnit.code} berhasil ditambahkan.`,
      });
    }

    // 4. Hapus Unit Kompetensi
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
        detail: `Menghapus unit "${targetTopic.title}" (${targetTopic.code || targetTopic.id}) pada program "${existing.title}"`,
        dataSebelum: {
          topicId: targetTopic.id,
          code: targetTopic.code,
          title: targetTopic.title,
          duration: targetTopic.duration,
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
      { message: "Gagal menyimpan penyesuaian program pelatihan." },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
          "Hanya Administrator, Super Administrator, atau Admin Sub Unit berizin yang dapat menghapus program pelatihan.",
      },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const existing = await prisma.proglatProgram.findUnique({
    where: { id },
    select: { id: true, code: true, title: true, deletedAt: true },
  });
  if (!existing) {
    return NextResponse.json(
      { message: "Program pelatihan tidak ditemukan." },
      { status: 404 }
    );
  }

  try {
    // Proteksi referensial: cegah penghapusan jika masih ditautkan oleh Jenis Unit Kompetensi aktif
    const linkedJenisUnitCount = await prisma.jenisUnitKompetensi.count({
      where: {
        programId: id,
        deletedAt: null,
      },
    });
    if (linkedJenisUnitCount > 0) {
      return NextResponse.json(
        {
          message: `Program "${existing.title}" tidak dapat dihapus karena masih ditautkan pada ${linkedJenisUnitCount} Jenis Unit Kompetensi aktif.`,
        },
        { status: 409 }
      );
    }

    const softDeleted = await prisma.proglatProgram.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "SOFT_DELETE_PROGLAT",
      modul: "ADMINISTRASI_PROGLAT",
      detail: `Menghapus sementara (soft delete) program pelatihan "${existing.title}" (${existing.code || existing.id}).`,
      dataSebelum: { id: existing.id, deletedAt: existing.deletedAt },
      dataSesudah: { id: softDeleted.id, deletedAt: softDeleted.deletedAt },
      ipAddress: extractClientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      message: `Program "${existing.title}" berhasil dihapus sementara.`,
    });
  } catch (error) {
    console.error("[API PROGLAT DELETE] Error:", error);
    return NextResponse.json(
      { message: "Gagal menghapus program pelatihan." },
      { status: 500 }
    );
  }
}
