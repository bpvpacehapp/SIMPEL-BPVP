import type { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SessionTracker } from "@/components/layout/SessionTracker";
import { ProtectedShell } from "@/components/layout/ProtectedShell";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <>
      <SessionTracker />
      <ProtectedShell user={session.user}>{children}</ProtectedShell>
    </>
  );
}
