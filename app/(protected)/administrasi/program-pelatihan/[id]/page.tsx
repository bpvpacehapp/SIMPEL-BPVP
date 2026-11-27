import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessMenu } from "@/lib/rbac";
import {
  ProglatDetailClient,
  type ProglatProgramDetail,
} from "@/components/proglat/ProglatDetailClient";

export default async function ProgramPelatihanDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const allowed = await canUserAccessMenu(
    session.user.id,
    session.user.role,
    "administrasi.proglat"
  );
  if (!allowed) {
    redirect("/dashboard");
  }

  const { id } = await props.params;
  const [program, jenisUnitList] = await Promise.all([
    prisma.proglatProgram.findUnique({
      where: { id },
      include: {
        topics: {
          orderBy: [{ code: "asc" }, { title: "asc" }],
        },
      },
    }),
    prisma.jenisUnitKompetensi.findMany({
      where: { deletedAt: null },
      orderBy: { jenisUnit: "asc" },
      select: { id: true, jenisUnit: true },
    }),
  ]);

  if (!program) {
    notFound();
  }

  const serialized: ProglatProgramDetail = {
    ...program,
    publishedAt: program.publishedAt ? program.publishedAt.toISOString() : null,
    syncedAt: program.syncedAt.toISOString(),
  };

  return (
    <ProglatDetailClient
      initialProgram={serialized}
      jenisUnitOptions={jenisUnitList}
      userRole={session.user.role}
    />
  );
}
