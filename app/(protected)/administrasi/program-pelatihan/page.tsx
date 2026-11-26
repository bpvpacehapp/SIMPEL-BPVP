import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canUserAccessMenu } from "@/lib/rbac";
import { ProglatClient } from "@/components/proglat/ProglatClient";

export default async function ProgramPelatihanPage() {
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

  return <ProglatClient userRole={session.user.role} />;
}
