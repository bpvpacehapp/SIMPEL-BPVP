import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";
import {
  CONFIGURABLE_MENUS,
  CONFIGURABLE_ROLES,
  isConfigurableMenuKey,
  isFullAdminRole,
  ROLE_LABELS,
} from "@/lib/rbac";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!isFullAdminRole(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const [roleRows, targetUsers] = await Promise.all([
    prisma.roleMenuPermission.findMany({
      where: { role: { in: CONFIGURABLE_ROLES } },
      select: { role: true, menuKey: true, allowed: true },
    }),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        role: { in: CONFIGURABLE_ROLES },
      },
      orderBy: [{ role: "asc" }, { nama: "asc" }],
      select: {
        id: true,
        nama: true,
        email: true,
        nip: true,
        jabatan: true,
        subUnitKerja: true,
        unitKerja: true,
        role: true,
        menuPermissions: {
          select: { menuKey: true, allowed: true },
        },
      },
    }),
  ]);

  // Bangun peta default per role (DB override -> fallback kode)
  const roleDbMap = new Map<string, boolean>();
  for (const row of roleRows) {
    roleDbMap.set(`${row.role}:${row.menuKey}`, row.allowed);
  }

  const roleDefaults: Record<string, Record<string, boolean>> = {};
  for (const role of CONFIGURABLE_ROLES) {
    roleDefaults[role] = {};
    for (const menu of CONFIGURABLE_MENUS) {
      const dbVal = roleDbMap.get(`${role}:${menu.key}`);
      roleDefaults[role][menu.key] =
        typeof dbVal === "boolean" ? dbVal : menu.defaultByRole[role];
    }
  }

  const users = targetUsers.map((u) => {
    const customOverrides: Record<string, boolean> = {};
    for (const perm of u.menuPermissions) {
      customOverrides[perm.menuKey] = perm.allowed;
    }

    const effectivePermissions: Record<string, boolean> = {};
    for (const menu of CONFIGURABLE_MENUS) {
      effectivePermissions[menu.key] =
        menu.key in customOverrides
          ? customOverrides[menu.key]
          : roleDefaults[u.role][menu.key];
    }

    return {
      id: u.id,
      nama: u.nama,
      email: u.email,
      nip: u.nip,
      jabatan: u.jabatan,
      subUnitKerja: u.subUnitKerja || u.unitKerja,
      role: u.role,
      hasCustomOverride: Object.keys(customOverrides).length > 0,
      customOverrides,
      effectivePermissions,
    };
  });

  return NextResponse.json({
    success: true,
    menus: CONFIGURABLE_MENUS.map((m) => ({
      key: m.key,
      label: m.label,
      group: m.group,
      description: m.description,
    })),
    roleDefaults,
    users,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!isFullAdminRole(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      scope?: "role" | "user" | "reset_user";
      role?: Role;
      userId?: string;
      menuKey?: string;
      allowed?: boolean;
    };

    const ipAddress = extractClientIp(req.headers);

    if (body.scope === "role") {
      if (
        !body.role ||
        !CONFIGURABLE_ROLES.includes(body.role) ||
        !body.menuKey ||
        !isConfigurableMenuKey(body.menuKey) ||
        typeof body.allowed !== "boolean"
      ) {
        return NextResponse.json(
          { message: "Parameter perubahan izin role tidak valid." },
          { status: 400 }
        );
      }

      const prev = await prisma.roleMenuPermission.findUnique({
        where: {
          role_menuKey: { role: body.role, menuKey: body.menuKey },
        },
      });

      const updated = await prisma.roleMenuPermission.upsert({
        where: {
          role_menuKey: { role: body.role, menuKey: body.menuKey },
        },
        create: {
          role: body.role,
          menuKey: body.menuKey,
          allowed: body.allowed,
        },
        update: {
          allowed: body.allowed,
        },
      });

      await catatLogAktivitas({
        userId: session.user.id,
        userName: session.user.nama,
        aksi: "UPDATE_RBAC_ROLE",
        modul: "MANAJEMEN_RBAC",
        detail: `Mengubah akses default menu "${body.menuKey}" untuk role ${ROLE_LABELS[body.role]} menjadi ${body.allowed ? "Diizinkan" : "Ditolak"}`,
        dataSebelum: prev
          ? { role: prev.role, menuKey: prev.menuKey, allowed: prev.allowed }
          : null,
        dataSesudah: {
          role: updated.role,
          menuKey: updated.menuKey,
          allowed: updated.allowed,
        },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        message: `Akses default menu untuk ${ROLE_LABELS[body.role]} berhasil diperbarui.`,
      });
    }

    if (body.scope === "user") {
      if (
        !body.userId ||
        !body.menuKey ||
        !isConfigurableMenuKey(body.menuKey) ||
        typeof body.allowed !== "boolean"
      ) {
        return NextResponse.json(
          { message: "Parameter perubahan izin akun tidak valid." },
          { status: 400 }
        );
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: body.userId },
        select: { id: true, nama: true, email: true, role: true },
      });

      if (!targetUser || !CONFIGURABLE_ROLES.includes(targetUser.role)) {
        return NextResponse.json(
          {
            message:
              "Pengguna tidak ditemukan atau role bukan Admin Sub Unit / Pengguna.",
          },
          { status: 400 }
        );
      }

      const prev = await prisma.userMenuPermission.findUnique({
        where: {
          userId_menuKey: { userId: targetUser.id, menuKey: body.menuKey },
        },
      });

      const updated = await prisma.userMenuPermission.upsert({
        where: {
          userId_menuKey: { userId: targetUser.id, menuKey: body.menuKey },
        },
        create: {
          userId: targetUser.id,
          menuKey: body.menuKey,
          allowed: body.allowed,
        },
        update: {
          allowed: body.allowed,
        },
      });

      await catatLogAktivitas({
        userId: session.user.id,
        userName: session.user.nama,
        aksi: "UPDATE_RBAC_USER",
        modul: "MANAJEMEN_RBAC",
        detail: `Mengatur akses kustom menu "${body.menuKey}" untuk ${targetUser.nama} (${targetUser.email}) menjadi ${body.allowed ? "Diizinkan" : "Ditolak"}`,
        dataSebelum: prev
          ? {
              userId: prev.userId,
              menuKey: prev.menuKey,
              allowed: prev.allowed,
            }
          : null,
        dataSesudah: {
          userId: updated.userId,
          nama: targetUser.nama,
          menuKey: updated.menuKey,
          allowed: updated.allowed,
        },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        message: `Hak akses kustom untuk ${targetUser.nama} berhasil diperbarui.`,
      });
    }

    if (body.scope === "reset_user") {
      if (!body.userId) {
        return NextResponse.json(
          { message: "userId wajib diisi." },
          { status: 400 }
        );
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: body.userId },
        select: {
          id: true,
          nama: true,
          email: true,
          role: true,
          menuPermissions: { select: { menuKey: true, allowed: true } },
        },
      });

      if (!targetUser) {
        return NextResponse.json(
          { message: "Pengguna tidak ditemukan." },
          { status: 404 }
        );
      }

      await prisma.userMenuPermission.deleteMany({
        where: { userId: targetUser.id },
      });

      await catatLogAktivitas({
        userId: session.user.id,
        userName: session.user.nama,
        aksi: "RESET_RBAC_USER",
        modul: "MANAJEMEN_RBAC",
        detail: `Mereset izin menu kustom milik ${targetUser.nama} kembali ke default role ${ROLE_LABELS[targetUser.role]}`,
        dataSebelum: targetUser.menuPermissions,
        dataSesudah: { resetToRoleDefault: targetUser.role },
        ipAddress,
      });

      return NextResponse.json({
        success: true,
        message: `Izin menu ${targetUser.nama} dikembalikan ke default role ${ROLE_LABELS[targetUser.role]}.`,
      });
    }

    return NextResponse.json(
      { message: "Scope RBAC tidak dikenali." },
      { status: 400 }
    );
  } catch (error) {
    console.error("[API RBAC PUT] Error:", error);
    return NextResponse.json(
      { message: "Gagal memperbarui pengaturan hak akses menu." },
      { status: 500 }
    );
  }
}
