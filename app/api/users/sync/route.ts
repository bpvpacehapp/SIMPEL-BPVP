import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPegawaiFromSimpeg, type SimpegPegawai } from "@/lib/simpeg";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const [pegawaiList, localUsers] = await Promise.all([
      getPegawaiFromSimpeg(),
      prisma.user.findMany({
        select: {
          id: true,
          nama: true,
          email: true,
          nip: true,
          jabatan: true,
          unitKerja: true,
          subUnitKerja: true,
          fotoUrl: true,
          pegawaiId: true,
        },
      }),
    ]);

    const byId = new Map<string, SimpegPegawai>();
    const byNip = new Map<string, SimpegPegawai>();
    const byEmail = new Map<string, SimpegPegawai>();

    for (const p of pegawaiList) {
      if (p.id) byId.set(p.id, p);
      if (p.nip) byNip.set(p.nip, p);
      if (p.email) byEmail.set(p.email.toLowerCase(), p);
    }

    const usedNips = new Set(
      localUsers.filter((u) => u.nip).map((u) => u.nip!)
    );

    let updatedCount = 0;
    let unchangedCount = 0;
    let notFoundCount = 0;
    const updatedNames: string[] = [];

    for (const user of localUsers) {
      // Prioritas pencocokan: pegawaiId -> nip -> email
      const matched =
        (user.pegawaiId ? byId.get(user.pegawaiId) : undefined) ||
        (user.nip ? byNip.get(user.nip) : undefined) ||
        byEmail.get(user.email.toLowerCase());

      if (!matched) {
        notFoundCount++;
        continue;
      }

      const nextNama = matched.nama || user.nama;
      const candidateNip = matched.nip ?? user.nip;
      const nextNip =
        candidateNip &&
        candidateNip !== user.nip &&
        usedNips.has(candidateNip)
          ? user.nip
          : candidateNip;
      const nextJabatan = matched.jabatan ?? user.jabatan;
      const nextUnitKerja = matched.unitKerja ?? user.unitKerja;
      const nextSubUnitKerja =
        matched.subUnitKerja ?? matched.bagian ?? user.subUnitKerja;
      const nextFotoUrl = matched.fotoUrl ?? user.fotoUrl;
      const nextPegawaiId = matched.id ?? user.pegawaiId;

      const hasChanges =
        nextNama !== user.nama ||
        nextNip !== user.nip ||
        nextJabatan !== user.jabatan ||
        nextUnitKerja !== user.unitKerja ||
        nextSubUnitKerja !== user.subUnitKerja ||
        nextFotoUrl !== user.fotoUrl ||
        nextPegawaiId !== user.pegawaiId;

      if (!hasChanges) {
        unchangedCount++;
        continue;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          nama: nextNama,
          nip: nextNip,
          jabatan: nextJabatan,
          unitKerja: nextUnitKerja,
          subUnitKerja: nextSubUnitKerja,
          fotoUrl: nextFotoUrl,
          pegawaiId: nextPegawaiId,
        },
      });

      if (nextNip) usedNips.add(nextNip);
      updatedCount++;
      updatedNames.push(nextNama);
    }

    const summary = {
      totalChecked: localUsers.length,
      updatedCount,
      unchangedCount,
      notFoundCount,
      updatedNames,
      isMock: process.env.ENABLE_SIMPEG_MOCK === "true",
    };

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: "SINKRONISASI_USER_SIMPEG",
      modul: "MANAJEMEN_USER",
      detail: `Sinkronisasi massal SIMPEG: ${updatedCount} diperbarui, ${unchangedCount} tetap, ${notFoundCount} tidak ditemukan`,
      dataSesudah: summary,
      ipAddress: extractClientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      summary,
      message: `Sinkronisasi selesai: ${updatedCount} diperbarui, ${unchangedCount} tidak berubah, ${notFoundCount} tidak cocok di SIMPEG.`,
    });
  } catch (error) {
    console.error("[API USERS SYNC] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal melakukan sinkronisasi massal dari SIMPEG.",
      },
      { status: 502 }
    );
  }
}
