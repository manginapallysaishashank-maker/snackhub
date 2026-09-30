"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"

type StoreStatus = { closed: boolean; setClosed: (v: boolean) => void }

const StoreStatusContext = createContext<StoreStatus>({
  closed: false,
  setClosed: () => {},
})

export function StoreStatusProvider({ children }: { children: ReactNode }) {
  const [closed, setClosedState] = useState(false)

  useEffect(() => {
    try {
      setClosedState(localStorage.getItem("store-closed") === "true")
    } catch {}
  }, [])

  const setClosed = (v: boolean) => {
    setClosedState(v)
    try {
      localStorage.setItem("store-closed", String(v))
    } catch {}
  }

  return (
    <StoreStatusContext.Provider value={{ closed, setClosed }}>
      {children}
    </StoreStatusContext.Provider>
  )
}

export const useStoreStatus = () => useContext(StoreStatusContext)
