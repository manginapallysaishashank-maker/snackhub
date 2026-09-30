"use client"

import { useTheme } from "@/components/theme-provider"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="rounded-md border px-3 py-2 text-sm font-medium"
    >
      {isDark ? "☀️ Light Mode" : "🌙 Dark Mode"}
    </button>
  )
}
