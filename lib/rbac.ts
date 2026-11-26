import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MenuKey =
  | "dashboard"
  | "administrasi.skkni"
  | "administrasi.proglat"
  | "administrasi.users"
  | "administrasi.logs";

export interface AppMenuDefinition {
  key: MenuKey;
  label: string;
  group: string;
  href: string;
  description: string;
  configurable: boolean; // true = bisa di-toggle untuk ADMIN_SUB_UNIT & USER
  defaultByRole: Record<Role, boolean>;
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Administrator",
  ADMIN: "Administrator",
  ADMIN_SUB_UNIT: "Admin Sub Unit",
  USER: "Pengguna",
};

export const CONFIGURABLE_ROLES: Role[] = [Role.ADMIN_SUB_UNIT, Role.USER];

export const APP_MENUS: AppMenuDefinition[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    group: "Utama",
    href: "/dashboard",
    description: "Ringkasan sistem dan profil pegawai tersinkron SSO/SIMPEG.",
    configurable: true,
    defaultByRole: {
      SUPER_ADMIN: true,
      ADMIN: true,
      ADMIN_SUB_UNIT: true,
      USER: true,
    },
  },
  {
    key: "administrasi.skkni",
    label: "SKKNI",
    group: "Administrasi",
    href: "/administrasi/skkni",
    description:
      "Daftar dokumen SKKNI, pencarian unit kompetensi, dan pengunduhan PDF resmi.",
    configurable: true,
    defaultByRole: {
      SUPER_ADMIN: true,
      ADMIN: true,
      ADMIN_SUB_UNIT: false,
      USER: false,
    },
  },
  {
    key: "administrasi.proglat",
    label: "Program Pelatihan",
    group: "Administrasi",
    href: "/administrasi/program-pelatihan",
    description:
      "Data Program Pelatihan dari Proglat Kemnaker, detail unit kompetensi, penyesuaian manual, dan preview PDF.",
    configurable: true,
    defaultByRole: {
      SUPER_ADMIN: true,
      ADMIN: true,
      ADMIN_SUB_UNIT: false,
      USER: false,
    },
  },
  {
    key: "administrasi.users",
    label: "Manajemen User & RBAC",
    group: "Administrasi",
    href: "/admin/users",
    description: "Pengelolaan whitelist pengguna dan pengaturan hak akses menu.",
    configurable: false,
    defaultByRole: {
      SUPER_ADMIN: true,
      ADMIN: true,
      ADMIN_SUB_UNIT: false,
      USER: false,
    },
  },
  {
    key: "administrasi.logs",
    label: "Log Aktivitas",
    group: "Administrasi",
    href: "/admin/logs",
    description: "Audit trail aktivitas CRUD dan autentikasi seluruh pengguna.",
    configurable: false,
    defaultByRole: {
      SUPER_ADMIN: true,
      ADMIN: true,
      ADMIN_SUB_UNIT: false,
      USER: false,
    },
  },
];

export const CONFIGURABLE_MENUS = APP_MENUS.filter((m) => m.configurable);

export function isFullAdminRole(role: Role): boolean {
  return role === Role.SUPER_ADMIN || role === Role.ADMIN;
}

export function isConfigurableMenuKey(key: string): key is MenuKey {
  return CONFIGURABLE_MENUS.some((m) => m.key === key);
}

/**
 * Mengembalikan daftar MenuKey efektif yang boleh diakses oleh user tertentu.
 * - SUPER_ADMIN & ADMIN selalu memiliki akses penuh ke semua menu.
 * - ADMIN_SUB_UNIT & USER menggabungkan default role (DB -> fallback kode)
 *   dan override kustom per akun (override per akun selalu menang).
 */
export async function getEffectiveUserMenus(
  userId: string,
  role: Role
): Promise<MenuKey[]> {
  if (isFullAdminRole(role)) {
    return APP_MENUS.map((m) => m.key);
  }

  const [roleRows, userRows] = await Promise.all([
    prisma.roleMenuPermission.findMany({
      where: { role },
      select: { menuKey: true, allowed: true },
    }),
    prisma.userMenuPermission.findMany({
      where: { userId },
      select: { menuKey: true, allowed: true },
    }),
  ]);

  const roleMap = new Map(roleRows.map((r) => [r.menuKey, r.allowed]));
  const userMap = new Map(userRows.map((u) => [u.menuKey, u.allowed]));

  const allowedKeys: MenuKey[] = [];

  for (const menu of APP_MENUS) {
    if (!menu.configurable) continue;

    if (userMap.has(menu.key)) {
      if (userMap.get(menu.key)) allowedKeys.push(menu.key);
      continue;
    }

    if (roleMap.has(menu.key)) {
      if (roleMap.get(menu.key)) allowedKeys.push(menu.key);
      continue;
    }

    if (menu.defaultByRole[role]) {
      allowedKeys.push(menu.key);
    }
  }

  return allowedKeys;
}

export async function canUserAccessMenu(
  userId: string,
  role: Role,
  menuKey: MenuKey
): Promise<boolean> {
  if (isFullAdminRole(role)) return true;
  const menus = await getEffectiveUserMenus(userId, role);
  return menus.includes(menuKey);
}
