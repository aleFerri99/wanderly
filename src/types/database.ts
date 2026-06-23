// ============================================================
// src/types/database.ts — aggiornato con Moduli E, F, H (V2)
// ============================================================

export type MemberRole    = 'owner' | 'editor' | 'viewer'
export type ActivityStatus = 'todo' | 'done'

export interface Profile {
  id:               string
  username:         string
  full_name:        string | null
  avatar_url:       string | null
  birth_date:       string | null   // Modulo E
  nationality:      string | null   // Modulo E
  gender:           string | null   // Modulo E
  languages:        string[]        // Modulo E
  travel_interests: string[]        // Modulo E
  created_at:       string
  updated_at:       string
}

export interface Trip {
  id:          string
  name:        string
  destination: string | null
  cover_url:   string | null
  start_date:  string | null
  end_date:    string | null
  invite_code: string
  created_by:  string
  created_at:  string
  updated_at:  string
}

export interface TripMember {
  id:        string
  trip_id:   string
  user_id:   string
  role:      MemberRole
  joined_at: string
  profile?:  Profile
}

export interface TripWithMembers extends Trip {
  trip_members: (TripMember & { profile: Profile })[]
}

export interface Day {
  id:         string
  trip_id:    string
  title:      string
  date:       string | null
  date_end:   string | null
  position:   number
  created_at: string
  updated_at: string
}

export interface Activity {
  id:               string
  day_id:           string
  trip_id:          string
  title:            string
  notes:            string | null
  location:         string | null
  time_start:       string | null
  activity_date:    string | null
  duration_minutes: number | null  // Modulo H
  lat:              number | null  // Modulo H
  lng:              number | null  // Modulo H
  position:         number
  status:           ActivityStatus
  created_by:       string | null
  created_at:       string
  updated_at:       string
}

export interface DayWithActivities extends Day {
  activities: Activity[]
}

// ── Modulo F: Recensioni ──────────────────────────────────────
export interface Review {
  id:          string
  user_id:     string
  trip_id:     string
  activity_id: string | null
  day_id:      string | null
  score:       number           // 1-10
  content:     string | null
  created_at:  string
  updated_at:  string
  // join
  reviewer?:   Profile
}

export interface Expense {
  id:          string
  trip_id:     string
  paid_by:     string
  description: string
  amount:      number
  currency:    string
  amount_eur:  number
  split_among: string[]
  created_at:  string
  updated_at:  string
  payer?:      Profile
}

export interface Note {
  id:         string
  trip_id:    string
  content:    string
  updated_by: string | null
  updated_at: string
  created_at: string
  editor?:    Profile
}

// ── Modulo I: Meteo ───────────────────────────────────────────
export interface WeatherCache {
  id:            string
  trip_id:       string
  forecast_date: string
  destination:   string
  condition:     string
  temp_max:      number | null
  temp_min:      number | null
  precipitation: number | null
  weather_code:  number | null
  fetched_at:    string
}

export interface TripSuggestion {
  id:            string
  trip_id:       string
  type:          'weather_alert' | 'reschedule' | 'swap_indoor' | 'new_activity' | 'activity_suggestion'
  title:         string
  body:          string
  activity_data: {
    title:      string
    notes:      string | null
    location:   string | null
    time_start: string | null
  } | null
  priority:      number
  created_at:    string
}

// ── Modulo J: Gamification ────────────────────────────────────
export interface PointsLog {
  id:           string
  trip_id:      string
  user_id:      string
  event_type:   string
  reference_id: string | null
  points:       number
  metadata:     Record<string, unknown> | null
  created_at:   string
}

export interface DailyVote {
  id:         string
  trip_id:    string
  voter_id:   string
  voted_for:  string
  vote_date:  string
  created_at: string
}

// ── Modulo K: Profilo Viaggiatore ─────────────────────────────
export interface TravelerProfile {
  id:                string
  user_id:           string
  trip_id:           string
  adventure_level:   number | null
  cultural_interest: number | null
  food_focus:        number | null
  personality_tags:  string[]
  raw_analysis:      string | null
  generated_at:      string
}

export interface PresenceUser {
  user_id:   string
  username:  string
  avatar_url: string | null
  online_at: string
}

export type Database = {
  public: {
    Tables: {
      // ── Fase 1-2 ──────────────────────────────────────────────
      profiles:           { Row: Profile;           Insert: Omit<Profile, 'created_at' | 'updated_at'>;           Update: Partial<Omit<Profile, 'id' | 'created_at'>> }
      trips:              { Row: Trip;              Insert: Omit<Trip, 'id' | 'invite_code' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Trip, 'id' | 'created_at' | 'invite_code'>> }
      trip_members:       { Row: TripMember;        Insert: Omit<TripMember, 'id' | 'joined_at'>;                Update: Pick<TripMember, 'role'> }
      days:               { Row: Day;               Insert: Omit<Day, 'id' | 'created_at' | 'updated_at'>;       Update: Partial<Omit<Day, 'id' | 'trip_id' | 'created_at'>> }
      activities:         { Row: Activity;          Insert: Omit<Activity, 'id' | 'created_at' | 'updated_at'>;  Update: Partial<Omit<Activity, 'id' | 'trip_id' | 'day_id' | 'created_at'>> }
      reviews:            { Row: Review;            Insert: Omit<Review, 'id' | 'created_at' | 'updated_at'>;    Update: Partial<Omit<Review, 'id' | 'user_id' | 'trip_id' | 'created_at'>> }
      expenses:           { Row: Expense;           Insert: Omit<Expense, 'id' | 'created_at' | 'updated_at'>;   Update: Partial<Omit<Expense, 'id' | 'trip_id' | 'created_at'>> }
      notes:              { Row: Note;              Insert: Omit<Note, 'id' | 'created_at' | 'updated_at'>;      Update: Partial<Omit<Note, 'id' | 'trip_id' | 'created_at'>> }
      // ── Fase 3 ───────────────────────────────────────────────
      weather_cache:      { Row: WeatherCache;      Insert: Omit<WeatherCache, 'id' | 'fetched_at'>;             Update: Partial<Omit<WeatherCache, 'id'>> }
      trip_suggestions:   { Row: TripSuggestion;    Insert: Omit<TripSuggestion, 'id' | 'created_at'>;           Update: Partial<Omit<TripSuggestion, 'id' | 'trip_id' | 'created_at'>> }
      traveler_profiles:  { Row: TravelerProfile;   Insert: Omit<TravelerProfile, 'id' | 'generated_at'>;        Update: Partial<Omit<TravelerProfile, 'id' | 'generated_at'>> }
      points_log:         { Row: PointsLog;         Insert: Omit<PointsLog, 'id' | 'created_at'>;               Update: never }
      daily_votes:        { Row: DailyVote;         Insert: Omit<DailyVote, 'id' | 'created_at'>;               Update: never }
    }
    Functions: {
      join_trip_by_code:  { Args: { p_invite_code: string }; Returns: string }
      delete_own_account: { Args: Record<string, never>;     Returns: void   }
    }
  }
}
