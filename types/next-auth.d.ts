import type { Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    nama: string;
    email: string;
    role: Role;
    nip?: string | null;
    jabatan?: string | null;
    unitKerja?: string | null;
    subUnitKerja?: string | null;
    fotoUrl?: string | null;
    ssoToken?: string;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      nama: string;
      email: string;
      role: Role;
      nip?: string | null;
      jabatan?: string | null;
      unitKerja?: string | null;
      subUnitKerja?: string | null;
      fotoUrl?: string | null;
    };
    expiresAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    nama?: string;
    email?: string;
    role?: Role;
    nip?: string | null;
    jabatan?: string | null;
    unitKerja?: string | null;
    subUnitKerja?: string | null;
    fotoUrl?: string | null;
    ssoToken?: string;
    expiresAt?: number;
    exp?: number;
  }
}
