"use client"

import { useStoreStatus } from "@/lib/store-status"

export function StoreClosedBanner() {
  const { closed } = useStoreStatus()
  if (!closed) return null

  return (
    <div className="w-full bg-red-600 py-3 text-center font-semibold text-white">
      🔒 Store is closed for today. Please come back tomorrow!
    </div>
  )
}
