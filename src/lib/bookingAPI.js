// src/lib/bookingAPI.js
import { supabase } from './supabaseClient'
import { notifyPaymentUpdate } from './paymentsAPI'

export const MIN_BOOKING_NOTICE_HOURS = 24

function normalizeTimeValue(lessonTime) {
  if (!lessonTime) return null
  return lessonTime.length === 5 ? `${lessonTime}:00` : lessonTime
}

export function getBookingStartDateTime(lessonDate, lessonTime) {
  if (!lessonDate || !lessonTime) return null

  const normalizedTime = normalizeTimeValue(lessonTime)
  const bookingStart = new Date(`${lessonDate}T${normalizedTime}`)

  return Number.isNaN(bookingStart.getTime()) ? null : bookingStart
}

export function isBookingAtLeast24HoursAway(lessonDate, lessonTime, minimumHours = MIN_BOOKING_NOTICE_HOURS) {
  const bookingStart = getBookingStartDateTime(lessonDate, lessonTime)
  if (!bookingStart) {
    return { valid: false, message: 'Please choose a valid lesson date and time.' }
  }

  const minimumStart = Date.now() + minimumHours * 60 * 60 * 1000
  if (bookingStart.getTime() < minimumStart) {
    return {
      valid: false,
      message: `Students must book at least ${minimumHours} hours in advance.`,
    }
  }

  return { valid: true, message: null }
}

