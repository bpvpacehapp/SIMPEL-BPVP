"use client";

import { signOut } from "next-auth/react";

const APP_ID = process.env.NEXT_PUBLIC_APP_ID || "simpel";

export const AUTH_CHANNEL = `${APP_ID}_auth_sync_channel`;
export const LOGOUT_EVENT = `${APP_ID}_cross_tab_logout`;

export function broadcastLogout(): void {
  if (typeof window === "undefined") return;

  try {
    const timestamp = String(Date.now());
    window.localStorage.setItem(LOGOUT_EVENT, timestamp);
  } catch {
    // Abaikan jika localStorage tidak tersedia
  }

  try {
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.postMessage({ type: "LOGOUT", timestamp: Date.now() });
      channel.close();
    }
  } catch {
    // Abaikan jika BroadcastChannel tidak didukung
  }
}

export function clearLogoutSignal(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOGOUT_EVENT);
  } catch {
    // Abaikan
  }
}

export async function performAppSignOut(callbackUrl = "/login"): Promise<void> {
  broadcastLogout();
  await signOut({ callbackUrl });
}
