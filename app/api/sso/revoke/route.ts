import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";

function verifyBearerSecret(authHeader: string | null): boolean {
  const expectedSecret = process.env.SSO_SECRET;
  if (!expectedSecret || !authHeader) return false;

  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;

  const incoming = authHeader.slice(prefix.length).trim();
  const a = Buffer.from(incoming, "utf8");
  const b = Buffer.from(expectedSecret, "utf8");

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!verifyBearerSecret(req.headers.get("authorization"))) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as { email?: string; token?: string };
    const email = body?.email?.trim().toLowerCase();
    const token = body?.token?.trim();

    if (!email && !token) {
      return NextResponse.json(
        { success: false, message: "Parameter email atau token wajib diisi." },
        { status: 400 }
      );
    }

    const whereClause =
      email && token
        ? { OR: [{ email }, { sessionToken: token }] }
        : email
          ? { email }
          : { sessionToken: token };

    const targets = await prisma.user.findMany({
      where: whereClause,
      select: { id: true, nama: true, email: true },
    });

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        revoked: 0,
        message: "Tidak ada sesi pengguna yang cocok.",
      });
    }

    await prisma.user.updateMany({
      where: { id: { in: targets.map((t) => t.id) } },
      data: {
        sessionToken: null,
        tokenExpiredAt: new Date(0),
      },
    });

    const ipAddress = extractClientIp(req.headers);

    for (const target of targets) {
      await catatLogAktivitas({
        userId: target.id,
        userName: target.nama,
        aksi: "REVOKE_SSO",
        modul: "AUTENTIKASI",
        detail: `Sesi dicabut melalui Single Logout Central SSO (${target.email})`,
        ipAddress,
      });
    }

    return NextResponse.json({
      success: true,
      revoked: targets.length,
      message: "Sesi pengguna berhasil dicabut.",
    });
  } catch (error) {
    console.error("[SSO REVOKE] Gagal memproses revoke:", error);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan saat mencabut sesi." },
      { status: 500 }
    );
  }
}
