import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Tabs, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { TabBar, IconButton, Txt } from '@/components/ui'
import { colors, space } from '@/lib/tokens'
import type { Trip } from '@repo/shared/types/database'

function TripHeader({ name }: { name: string }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ backgroundColor: colors.bg, paddingTop: insets.top + 4, paddingHorizontal: space.md, paddingBottom: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton icon="home-outline" size={24} onPress={() => router.navigate('/(app)')} bg={colors.card} />
        <Txt variant="heading" numberOfLines={1} style={{ flex: 1, marginHorizontal: space.sm }}>{name}</Txt>
      </View>
    </View>
  )
}

export default function TripLayout() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [name, setName] = useState('Viaggio')

  useEffect(() => {
    supabase.from('trips').select('name').eq('id', id).single()
      .then(({ data }) => { if (data) setName((data as Pick<Trip, 'name'>).name) })
  }, [id])

  return (
    <Tabs
      tabBar={props => <TabBar {...props} />}
      screenOptions={{ header: () => <TripHeader name={name} /> }}
    >
      <Tabs.Screen name="overview"  options={{ title: 'Panoramica', headerShown: false }} />
      <Tabs.Screen name="index"     options={{ title: 'Itinerario' }} />
      <Tabs.Screen name="expenses"  options={{ title: 'Spese' }} />
      <Tabs.Screen name="more"      options={{ title: 'Altro', headerShown: false }} />
      {/* Raggiungibili da Panoramica / Altro, non nella tab bar */}
      <Tabs.Screen name="notes"       options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="documents"   options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="group"       options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="leaderboard" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="suggestions" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="psicologo"   options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="trivia"      options={{ href: null, headerShown: false }} />
    </Tabs>
  )
}
