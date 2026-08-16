import { supabase } from './supabaseClient'

export async function getAnnouncements({ activeOnly = false } = {}) {
  let query = supabase
    .from('announcements')
    .select('id, message, starts_at, ends_at, created_at, created_by')
    .order('starts_at', { ascending: true })
    .order('created_at', { ascending: true })

  if (activeOnly) {
    const now = new Date().toISOString()
    query = query
      .lte('starts_at', now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
  }

  return query
}

export async function createAnnouncement({ message, startsAt, endsAt, createdBy }) {
  return supabase
    .from('announcements')
    .insert({
      message: message.trim(),
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      created_by: createdBy,
    })
    .select()
    .single()
}

