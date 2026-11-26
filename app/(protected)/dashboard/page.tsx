import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ShieldCheck,
  Users,
  Building2,
  Briefcase,
  Mail,
  IdCard,
  ArrowRight,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  const user = session.user;
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const [totalUsers, activeUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { deletedAt: null } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2">
          <img
            src="/logo-kemnaker.png"
            alt="Logo SIMPEL BPVP"
            className="h-full w-full object-contain"
          />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">
            Selamat Datang, {user.nama}
          </h1>
          <p className="mt-0.5 text-sm text-black/75 dark:text-slate-300">
            Sistem Informasi Manajemen Pelatihan (SIMPEL BPVP) — Ekosistem
            Digital BPVP Banda Aceh.
          </p>
        </div>
      </div>

      {/* Kartu Ringkasan */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Status Autentikasi
            </span>
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-2 text-lg font-bold text-slate-900">
            Terhubung Central SSO
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Sliding session 1 jam &amp; Single Logout aktif.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Hak Akses Anda
            </span>
            <Briefcase className="h-5 w-5 text-blue-600" />
          </div>
          <p className="mt-2 text-lg font-bold text-slate-900">{user.role}</p>
          <p className="mt-1 text-xs text-slate-500">
            Disinkronkan real-time dari database lokal.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Pengguna Terdaftar
            </span>
            <Users className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="mt-2 text-lg font-bold text-slate-900">
            {activeUsers} Aktif{" "}
            <span className="text-sm font-normal text-slate-400">
              / {totalUsers} Total
            </span>
          </p>
          {isAdmin && (
            <Link
              href="/admin/users"
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Kelola Pengguna
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Profil Pegawai Tersinkron */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">
          Profil Pegawai Tersinkron (SSO &amp; SIMPEG)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <Mail className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Email</p>
              <p className="font-medium text-slate-900">{user.email}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <IdCard className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-500">NIP</p>
              <p className="font-medium text-slate-900">{user.nip || "-"}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Briefcase className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Jabatan</p>
              <p className="font-medium text-slate-900">
                {user.jabatan || "-"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Building2 className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Unit / Sub Unit Kerja</p>
              <p className="font-medium text-slate-900">
                {user.unitKerja || "-"}
                {user.subUnitKerja ? ` — ${user.subUnitKerja}` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
