import { supabase } from './supabaseClient'

export const PAYMENT_UPDATE_EVENT = 'student-booking-system:payments-updated'
export const PAYMENT_UPDATE_STORAGE_KEY = 'student-booking-system:last-payment-update'

async function resolveTutorIdForBooking(bookingId, fallbackTutorId = null) {
  if (fallbackTutorId) return fallbackTutorId
  if (!bookingId) return null

  const { data, error } = await supabase
    .from('bookings')
    .select('tutor_id')
    .eq('id', bookingId)
    .single()

  if (error) throw error
  return data?.tutor_id || null
}

export function notifyPaymentUpdate(studentId) {
  if (typeof window === 'undefined') return

  const payload = {
    studentId: studentId || null,
    updatedAt: new Date().toISOString(),
  }

  try {
    window.localStorage.setItem(PAYMENT_UPDATE_STORAGE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.warn('Failed to persist payment update signal:', error)
  }

  window.dispatchEvent(new CustomEvent(PAYMENT_UPDATE_EVENT, { detail: payload }))
}

export function subscribeToStudentPayments(studentId, onChange) {
  if (!studentId || typeof onChange !== 'function') {
    return () => {}
  }

  const channel = supabase
    .channel(`payments:${studentId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'payments',
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

export function subscribeToTutorPayments(tutorId, onChange) {
  if (!tutorId || typeof onChange !== 'function') {
    return () => {}
  }

  const channel = supabase
    .channel(`payments:tutor:${tutorId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'payments',
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

// Get payments for a student
export async function getStudentPayments(studentId) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        booking:booking_id(
          lesson_date,
          lesson_time
        )
      `)
      .eq('student_id', studentId)
      .order('payment_date', { ascending: false })
    
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Error fetching payments:', error)
    return { data: null, error }
  }
}

// Create a payment record (for tutor POS system)
export async function createPayment(paymentData) {
  try {
    const tutorId = await resolveTutorIdForBooking(paymentData.bookingId, paymentData.tutorId || null)
    const paymentPayload = {
      booking_id: paymentData.bookingId || null,
      student_id: paymentData.studentId,
      tutor_id: tutorId,
      amount: paymentData.amount,
      currency: paymentData.currency || 'GBP',
      payment_method: paymentData.paymentMethod || 'paypal',
      transaction_reference: paymentData.transactionReference,
      status: paymentData.status || 'completed',
      payment_date: paymentData.paymentDate || new Date().toISOString()
    }

    if (paymentData.orderReference) {
      paymentPayload.order_reference = paymentData.orderReference
    }

    const { data, error } = await supabase
      .from('payments')
      .insert(paymentPayload)
      .select()
      .single()
    
    if (error) throw error
    notifyPaymentUpdate(paymentData.studentId)
    return { data, error: null }
  } catch (error) {
    console.error('Error creating payment:', error)
    return { data: null, error }
  }
}

// Record a payment against an existing booking and mark the booking paid.
export async function recordBookingPayment(paymentData) {
  try {
    const tutorId = await resolveTutorIdForBooking(paymentData.bookingId, paymentData.tutorId || null)
    const paymentPayload = {
      booking_id: paymentData.bookingId,
      student_id: paymentData.studentId,
      tutor_id: tutorId,
      amount: paymentData.amount,
      currency: paymentData.currency || 'GBP',
      payment_method: paymentData.paymentMethod || 'manual',
      transaction_reference: paymentData.transactionReference,
      status: paymentData.status || 'completed',
      payment_date: paymentData.paymentDate || new Date().toISOString()
    }

    if (paymentData.orderReference) {
      paymentPayload.order_reference = paymentData.orderReference
    }

    const { data, error } = await supabase
      .from('payments')
      .insert(paymentPayload)
      .select()
      .single()

    if (error) throw error

    if (paymentData.bookingId && (paymentData.status || 'completed') === 'completed') {
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({
          payment_status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentData.bookingId)

      if (bookingError) throw bookingError
    }

    notifyPaymentUpdate(paymentData.studentId)
    return { data, error: null }
  } catch (error) {
    console.error('Error recording booking payment:', error)
    return { data: null, error }
  }
}

// Record a payment from an external payment provider
export async function recordPayment(bookingId, studentId, amount, paymentReference) {
  try {
    const tutorId = await resolveTutorIdForBooking(bookingId)
    const { data, error } = await supabase
      .from('payments')
      .insert({
        booking_id: bookingId,
        student_id: studentId,
        tutor_id: tutorId,
        amount: amount,
        currency: 'GBP',
        payment_method: 'paypal',
        transaction_reference: paymentReference,
        status: 'completed',
        payment_date: new Date().toISOString()
      })
      .select()
      .single()
    
    if (error) throw error
    notifyPaymentUpdate(studentId)
    return { data, error: null }
  } catch (error) {
    console.error('Error recording payment:', error)
    return { data: null, error }
  }
}

export async function deletePayment(paymentId) {
  try {
    if (!paymentId) throw new Error('Payment ID is required.')

    const { data: payment, error: loadError } = await supabase
      .from('payments')
      .select('id, booking_id')
      .eq('id', paymentId)
      .single()

    if (loadError) throw loadError

    const { error: deleteError } = await supabase
      .from('payments')
      .delete()
      .eq('id', paymentId)

    if (deleteError) throw deleteError

    if (payment?.booking_id) {
      const { data: remainingPayments, error: remainingError } = await supabase
        .from('payments')
        .select('amount, status')
        .eq('booking_id', payment.booking_id)

      if (remainingError) throw remainingError

      const totalPaid = (remainingPayments || [])
        .filter((item) => item.status === 'completed')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0)
      const totalRefunded = (remainingPayments || [])
        .filter((item) => item.status === 'refunded')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0)

      let bookingPaymentStatus = 'unpaid'
      if (totalPaid > 0 && totalRefunded >= totalPaid) {
        bookingPaymentStatus = 'refunded'
      } else if (totalPaid > 0) {
        bookingPaymentStatus = 'paid'
      }

      const { error: bookingError } = await supabase
        .from('bookings')
        .update({
          payment_status: bookingPaymentStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.booking_id)

      if (bookingError) throw bookingError
    }

    notifyPaymentUpdate(payment?.student_id || null)
    return { data: true, error: null }
  } catch (error) {
    console.error('Error deleting payment:', error)
    return { data: null, error }
  }
}

export async function issueRefund(bookingId, studentId, amount) {
  try {
    const refundAmount = Number(amount)
    if (!bookingId) throw new Error('Booking ID is required for refund.')
    if (!studentId) throw new Error('Student ID is required for refund.')
    if (!refundAmount || refundAmount <= 0) throw new Error('Refund amount must be a positive value.')

    const tutorId = await resolveTutorIdForBooking(bookingId)

    const { error: insertError } = await supabase
      .from('payments')
      .insert({
        booking_id: bookingId,
        student_id: studentId,
        tutor_id: tutorId,
        amount: refundAmount,
        currency: 'GBP',
        payment_method: 'refund',
        status: 'refunded',
        payment_date: new Date().toISOString(),
        transaction_reference: `REFUND-${Date.now()}`
      })

    if (insertError) throw insertError

    const { data: bookingPayments, error: paymentsError } = await supabase
      .from('payments')
      .select('amount, status')
      .eq('booking_id', bookingId)

    if (paymentsError) throw paymentsError

    const totalPaid = (bookingPayments || [])
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0)

    const totalRefunded = (bookingPayments || [])
      .filter((p) => p.status === 'refunded')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0)

    const bookingUpdate = {}
    if (totalRefunded >= totalPaid && totalPaid > 0) {
      bookingUpdate.payment_status = 'refunded'
    }

    if (Object.keys(bookingUpdate).length > 0) {
      const { error: bookingError } = await supabase
        .from('bookings')
        .update(bookingUpdate)
        .eq('id', bookingId)
      if (bookingError) throw bookingError
    }

    notifyPaymentUpdate(studentId)
    return { data: true, error: null }
  } catch (error) {
    console.error('Error issuing refund:', error)
    return { data: null, error }
  }
}

