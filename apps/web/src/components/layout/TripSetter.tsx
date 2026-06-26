'use client'

import { useEffect } from 'react'
import { useTripContext } from './TripContext'

interface Props { tripId: string; tripName: string }

/**
 * Componente invisibile: imposta il viaggio attivo nel TripContext
 * così TopAppBar e BottomNav sanno quale viaggio è aperto.
 * Viene smontato quando si lascia la pagina del viaggio → clearTrip.
 */
export function TripSetter({ tripId, tripName }: Props) {
  const { setTrip, clearTrip } = useTripContext()

  useEffect(() => {
    setTrip(tripId, tripName)
    return () => clearTrip()
  }, [tripId, tripName, setTrip, clearTrip])

  return null
}
