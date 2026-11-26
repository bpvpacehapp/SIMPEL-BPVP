import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";

const VALID_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.USER];

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const target = await prisma.user.findUnique({ where: { id } });

  if (!target) {
    return NextResponse.json(
      { message: "Pengguna tidak ditemukan." },
      { status: 404 }
    );
  }

  try {
    const body = (await req.json()) as {
      role?: Role;
      aktif?: boolean;
    };

    const isSelf = target.id === session.user.id;
    const nextRole = body.role ?? target.role;
    const nextAktif =
      typeof body.aktif === "boolean" ? body.aktif : target.deletedAt === null;

    if (body.role && !VALID_ROLES.includes(body.role)) {
      return NextResponse.json(
        { message: "Role tidak valid." },
        { status: 400 }
      );
    }

    // Proteksi: ADMIN tidak boleh ubah atau angkat SUPER_ADMIN
    if (
      session.user.role !== Role.SUPER_ADMIN &&
      (target.role === Role.SUPER_ADMIN || nextRole === Role.SUPER_ADMIN)
    ) {
      return NextResponse.json(
        {
          message:
            "Hanya SUPER_ADMIN yang dapat mengubah atau menetapkan role SUPER_ADMIN.",
        },
        { status: 403 }
      );
    }

    // Proteksi: tidak boleh menonaktifkan akun sendiri
    if (isSelf && !nextAktif) {
      return NextResponse.json(
        { message: "Anda tidak dapat menonaktifkan akun Anda sendiri." },
        { status: 400 }
      );
    }

    // Proteksi: minimal 1 SUPER_ADMIN aktif harus tersisa
    const losingSuperAdmin =
      target.role === Role.SUPER_ADMIN &&
      target.deletedAt === null &&
      (nextRole !== Role.SUPER_ADMIN || !nextAktif);

    if (losingSuperAdmin) {
      const activeSuperAdmins = await prisma.user.count({
        where: { role: Role.SUPER_ADMIN, deletedAt: null },
      });
      if (activeSuperAdmins <= 1) {
        return NextResponse.json(
          {
            message:
              "Tidak dapat mengubah role atau menonaktifkan satu-satunya SUPER_ADMIN aktif.",
          },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        role: nextRole,
        deletedAt: nextAktif ? null : target.deletedAt ?? new Date(),
        ...(nextAktif
          ? {}
          : { sessionToken: null, tokenExpiredAt: new Date(0) }),
      },
      select: {
        id: true,
        nama: true,
        email: true,
        nip: true,
        jabatan: true,
        unitKerja: true,
        subUnitKerja: true,
        role: true,
        deletedAt: true,
        lastLoginAt: true,
        updatedAt: true,
      },
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "UPDATE_USER",
      modul: "MANAJEMEN_USER",
      detail: `Memperbarui pengguna ${updated.nama} (${updated.email}): role=${updated.role}, aktif=${updated.deletedAt === null}`,
      dataSebelum: {
        role: target.role,
        deletedAt: target.deletedAt,
      },
      dataSesudah: {
        role: updated.role,
        deletedAt: updated.deletedAt,
      },
      ipAddress: extractClientIp(req.headers),
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[API USERS PATCH] Error:", error);
    return NextResponse.json(
      { message: "Gagal memperbarui data pengguna." },
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
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const target = await prisma.user.findUnique({ where: { id } });

  if (!target) {
    return NextResponse.json(
      { message: "Pengguna tidak ditemukan." },
      { status: 404 }
    );
  }

  if (target.id === session.user.id) {
    return NextResponse.json(
      { message: "Anda tidak dapat menonaktifkan akun Anda sendiri." },
      { status: 400 }
    );
  }

  if (
    session.user.role !== Role.SUPER_ADMIN &&
    target.role === Role.SUPER_ADMIN
  ) {
    return NextResponse.json(
      { message: "Hanya SUPER_ADMIN yang dapat menonaktifkan SUPER_ADMIN." },
      { status: 403 }
    );
  }

  if (target.role === Role.SUPER_ADMIN && target.deletedAt === null) {
    const activeSuperAdmins = await prisma.user.count({
      where: { role: Role.SUPER_ADMIN, deletedAt: null },
    });
    if (activeSuperAdmins <= 1) {
      return NextResponse.json(
        { message: "Minimal harus tersisa 1 SUPER_ADMIN aktif." },
        { status: 400 }
      );
    }
  }

  const deleted = await prisma.user.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      sessionToken: null,
      tokenExpiredAt: new Date(0),
    },
    select: { id: true, nama: true, email: true, role: true, deletedAt: true },
  });

  await catatLogAktivitas({
    userId: session.user.id,
    userName: session.user.nama,
    aksi: "SOFT_DELETE",
    modul: "MANAJEMEN_USER",
    detail: `Menonaktifkan (soft delete) pengguna ${deleted.nama} (${deleted.email})`,
    dataSebelum: { deletedAt: target.deletedAt },
    dataSesudah: { deletedAt: deleted.deletedAt },
    ipAddress: extractClientIp(req.headers),
  });

  return NextResponse.json({ success: true, data: deleted });
}
