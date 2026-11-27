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
    "pelatihan.jenis_pelatihan"
  );
  if (!allowed || session.user.role === "USER") {
    return NextResponse.json(
      { message: "Anda tidak memiliki izin mengubah Jenis Pelatihan." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const existing = await prisma.jenisPelatihan.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { message: "Data jenis pelatihan tidak ditemukan." },
      { status: 404 }
    );
  }

  try {
    const body = (await req.json()) as {
      action?: "restore";
      jenisPelatihan?: string;
    };
    const ipAddress = extractClientIp(req.headers);

    if (body.action === "restore") {
      const duplicate = await prisma.jenisPelatihan.findFirst({
        where: {
          id: { not: id },
          deletedAt: null,
          jenisPelatihan: {
            equals: existing.jenisPelatihan,
            mode: "insensitive",
          },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            message: `Tidak dapat memulihkan karena jenis pelatihan "${existing.jenisPelatihan}" sudah ada yang aktif.`,
          },
          { status: 409 }
        );
      }

      const restored = await prisma.jenisPelatihan.update({
        where: { id },
        data: { deletedAt: null },
      });

      await catatLogAktivitas({
        userId: session.user.id,
        userName: session.user.nama,
        aksi: "RESTORE_JENIS_PELATIHAN",
        modul: "PELATIHAN_JENIS",
        detail: `Memulihkan jenis pelatihan "${restored.jenisPelatihan}".`,
        dataSebelum: {
          id: existing.id,
          jenisPelatihan: existing.jenisPelatihan,
          deletedAt: existing.deletedAt,
        },
        dataSesudah: {
          id: restored.id,
          jenisPelatihan: restored.jenisPelatihan,
          deletedAt: null,
        },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        data: restored,
        message: `Jenis pelatihan "${restored.jenisPelatihan}" berhasil dipulihkan.`,
      });
    }

    const nextName = body.jenisPelatihan?.trim() || "";
    if (!nextName) {
      return NextResponse.json(
        { message: "Nama Jenis Pelatihan wajib diisi." },
        { status: 400 }
      );
    }

    const duplicate = await prisma.jenisPelatihan.findFirst({
      where: {
        id: { not: id },
        deletedAt: null,
        jenisPelatihan: { equals: nextName, mode: "insensitive" },
      },
    });
    if (duplicate) {
      return NextResponse.json(
        { message: `Jenis pelatihan "${nextName}" sudah terdaftar.` },
        { status: 409 }
      );
    }

    const updated = await prisma.jenisPelatihan.update({
      where: { id },
      data: { jenisPelatihan: nextName },
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "UPDATE_JENIS_PELATIHAN",
      modul: "PELATIHAN_JENIS",
      detail: `Mengubah jenis pelatihan "${existing.jenisPelatihan}" menjadi "${updated.jenisPelatihan}".`,
      dataSebelum: {
        id: existing.id,
        jenisPelatihan: existing.jenisPelatihan,
      },
      dataSesudah: {
        id: updated.id,
        jenisPelatihan: updated.jenisPelatihan,
      },
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Jenis pelatihan berhasil diperbarui menjadi "${updated.jenisPelatihan}".`,
    });
  } catch (error) {
    console.error("[API JENIS PELATIHAN PATCH] Error:", error);
    return NextResponse.json(
      { message: "Gagal memperbarui Jenis Pelatihan." },
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
    "pelatihan.jenis_pelatihan"
  );
  if (!allowed || session.user.role === "USER") {
    return NextResponse.json(
      { message: "Anda tidak memiliki izin menghapus Jenis Pelatihan." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const existing = await prisma.jenisPelatihan.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { message: "Data jenis pelatihan tidak ditemukan." },
      { status: 404 }
    );
  }

  try {
    const softDeleted = await prisma.jenisPelatihan.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "SOFT_DELETE_JENIS_PELATIHAN",
      modul: "PELATIHAN_JENIS",
      detail: `Menghapus sementara (soft delete) jenis pelatihan "${existing.jenisPelatihan}".`,
      dataSebelum: {
        id: existing.id,
        jenisPelatihan: existing.jenisPelatihan,
        deletedAt: existing.deletedAt,
      },
      dataSesudah: {
        id: softDeleted.id,
        jenisPelatihan: softDeleted.jenisPelatihan,
        deletedAt: softDeleted.deletedAt,
      },
      ipAddress: extractClientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      data: softDeleted,
      message: `Jenis pelatihan "${existing.jenisPelatihan}" berhasil dihapus sementara.`,
    });
  } catch (error) {
    console.error("[API JENIS PELATIHAN DELETE] Error:", error);
    return NextResponse.json(
      { message: "Gagal menghapus Jenis Pelatihan." },
      { status: 500 }
    );
  }
}
