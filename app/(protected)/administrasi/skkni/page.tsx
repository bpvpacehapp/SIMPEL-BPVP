import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canUserAccessMenu } from "@/lib/rbac";
import { SkkniClient } from "@/components/skkni/SkkniClient";

export default async function SkkniPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const allowed = await canUserAccessMenu(
    session.user.id,
    session.user.role,
    "administrasi.skkni"
  );
  if (!allowed) {
    redirect("/dashboard");
  }

  return <SkkniClient userRole={session.user.role} />;
}
