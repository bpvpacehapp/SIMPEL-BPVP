import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessMenu } from "@/lib/rbac";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";

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
    "administrasi.jenis_unit"
  );
  if (!allowed || session.user.role === "USER") {
    return NextResponse.json(
      { message: "Anda tidak memiliki izin mengubah Jenis Unit Kompetensi." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const existing = await prisma.jenisUnitKompetensi.findUnique({
    where: { id },
  });
  if (!existing) {
    return NextResponse.json(
      { message: "Data jenis unit kompetensi tidak ditemukan." },
      { status: 404 }
    );
  }

  try {
    const body = (await req.json()) as {
      action?: "restore";
      jenisUnit?: string;
      memilikiSk?: boolean;
      memilikiSuratKeputusan?: boolean;
      memilikiProgramTersendiri?: boolean;
      programId?: string | null;
    };
    const ipAddress = extractClientIp(req.headers);

    // Pulihkan data hasil soft delete
    if (body.action === "restore") {
      const duplicate = await prisma.jenisUnitKompetensi.findFirst({
        where: {
          id: { not: id },
          deletedAt: null,
          jenisUnit: { equals: existing.jenisUnit, mode: "insensitive" },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            message: `Tidak dapat memulihkan karena jenis unit "${existing.jenisUnit}" sudah ada yang aktif.`,
          },
          { status: 409 }
        );
      }

      const restored = await prisma.jenisUnitKompetensi.update({
        where: { id },
        data: { deletedAt: null },
      });

      await catatLogAktivitas({
        userId: session.user.id,
        userName: session.user.nama,
        aksi: "RESTORE_JENIS_UNIT",
        modul: "ADMINISTRASI_JENIS_UNIT",
        detail: `Memulihkan jenis unit kompetensi "${restored.jenisUnit}".`,
        dataSebelum: {
          id: existing.id,
          jenisUnit: existing.jenisUnit,
          deletedAt: existing.deletedAt,
        },
        dataSesudah: {
          id: restored.id,
          jenisUnit: restored.jenisUnit,
          deletedAt: null,
        },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        data: restored,
        message: `Jenis unit "${restored.jenisUnit}" berhasil dipulihkan.`,
      });
    }

    // Update nama jenis unit & opsi toggle
    const nextJenisUnit = body.jenisUnit?.trim() || "";
    if (!nextJenisUnit) {
      return NextResponse.json(
        { message: "Nama Jenis Unit wajib diisi." },
        { status: 400 }
      );
    }

    const nextMemilikiSk =
      body.memilikiSk !== undefined
        ? Boolean(body.memilikiSk)
        : existing.memilikiSk;
    const nextMemilikiSuratKeputusan =
      body.memilikiSuratKeputusan !== undefined
        ? Boolean(body.memilikiSuratKeputusan)
        : existing.memilikiSuratKeputusan;
    const nextMemilikiProgramTersendiri =
      body.memilikiProgramTersendiri !== undefined
        ? Boolean(body.memilikiProgramTersendiri)
        : existing.memilikiProgramTersendiri;
    const nextProgramId = nextMemilikiProgramTersendiri
      ? (body.programId !== undefined
          ? body.programId?.trim() || null
          : existing.programId)
      : null;

    if (nextMemilikiProgramTersendiri && !nextProgramId) {
      return NextResponse.json(
        {
          message:
            "Silakan pilih Program Pelatihan dari database lokal karena opsi program tersendiri bernilai Ya.",
        },
        { status: 400 }
      );
    }

    const duplicate = await prisma.jenisUnitKompetensi.findFirst({
      where: {
        id: { not: id },
        deletedAt: null,
        jenisUnit: { equals: nextJenisUnit, mode: "insensitive" },
      },
    });
    if (duplicate) {
      return NextResponse.json(
        { message: `Jenis unit "${nextJenisUnit}" sudah terdaftar.` },
        { status: 409 }
      );
    }

    const updated = await prisma.jenisUnitKompetensi.update({
      where: { id },
      data: {
        jenisUnit: nextJenisUnit,
        memilikiSk: nextMemilikiSk,
        memilikiSuratKeputusan: nextMemilikiSuratKeputusan,
        memilikiProgramTersendiri: nextMemilikiProgramTersendiri,
        programId: nextProgramId,
      },
      include: {
        program: { select: { id: true, code: true, title: true } },
      },
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "UPDATE_JENIS_UNIT",
      modul: "ADMINISTRASI_JENIS_UNIT",
      detail: `Mengubah jenis unit kompetensi "${existing.jenisUnit}" menjadi "${updated.jenisUnit}".`,
      dataSebelum: {
        id: existing.id,
        jenisUnit: existing.jenisUnit,
        memilikiSk: existing.memilikiSk,
        memilikiSuratKeputusan: existing.memilikiSuratKeputusan,
        memilikiProgramTersendiri: existing.memilikiProgramTersendiri,
        programId: existing.programId,
      },
      dataSesudah: {
        id: updated.id,
        jenisUnit: updated.jenisUnit,
        memilikiSk: updated.memilikiSk,
        memilikiSuratKeputusan: updated.memilikiSuratKeputusan,
        memilikiProgramTersendiri: updated.memilikiProgramTersendiri,
        programId: updated.programId,
      },
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Jenis unit berhasil diperbarui menjadi "${updated.jenisUnit}".`,
    });
  } catch (error) {
    console.error("[API JENIS UNIT PATCH] Error:", error);
    return NextResponse.json(
      { message: "Gagal memperbarui Jenis Unit Kompetensi." },
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
    "administrasi.jenis_unit"
  );
  if (!allowed || session.user.role === "USER") {
    return NextResponse.json(
      { message: "Anda tidak memiliki izin menghapus Jenis Unit Kompetensi." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const existing = await prisma.jenisUnitKompetensi.findUnique({
    where: { id },
  });
  if (!existing) {
    return NextResponse.json(
      { message: "Data jenis unit kompetensi tidak ditemukan." },
      { status: 404 }
    );
  }

  try {
    // Proteksi referensial: cegah penghapusan jika masih dipakai di Program Pelatihan aktif
    const usedByTopicsCount = await prisma.proglatTopic.count({
      where: {
        jenisUnitId: id,
        program: { deletedAt: null },
      },
    });
    if (usedByTopicsCount > 0) {
      return NextResponse.json(
        {
          message: `Jenis unit "${existing.jenisUnit}" tidak dapat dihapus karena masih digunakan oleh ${usedByTopicsCount} unit kompetensi pada Program Pelatihan aktif.`,
        },
        { status: 409 }
      );
    }

    const deletedAt = new Date();
    const softDeleted = await prisma.jenisUnitKompetensi.update({
      where: { id },
      data: { deletedAt },
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "SOFT_DELETE_JENIS_UNIT",
      modul: "ADMINISTRASI_JENIS_UNIT",
      detail: `Menghapus sementara (soft delete) jenis unit kompetensi "${existing.jenisUnit}".`,
      dataSebelum: {
        id: existing.id,
        jenisUnit: existing.jenisUnit,
        deletedAt: existing.deletedAt,
      },
      dataSesudah: {
        id: softDeleted.id,
        jenisUnit: softDeleted.jenisUnit,
        deletedAt: softDeleted.deletedAt,
      },
      ipAddress: extractClientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      data: softDeleted,
      message: `Jenis unit "${existing.jenisUnit}" berhasil dihapus sementara.`,
    });
  } catch (error) {
    console.error("[API JENIS UNIT DELETE] Error:", error);
    return NextResponse.json(
      { message: "Gagal menghapus Jenis Unit Kompetensi." },
      { status: 500 }
    );
  }
}
