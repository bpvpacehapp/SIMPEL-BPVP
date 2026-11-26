"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
}

const THEME_STORAGE_KEY = "simpel_theme_mode";

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
});

function applyThemeToDocument(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const shouldBeDark = mode === "dark" || (mode === "system" && prefersDark);
  root.classList.toggle("dark", shouldBeDark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(
        THEME_STORAGE_KEY
      ) as ThemeMode | null;
      const initial: ThemeMode =
        saved === "light" || saved === "dark" || saved === "system"
          ? saved
          : "light";
      setThemeState(initial);
      applyThemeToDocument(initial);
    } catch {
      applyThemeToDocument("light");
    }
  }, []);

  useEffect(() => {
    applyThemeToDocument(theme);

    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyThemeToDocument("system");
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [theme]);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Abaikan
    }
    applyThemeToDocument(mode);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