export function subscribeToStudentBookings(studentId, onChange) {
  if (!studentId || typeof onChange !== 'function') {
    return () => {}
  }

  const channel = supabase
    .channel(`bookings:student:${studentId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `student_id=eq.${studentId}`,
      },
      (payload) => {
        onChange(payload)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToTutorBookings(tutorId, onChange) {
  if (!tutorId || typeof onChange !== 'function') {
    return () => {}
  }

  const channel = supabase
    .channel(`bookings:tutor:${tutorId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `tutor_id=eq.${tutorId}`,
      },
      (payload) => {
        onChange(payload)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

function generateHexToken(length = 24) {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, length)
}

function generateSixDigitPasscode() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

function isMissingVideoRoomColumnError(error) {
  const message = String(error?.message || '')
  return (
    message.includes('video_room_token') ||
    message.includes('video_room_passcode')
  )
}

function normalizeBookingPrice(value) {
  const price = Number(value)
  if (!Number.isFinite(price) || price < 0) return null
  return Number(price.toFixed(2))
}

export async function ensureBookingVideoRoom(bookingId) {
  try {
    if (!bookingId) throw new Error('Booking ID is required')

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, video_room_token, video_room_passcode')
      .eq('id', bookingId)
      .single()

    if (bookingError) throw bookingError

    if (booking?.video_room_token) {
      return { data: booking, error: null }
    }

    const token = generateHexToken(24)
    const passcode = booking?.video_room_passcode || generateSixDigitPasscode()
    const { data, error } = await supabase
      .from('bookings')
      .update({
        video_room_token: token,
        video_room_passcode: passcode,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId)
      .select()
      .single()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    if (isMissingVideoRoomColumnError(error)) {
      return {
        data: null,
        error: new Error('Video room columns are missing in Supabase. Run the latest migrations first.')
      }
    }
    console.error('Error ensuring booking video room:', error)
    return { data: null, error }
  }
}

// Create a new booking
export async function createBooking(bookingData) {
  try {
    const createdByRole = bookingData.createdByRole || 'student'

    if (createdByRole === 'student') {
      const leadTimeCheck = isBookingAtLeast24HoursAway(
        bookingData.lessonDate,
        bookingData.lessonTime,
      )

      if (!leadTimeCheck.valid) {
        throw new Error(leadTimeCheck.message)
      }
    }

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        student_id: bookingData.studentId,
        tutor_id: bookingData.tutorId,
        lesson_date: bookingData.lessonDate,
        lesson_time: bookingData.lessonTime,
        duration_minutes: bookingData.duration || 60,
        lesson_subject_id: bookingData.lessonSubjectId || null,
        lesson_subject_name: bookingData.lessonSubjectName || null,
        lesson_price: normalizeBookingPrice(bookingData.lessonPrice),
        status: 'pending',
        payment_status: 'unpaid'
      })
      .select()
      .single()
    
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Error creating booking:', error)
    return { data: null, error }
  }
}

// Get booking by ID with tutor details
export async function getBookingById(bookingId) {
  try {
    if (!bookingId) {
      throw new Error('Booking ID is required')
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (bookingError) throw bookingError
    if (!booking) throw new Error('Booking not found')

    // Get tutor details including hourly rate
    const { data: tutor, error: tutorError } = await supabase
      .from('profiles')
      .select('id, full_name, email, hourly_rate')
      .eq('id', booking.tutor_id)
      .single()

    if (tutorError) throw tutorError

    // Return booking with tutor data
    return {
      data: {
        ...booking,
        tutor: tutor
      },
      error: null
    }
  } catch (error) {
    console.error('Error fetching booking by ID:', error)
    return { data: null, error }
  }
}

// Get bookings for a student
export async function getStudentBookings(studentId) {
  try {
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('student_id', studentId)
      .order('lesson_date', { ascending: false })
    
    if (bookingsError) throw bookingsError
    
    // Then get tutor profiles for each booking
    if (bookings && bookings.length > 0) {
      const tutorIds = [...new Set(bookings.map(b => b.tutor_id))]
      const { data: tutors, error: tutorsError } = await supabase
        .from('profiles')
      .select('id, full_name, email')
        .in('id', tutorIds)
      
      if (tutorsError) throw tutorsError
      
      // Merge tutor data into bookings
      const bookingsWithTutors = bookings.map(booking => ({
        ...booking,
        tutor: tutors?.find(t => t.id === booking.tutor_id) || null
      }))
      
      return { data: bookingsWithTutors, error: null }
    }
    
    return { data: bookings || [], error: null }
  } catch (error) {
    console.error('Error fetching bookings:', error)
    return { data: null, error }
  }
}

// Get bookings for a tutor
export async function getTutorBookings(tutorId) {
  try {
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('tutor_id', tutorId)
      .order('lesson_date', { ascending: false })
    
    if (bookingsError) throw bookingsError
    
    // Then get student profiles for each booking
    if (bookings && bookings.length > 0) {
      const studentIds = [...new Set(bookings.map(b => b.student_id))]
      const { data: students, error: studentsError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', studentIds)
      
      if (studentsError) throw studentsError
      
      // Merge student data into bookings
      const bookingsWithStudents = bookings.map(booking => ({
        ...booking,
        student: students?.find(s => s.id === booking.student_id) || null
      }))
      
      return { data: bookingsWithStudents, error: null }
    }
    
    return { data: bookings || [], error: null }
  } catch (error) {
    console.error('Error fetching bookings:', error)
    return { data: null, error }
  }
}

// Update booking status
export async function updateBookingStatus(bookingId, status) {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', bookingId)
      .select()
      .single()
    
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Error updating booking:', error)
    return { data: null, error }
  }
}

// Update booking schedule (date/time) and optionally status
export async function updateBookingSchedule(bookingId, { lessonDate, lessonTime, status }) {
  try {
    const updatePayload = {}
    if (lessonDate) updatePayload.lesson_date = lessonDate
    if (lessonTime) updatePayload.lesson_time = lessonTime
    if (status) updatePayload.status = status
    updatePayload.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', bookingId)
      .select()
      .single()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Error updating booking schedule:', error)
    return { data: null, error }
  }
}

// Cancel a booking (student initiated)
export async function cancelBooking(bookingId) {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .select()
      .single()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Error cancelling booking:', error)
    return { data: null, error }
  }
}

// Record a cash payment for a booking and mark it paid
export async function markBookingPaidByCash(bookingId, studentId, amount) {
  try {
    const { data: booking, error: bookingLookupError } = await supabase
      .from('bookings')
      .select('id, tutor_id')
      .eq('id', bookingId)
      .single()

    if (bookingLookupError) throw bookingLookupError

    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId)
      .select()
      .single()

    if (error) throw error

    const { error: paymentError } = await supabase
      .from('payments')
      .insert({
        booking_id: bookingId,
        student_id: studentId,
        tutor_id: booking?.tutor_id || null,
        amount,
        currency: 'GBP',
        payment_method: 'cash',
        status: 'completed',
        payment_date: new Date().toISOString(),
        transaction_reference: `CASH-${Date.now()}`
      })

    if (paymentError) throw paymentError
    notifyPaymentUpdate(studentId)
    return { data, error: null }
  } catch (error) {
    console.error('Error marking booking as paid by cash:', error)
    return { data: null, error }
  }
}

// Get tutor availability
export async function getTutorAvailability(tutorId) {
  try {
    const { data, error } = await supabase
      .from('tutor_availability')
      .select('*')
      .eq('tutor_id', tutorId)
      .eq('is_available', true)
    
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Error fetching availability:', error)
    return { data: null, error }
  }
}

// Get blocked time slots
export async function getBlockedTimeSlots(tutorId, startDate, endDate) {
  try {
    const { data, error } = await supabase
      .from('blocked_time_slots')
      .select('*')
      .eq('tutor_id', tutorId)
      .gte('start_datetime', startDate)
      .lte('end_datetime', endDate)
    
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Error fetching blocked slots:', error)
    return { data: null, error }
  }
}
