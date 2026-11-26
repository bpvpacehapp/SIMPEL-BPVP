import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { LogAktivitasClient } from "@/components/admin/LogAktivitasClient";

export default async function AdminLogsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  return <LogAktivitasClient />;
}
