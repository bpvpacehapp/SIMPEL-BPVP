import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchAllSkkniDocuments } from "@/lib/skkni";
import { catatLogAktivitas, extractClientIp } from "@/lib/audit";

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

  try {
    const body = (await req.json()) as {
      action?: "UPDATE" | "ADD" | "SKIP";
    };

    if (body.action === "SKIP") {
      return NextResponse.json({
        success: true,
        message: "Dokumen dilewati tanpa perubahan.",
      });
    }

    const { documents } = await fetchAllSkkniDocuments(6);
    const fresh = documents.find((d) => d.id === id);

    if (!fresh) {
      return NextResponse.json(
        { message: "Dokumen dengan ID tersebut tidak ditemukan di API SKKNI Kemnaker." },
        { status: 404 }
      );
    }

    const docData = {
      number: fresh.number ?? null,
      numberKepmen: fresh.number_kepmen || fresh.number || "-",
      year: fresh.year ?? null,
      sector: fresh.sector || fresh.title || "-",
      title: fresh.title ?? null,
      agencyId: fresh.agency_id ?? null,
      agencyName: fresh.agency_name ?? null,
      availability: fresh.availability || "applied",
      status: fresh.status ?? null,
      notes: fresh.notes ?? null,
      publishedAt: fresh.published_at ?? null,
      fileName: fresh.file_name ?? null,
      filePath: fresh.file_path ?? null,
      tags: Array.isArray(fresh.tags) ? fresh.tags : [],
      syncedAt: new Date(),
    };

    await prisma.$transaction(async (tx) => {
      await tx.skkniDocument.upsert({
        where: { id: fresh.id },
        create: { id: fresh.id, ...docData },
        update: docData,
      });

      await tx.skkniUnit.deleteMany({ where: { documentId: fresh.id } });
      if (fresh.units.length > 0) {
        await tx.skkniUnit.createMany({
          data: fresh.units.map((u) => ({
            id: u.id,
            documentId: fresh.id,
            code: u.code,
            title: u.title,
            titleEn: u.title_en ?? null,
            availability: u.availability ?? null,
          })),
          skipDuplicates: true,
        });
      }
    });

    await catatLogAktivitas({
      userId: session.user.id,
      userName: session.user.nama,
      aksi: body.action === "ADD" ? "TAMBAH_SKKNI" : "UPDATE_SKKNI",
      modul: "ADMINISTRASI_SKKNI",
      detail: `Sinkronisasi ulang dokumen SKKNI ${fresh.number_kepmen} (${fresh.id})`,
      ipAddress: extractClientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      message: `Dokumen ${fresh.number_kepmen} berhasil diperbarui dari API Kemnaker.`,
    });
  } catch (error) {
    console.error("[API SKKNI PATCH] Error:", error);
    return NextResponse.json(
      { message: "Gagal memperbarui dokumen SKKNI." },
      { status: 500 }
    );
  }
}
