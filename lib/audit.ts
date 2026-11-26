import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface AuditLogInput {
  userId?: string | null;
  userName?: string | null;
  aksi: string;
  modul: string;
  detail?: string | null;
  dataSebelum?: Prisma.InputJsonValue | null;
  dataSesudah?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
}

export function extractClientIp(headers?: Headers | null): string | null {
  if (!headers) return null;
  const forwarded = headers.get("x-forwarded-for");
  const raw = forwarded
    ? forwarded.split(",")[0]?.trim() || null
    : headers.get("x-real-ip") || null;

  if (!raw) return null;
  if (raw === "::1" || raw === "::ffff:127.0.0.1") return "127.0.0.1";
  return raw.replace(/^::ffff:/, "");
}

export async function catatLogAktivitas(input: AuditLogInput): Promise<void> {
  try {
    await prisma.logAktivitas.create({
      data: {
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        aksi: input.aksi,
        modul: input.modul,
        detail: input.detail ?? null,
        dataSebelum: input.dataSebelum ?? undefined,
        dataSesudah: input.dataSesudah ?? undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error("[AUDIT] Gagal mencatat log aktivitas:", error);
  }
}
