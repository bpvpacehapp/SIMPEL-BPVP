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

    // Update nama jenis unit
    const nextJenisUnit = body.jenisUnit?.trim() || "";
    if (!nextJenisUnit) {
      return NextResponse.json(
        { message: "Nama Jenis Unit wajib diisi." },
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
      data: { jenisUnit: nextJenisUnit },
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "UPDATE_JENIS_UNIT",
      modul: "ADMINISTRASI_JENIS_UNIT",
      detail: `Mengubah jenis unit kompetensi "${existing.jenisUnit}" menjadi "${updated.jenisUnit}".`,
      dataSebelum: { id: existing.id, jenisUnit: existing.jenisUnit },
      dataSesudah: { id: updated.id, jenisUnit: updated.jenisUnit },
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
