import { View, StyleSheet } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Txt, Card, ProgressBar, ProgressRing } from '@/components/ui'
import { colors, radius, space } from '@/lib/tokens'
import type { DayWithActivities } from '@repo/shared/types/database'

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + 'T00:00:00'); const last = new Date(end + 'T00:00:00')
  while (cur <= last) {
    dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}
function dayCenter(acts: { lat: number | null; lng: number | null }[]): { lat: number; lng: number } | null {
  const v = acts.filter(a => a.lat != null && a.lng != null && (a.lat !== 0 || a.lng !== 0))
  if (!v.length) return null
  return { lat: v.reduce((s, a) => s + a.lat!, 0) / v.length, lng: v.reduce((s, a) => s + a.lng!, 0) / v.length }
}

export function TimelineStatus({ days }: { days: DayWithActivities[] }) {
  const all = days.flatMap(d => d.activities ?? [])
  const total = all.length
  const done = all.filter(a => a.status === 'done').length
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  let completedDays = 0
  days.forEach(d => {
    const acts = d.activities ?? []
    if (d.date && d.date_end && d.date_end > d.date) {
      getDatesInRange(d.date, d.date_end).forEach(ds => {
        const da = acts.filter(a => a.activity_date === ds)
        if (da.length > 0 && da.every(a => a.status === 'done')) completedDays++
      })
    } else if (acts.length > 0 && acts.every(a => a.status === 'done')) completedDays++
  })

  const hasCoord = (a: { lat: number | null; lng: number | null }) => a.lat != null && a.lng != null && (a.lat !== 0 || a.lng !== 0)
  // Preferisci il centro delle attività (coordinate precise da Geoapify); il
  // geocode del titolo-tappa (grossolano/ambiguo) resta solo come fallback.
  const centers = days.map(d => dayCenter(d.activities ?? []) ?? (hasCoord(d) ? { lat: d.lat as number, lng: d.lng as number } : null))
  // I km avanzano solo quando si "passa" da una tappa all'altra: conta il tratto
  // i-1 → i solo se la data della tappa di partenza è già trascorsa (oggi è oltre
  // la sua ultima data → l'hai lasciata).
  const dayPassed = (d: DayWithActivities) => {
    if (!d.date) return false
    const end = d.date_end && d.date_end > d.date ? d.date_end : d.date
    return end < today
  }
  let km = 0
  for (let i = 1; i < centers.length; i++) {
    const p = centers[i - 1], c = centers[i]
    if (p && c && dayPassed(days[i - 1])) km += haversineKm(p, c)
  }
  km = Math.round(km)

  const todayDay = days.find(d => {
    if (!d.date) return false
    if (!d.date_end || d.date_end <= d.date) return d.date === today
    return d.date <= today && today <= d.date_end
  })
  const isMulti = !!(todayDay?.date_end && todayDay.date_end > todayDay.date!)
  const todayActs = isMulti ? (todayDay?.activities ?? []).filter(a => a.activity_date === today) : (todayDay?.activities ?? [])
  const todayDone = todayActs.filter(a => a.status === 'done').length
  const todayTotal = todayActs.length

  const emoji = progress === 100 ? '🎉' : progress >= 75 ? '🔥' : progress >= 50 ? '⚡' : progress >= 25 ? '👣' : '🗺️'
  const label = progress === 100 ? 'Viaggio completato!' : progress >= 75 ? 'Quasi finiti!' : progress >= 50 ? 'Metà strada!' : progress >= 25 ? 'Partiti!' : 'Inizia il viaggio'

  const Stat = ({ icon, value, unit }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; value: number; unit: string }) => (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={16} color={colors.primary} />
      <Txt variant="bodyStrong" style={{ marginTop: 3 }}>{value}</Txt>
      <Txt variant="caption" color={colors.textFaint}>{unit}</Txt>
    </View>
  )

  return (
    <Card elevation="soft" style={{ marginBottom: space.lg }}>
      <View style={styles.row}>
        <ProgressRing progress={total ? done / total : 0} size={76} stroke={8} color={colors.primary} track={colors.primarySoft}>
          <Txt style={{ fontSize: 18 }}>{emoji}</Txt>
          <Txt variant="bodyStrong" color={colors.primary} style={{ fontSize: 15, marginTop: -2 }}>{progress}%</Txt>
        </ProgressRing>
        <View style={{ flex: 1 }}>
          <Txt variant="heading">{label}</Txt>
          <Txt variant="caption" color={colors.textSoft} style={{ marginTop: 2 }}>{done} di {total} attività completate</Txt>
          <View style={{ marginTop: space.sm }}><ProgressBar progress={total ? done / total : 0} color={colors.primary} track={colors.primarySoft} height={7} /></View>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat icon="check-circle-outline" value={done} unit="fatte" />
        <View style={styles.div} />
        <Stat icon="checkbox-blank-circle-outline" value={total - done} unit="da fare" />
        <View style={styles.div} />
        <Stat icon="calendar-check-outline" value={completedDays} unit={completedDays === 1 ? 'giorno' : 'giorni'} />
        <View style={styles.div} />
        <Stat icon="map-marker-distance" value={km} unit="km" />
      </View>

      {todayDay && todayTotal > 0 && (
        <View style={styles.today}>
          <MaterialCommunityIcons name="white-balance-sunny" size={15} color={colors.secondary} />
          <Txt variant="caption" color={colors.textSoft}>Oggi {todayDone}/{todayTotal}</Txt>
          <View style={{ flex: 1 }}><ProgressBar progress={todayTotal ? todayDone / todayTotal : 0} color={colors.secondary} track={colors.secondarySoft} height={6} /></View>
          <Txt variant="caption" color={colors.secondary}>{todayTotal ? Math.round((todayDone / todayTotal) * 100) : 0}%</Txt>
        </View>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  stats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg },
  stat:  { flex: 1, alignItems: 'center', gap: 1 },
  div:   { width: 1, height: 30, backgroundColor: colors.line },
  today: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, backgroundColor: colors.bg, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: space.md },
})
