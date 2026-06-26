'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface TripCtx {
  tripId:   string
  tripName: string
  setTrip:  (id: string, name: string) => void
  clearTrip: () => void
}

const TripContext = createContext<TripCtx>({
  tripId: '', tripName: '', setTrip: () => {}, clearTrip: () => {},
})

export function TripProvider({ children }: { children: ReactNode }) {
  const [tripId,   setTripId]   = useState('')
  const [tripName, setTripName] = useState('')

  const setTrip = useCallback((id: string, name: string) => {
    setTripId(id); setTripName(name)
  }, [])

  const clearTrip = useCallback(() => {
    setTripId(''); setTripName('')
  }, [])

  return (
    <TripContext.Provider value={{ tripId, tripName, setTrip, clearTrip }}>
      {children}
    </TripContext.Provider>
  )
}

export function useTripContext() {
  return useContext(TripContext)
}
