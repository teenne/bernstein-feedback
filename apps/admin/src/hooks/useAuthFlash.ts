import { useState, useEffect } from "react";
import type { AuthToastKind } from "../components/AuthToast";

export function useAuthFlash(isLoggedIn: boolean, localAuthed: boolean) {
  const [flash, setFlash] = useState<{
    kind: AuthToastKind;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isLoggedIn && !localAuthed) return;
    const raw = sessionStorage.getItem("auth_flash");
    if (!raw) return;
    sessionStorage.removeItem("auth_flash");
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.message) setFlash(parsed);
    } catch {
      /* malformed — ignore */
    }
  }, [isLoggedIn, localAuthed]);

  return [flash, setFlash] as const;
}
