"use client"

import { useStoreStatus } from "@/lib/store-status"

export function StoreClosedToggle() {
  const { closed, setClosed } = useStoreStatus()

  return (
    <button
      onClick={() => setClosed(!closed)}
      className={`rounded-md px-4 py-2 font-medium text-white ${
        closed ? "bg-green-600" : "bg-red-600"
      }`}
    >
      {closed ? "Reopen Store" : "Closed for Today"}
    </button>
  )
}
