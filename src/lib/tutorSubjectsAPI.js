import { supabase } from './supabaseClient'

function normalizeSubjectPayload(subject, tutorId) {
  const name = String(subject.name || '').trim()
  const price = Number(subject.price)

  if (!name) throw new Error('Subject name is required.')
  if (!Number.isFinite(price) || price < 0) throw new Error('Enter a valid subject price.')

  return {
    tutor_id: tutorId,
    name,
    price: Number(price.toFixed(2)),
    is_active: subject.is_active !== false,
  }
}

export async function getTutorSubjects(tutorId, { activeOnly = false } = {}) {
  try {
    if (!tutorId) throw new Error('Tutor ID is required.')

    let query = supabase
      .from('tutor_subjects')
      .select('id, tutor_id, name, price, is_active, created_at, updated_at')
      .eq('tutor_id', tutorId)
      .order('name', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
    if (error) throw error
    return { data: data || [], error: null }
  } catch (error) {
    console.error('Error fetching tutor subjects:', error)
    return { data: null, error }
  }
}

export async function saveTutorSubject(tutorId, subject) {
  try {
    const payload = normalizeSubjectPayload(subject, tutorId)

    const query = subject.id
      ? supabase.from('tutor_subjects').update(payload).eq('id', subject.id).eq('tutor_id', tutorId)
      : supabase.from('tutor_subjects').insert(payload)

    const { data, error } = await query.select().single()
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Error saving tutor subject:', error)
    return { data: null, error }
  }
}

export async function deleteTutorSubject(tutorId, subjectId) {
  try {
    if (!tutorId || !subjectId) throw new Error('Tutor and subject are required.')

    const { error } = await supabase
      .from('tutor_subjects')
      .delete()
      .eq('id', subjectId)
      .eq('tutor_id', tutorId)

    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Error deleting tutor subject:', error)
    return { error }
  }
}
