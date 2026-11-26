import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPegawaiFromSimpeg } from "@/lib/simpeg";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const search = req.nextUrl.searchParams.get("search")?.trim() || undefined;
    const [pegawaiList, localUsers] = await Promise.all([
      getPegawaiFromSimpeg(search ? { search } : undefined),
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          nip: true,
          pegawaiId: true,
          role: true,
          deletedAt: true,
        },
      }),
    ]);

    const byPegawaiId = new Map(
      localUsers.filter((u) => u.pegawaiId).map((u) => [u.pegawaiId!, u])
    );
    const byNip = new Map(
      localUsers.filter((u) => u.nip).map((u) => [u.nip!, u])
    );
    const byEmail = new Map(
      localUsers.map((u) => [u.email.toLowerCase(), u])
    );

    const enriched = pegawaiList.map((p) => {
      const matched =
        (p.id ? byPegawaiId.get(p.id) : undefined) ||
        (p.nip ? byNip.get(p.nip) : undefined) ||
        (p.email ? byEmail.get(p.email.toLowerCase()) : undefined);

      return {
        ...p,
        isRegistered: Boolean(matched),
        appUserId: matched?.id ?? null,
        appRole: matched?.role ?? null,
        appAktif: matched ? matched.deletedAt === null : false,
      };
    });

    return NextResponse.json({
      success: true,
      isMock: process.env.ENABLE_SIMPEG_MOCK === "true",
      total: enriched.length,
      data: enriched,
    });
  } catch (error) {
    console.error("[API SIMPEG PEGAWAI] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal mengambil data pegawai dari SIMPEG.",
      },
      { status: 502 }
    );
  }
}
