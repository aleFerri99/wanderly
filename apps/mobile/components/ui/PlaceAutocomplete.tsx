import { useEffect, useRef, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Input } from './Input'
import { Txt } from './Txt'
import { PressableScale } from './PressableScale'
import { fetchPlaceSuggestions, type PlaceSuggestion } from '@repo/shared/supabase/queries/places'
import { colors, radius, space, shadow } from '@/lib/tokens'

export function PlaceAutocomplete({
  label, icon = 'magnify', value, onChangeText, onSelect, destination, apiKey, placeholder, type = 'amenity',
}: {
  label?: string
  icon?: keyof typeof MaterialCommunityIcons.glyphMap
  value: string
  onChangeText: (v: string) => void
  onSelect: (p: PlaceSuggestion) => void
  destination: string
  apiKey?: string | null
  placeholder?: string
  type?: string | null   // 'amenity' = POI (attività); null = città/quartieri/luoghi (tappe)
}) {
  const [sugg, setSugg] = useState<PlaceSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skip  = useRef(false)

  useEffect(() => {
    if (skip.current) { skip.current = false; return }
    if (timer.current) clearTimeout(timer.current)
    if (!value || value.trim().length < 2) { setSugg([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      const r = await fetchPlaceSuggestions(value, destination, apiKey, type)
      setSugg(r); setOpen(r.length > 0); setLoading(false)
    }, 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value, destination, apiKey, type])

  function pick(p: PlaceSuggestion) {
    skip.current = true
    onSelect(p)
    setSugg([]); setOpen(false)
  }

  return (
    <View style={{ zIndex: 10 }}>
      <Input
        label={label} icon={icon} value={value} placeholder={placeholder}
        onChangeText={onChangeText}
      />
      {loading && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginLeft: 4 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Txt variant="caption" color={colors.textSoft}>Cerco luoghi…</Txt>
        </View>
      )}
      {open && sugg.length > 0 && (
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, marginTop: 6, overflow: 'hidden', ...shadow.card }}>
          {sugg.map((p, i) => (
            <PressableScale key={p.placeId} haptic="light" onPress={() => pick(p)} scaleTo={0.98}>
              <View style={{ paddingVertical: space.md, paddingHorizontal: space.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <MaterialCommunityIcons name="map-marker" size={18} color={colors.tertiary} />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{p.name}</Txt>
                  {p.address ? <Txt variant="caption" color={colors.textSoft} numberOfLines={1}>{p.address}</Txt> : null}
                </View>
              </View>
            </PressableScale>
          ))}
        </View>
      )}
    </View>
  )
}
