import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/auth'
import { getAllStudents, getTutorHourlyRate } from '../../lib/profileAPI'
import { getTutorSubjects } from '../../lib/tutorSubjectsAPI'
import { createBooking, getTutorBookings } from '../../lib/bookingAPI'
import { recordBookingPayment, notifyPaymentUpdate } from '../../lib/paymentsAPI'
import { supabase } from '../../lib/supabaseClient'

function parseLessonDate(lessonDate) {
  if (!lessonDate) return null
  const [year, month, day] = String(lessonDate).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function parseLessonDateTime(lessonDate, lessonTime) {
  if (!lessonDate) return null

  if (lessonTime) {
    const parsed = new Date(`${lessonDate}T${lessonTime}`)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  return parseLessonDate(lessonDate)
}

export default function POSSystem() {
  const { user } = useAuth()
  const [students, setStudents] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(false)
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [collectPaymentNow, setCollectPaymentNow] = useState(true)
  const [checkoutMode, setCheckoutMode] = useState('new_booking')
  const [selectedBookingId, setSelectedBookingId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('card')
  const [hourlyRate, setHourlyRate] = useState(30.0)
  const [lessonSubjects, setLessonSubjects] = useState([])
  const [amount, setAmount] = useState(30.0)

  const [formData, setFormData] = useState({
    studentId: '',
    reason: 'Lesson',
    lessonSubjectId: '',
    lessonDate: '',
    lessonTime: '09:00',
    email: '',
    cardholderName: '',
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    postCode: ''
  })

  const loadStudents = useCallback(async () => {
    try {
      const { data } = await getAllStudents()
      setStudents(data || [])
    } catch (err) {
      console.error('Failed to load students', err)
    }
  }, [])

  const loadRate = useCallback(async () => {
    try {
      const { data } = await getTutorHourlyRate(user.id)
      if (data && data.hourly_rate) {
        setHourlyRate(data.hourly_rate)
        setAmount(data.hourly_rate)
      }
    } catch (err) {
      console.error('Failed to load rate', err)
    }
  }, [user.id])

  const loadSubjects = useCallback(async () => {
    try {
      const { data, error } = await getTutorSubjects(user.id, { activeOnly: true })
      if (error) throw error
      setLessonSubjects(data || [])
    } catch (err) {
      console.error('Failed to load lesson subjects', err)
    }
  }, [user.id])

  const loadBookings = useCallback(async () => {
    try {
      setBookingsLoading(true)
      const { data, error } = await getTutorBookings(user.id)
      if (error) throw error
      setBookings(data || [])
    } catch (err) {
      console.error('Failed to load tutor bookings', err)
    } finally {
      setBookingsLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    if (user) {
      loadStudents()
      loadRate()
      loadSubjects()
      loadBookings()
    }
  }, [user, loadStudents, loadRate, loadSubjects, loadBookings])

  const unpaidPastBookings = bookings.filter((booking) => {
    if (!booking) return false
    if (booking.payment_status === 'paid' || booking.payment_status === 'refunded') return false
    if (booking.status === 'cancelled') return false
    const lessonDateTime = parseLessonDateTime(booking.lesson_date, booking.lesson_time)
    if (!lessonDateTime) return false
    return lessonDateTime < new Date()
  })

  const handleStudentChange = (e) => {
    const studentId = e.target.value
    const student = students.find((s) => s.id === studentId)

    setFormData((prev) => ({
      ...prev,
      studentId,
      email: student ? student.email : ''
    }))
  }

  const handleExistingBookingChange = (e) => {
    const bookingId = e.target.value
    setSelectedBookingId(bookingId)

    const booking = bookings.find((item) => item.id === bookingId)
    if (!booking) {
      setFormData((prev) => ({
        ...prev,
        studentId: '',
        email: '',
        reason: 'Lesson',
        lessonSubjectId: '',
        lessonDate: '',
        lessonTime: '09:00',
        cardholderName: '',
        cardNumber: '',
        expiryDate: '',
        cvv: '',
        postCode: ''
      }))
      setAmount(Number(hourlyRate).toFixed(2))
      return
    }

    const student = students.find((s) => s.id === booking.student_id)
    const durationHours = Number(booking.duration_minutes || 60) / 60
    const defaultAmount = Number(
      (Number(booking.lesson_price || hourlyRate || 0) * durationHours).toFixed(2)
    )

    setFormData({
      studentId: booking.student_id,
      reason: 'Lesson payment',
      lessonSubjectId: booking.lesson_subject_id || '',
      lessonDate: booking.lesson_date || '',
      lessonTime: booking.lesson_time || '09:00',
      email: student ? student.email : '',
      cardholderName: '',
      cardNumber: '',
      expiryDate: '',
      cvv: '',
      postCode: ''
    })
    setAmount(defaultAmount || Number(hourlyRate))
  }

  const handleInputChange = (e) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSubjectChange = (e) => {
    const lessonSubjectId = e.target.value
    const selectedSubject = lessonSubjects.find((subject) => subject.id === lessonSubjectId)

    setFormData((prev) => ({
      ...prev,
      lessonSubjectId,
      reason: selectedSubject ? `${selectedSubject.name} lesson` : 'Lesson'
    }))

    if (selectedSubject) {
      setAmount(Number(selectedSubject.price).toFixed(2))
    } else {
      setAmount(Number(hourlyRate).toFixed(2))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const paymentAmount = Number(amount)
      if (!paymentAmount || paymentAmount <= 0) {
        throw new Error('Enter a valid amount to charge.')
      }

      if (checkoutMode === 'existing_booking') {
        const booking = bookings.find((item) => item.id === selectedBookingId)
        if (!booking) {
          throw new Error('Select an unpaid past lesson first.')
        }

        const { error: paymentError } = await recordBookingPayment({
          bookingId: booking.id,
          studentId: booking.student_id,
          tutorId: user.id,
          amount: paymentAmount,
          currency: 'GBP',
          paymentMethod: paymentMethod === 'cash' ? 'cash' : 'pos_card_entry',
          transactionReference: paymentMethod === 'cash' ? `CASH-${Date.now()}` : `POS-${Date.now()}`,
          status: 'completed'
        })

        if (paymentError) throw paymentError

        await loadBookings()
      } else {
        const selectedSubject = lessonSubjects.find((subject) => subject.id === formData.lessonSubjectId)

        const { data: booking, error: bookingError } = await createBooking({
          studentId: formData.studentId,
          tutorId: user.id,
          lessonDate: formData.lessonDate,
          lessonTime: formData.lessonTime,
          duration: 60,
          lessonSubjectId: selectedSubject?.id || null,
          lessonSubjectName: selectedSubject?.name || null,
          lessonPrice: paymentAmount,
          createdByRole: 'tutor'
        })

        if (bookingError) throw bookingError

        if (collectPaymentNow) {
          const { error: updateError } = await supabase
            .from('bookings')
            .update({
              status: 'confirmed',
              payment_status: 'paid',
              updated_at: new Date().toISOString()
            })
            .eq('id', booking.id)

          if (updateError) throw updateError

          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              booking_id: booking.id,
              student_id: formData.studentId,
              tutor_id: user.id,
              amount: paymentAmount,
              currency: 'GBP',
              payment_method: paymentMethod === 'cash' ? 'cash' : 'pos_card_entry',
              status: 'completed',
              payment_date: new Date().toISOString(),
              transaction_reference: paymentMethod === 'cash' ? `CASH-${Date.now()}` : `POS-${Date.now()}`
            })

          if (paymentError) throw paymentError
          notifyPaymentUpdate(formData.studentId)
        } else {
          const { error: updateError } = await supabase
            .from('bookings')
            .update({
              status: 'confirmed',
              payment_status: 'unpaid',
              updated_at: new Date().toISOString()
            })
            .eq('id', booking.id)

          if (updateError) throw updateError
        }
      }

      setSuccess(true)
      setSelectedBookingId('')
      setFormData({
        studentId: '',
        reason: 'Lesson',
        lessonSubjectId: '',
        lessonDate: '',
        lessonTime: '09:00',
        email: '',
        cardholderName: '',
        cardNumber: '',
        expiryDate: '',
        cvv: '',
        postCode: ''
      })
      setAmount(Number(hourlyRate).toFixed(2))
    } catch (err) {
      setError(
        err.message ||
          (checkoutMode === 'existing_booking'
            ? 'Failed to record payment'
            : collectPaymentNow
              ? 'Failed to process transaction'
              : 'Failed to create booking')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pos-system-container">
      <h2>POS System</h2>
      <p className="description">Create bookings on behalf of students, or collect payment for an unpaid lesson from the past.</p>

      {error && <div className="error-message">{error}</div>}
      {success && (
        <div className="success-message">
          {checkoutMode === 'existing_booking'
            ? 'Payment recorded for the existing lesson.'
            : collectPaymentNow
              ? paymentMethod === 'cash'
                ? 'Cash payment recorded and booking confirmed!'
                : 'Payment processed and booking confirmed!'
              : 'Booking created for student without payment.'}
        </div>
      )}

      <form onSubmit={handleSubmit} className="pos-form">
        <div className="form-section lilac-card" style={{ marginBottom: '1rem' }}>
          <h3>Checkout Mode</h3>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="checkoutMode"
                checked={checkoutMode === 'new_booking'}
                onChange={() => {
                  setCheckoutMode('new_booking')
                  setSelectedBookingId('')
                }}
              />
              Create new booking
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.5rem' }}>
              <input
                type="radio"
                name="checkoutMode"
                checked={checkoutMode === 'existing_booking'}
                onChange={() => {
                  setCheckoutMode('existing_booking')
                  setCollectPaymentNow(true)
                }}
              />
              Take payment for an existing unpaid lesson
            </label>
          </div>

          {checkoutMode === 'existing_booking' && (
            <div className="form-group">
              <label htmlFor="existingBookingId">Unpaid past lessons</label>
              <select
                id="existingBookingId"
                value={selectedBookingId}
                onChange={handleExistingBookingChange}
                disabled={bookingsLoading}
                required
              >
                <option value="">{bookingsLoading ? 'Loading lessons...' : 'Select a lesson...'}</option>
                {unpaidPastBookings.map((booking) => (
                  <option key={booking.id} value={booking.id}>
                    {booking.student?.full_name || 'Unknown student'} - {booking.lesson_date} {booking.lesson_time} - {booking.payment_status}
                  </option>
                ))}
              </select>
              <small style={{ color: '#374151' }}>
                Only unpaid lessons from the past are shown here.
              </small>
            </div>
          )}

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={collectPaymentNow}
                onChange={(e) => setCollectPaymentNow(e.target.checked)}
                disabled={checkoutMode === 'existing_booking'}
              />
              Collect payment now
            </label>
            <small style={{ color: '#374151' }}>
              Turn this off to create a confirmed booking without charging the student.
            </small>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-section lilac-card">
            <h3>Booking Details</h3>

            {checkoutMode === 'existing_booking' ? (
              <>
                <div className="form-group">
                  <label>Selected Student</label>
                  <input
                    type="text"
                    value={students.find((student) => student.id === formData.studentId)?.full_name || ''}
                    readOnly
                    className="bg-gray"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email Address</label>
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    readOnly
                    className="bg-gray"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="reason">Reason for payment *</label>
                  <input
                    type="text"
                    id="reason"
                    value={formData.reason}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                {formData.lessonSubjectId && (
                  <div className="form-group">
                    <label>Lesson Subject</label>
                    <input
                      type="text"
                      value={bookings.find((item) => item.id === selectedBookingId)?.lesson_subject_name || ''}
                      readOnly
                      className="bg-gray"
                    />
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="lessonDate">Lesson Date</label>
                    <input
                      type="date"
                      id="lessonDate"
                      value={formData.lessonDate}
                      onChange={handleInputChange}
                      readOnly
                      className="bg-gray"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="lessonTime">Time</label>
                    <input
                      type="time"
                      id="lessonTime"
                      value={formData.lessonTime}
                      onChange={handleInputChange}
                      readOnly
                      className="bg-gray"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="studentId">Name of Student *</label>
                  <select
                    id="studentId"
                    value={formData.studentId}
                    onChange={handleStudentChange}
                    required
                  >
                    <option value="">Select a student...</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email Address</label>
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    readOnly
                    className="bg-gray"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="reason">Reason for payment *</label>
                  <input
                    type="text"
                    id="reason"
                    value={formData.reason}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="lessonSubjectId">Lesson Subject</label>
                  {lessonSubjects.length > 0 ? (
                    <select
                      id="lessonSubjectId"
                      value={formData.lessonSubjectId}
                      onChange={handleSubjectChange}
                    >
                      <option value="">Use fallback hourly rate</option>
                      {lessonSubjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name} - £{Number(subject.price).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value="General Tuition" readOnly className="bg-gray" />
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="lessonDate">Lesson Date</label>
                    <input
                      type="date"
                      id="lessonDate"
                      value={formData.lessonDate}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="lessonTime">Time</label>
                    <input
                      type="time"
                      id="lessonTime"
                      value={formData.lessonTime}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <div className="form-group">
              <label htmlFor="amount">Total Amount to Charge (GBP)</label>
              <input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                required={collectPaymentNow || checkoutMode === 'existing_booking'}
              />
            </div>
            <div className="form-group">
              <small style={{ color: '#cbd5e1' }}>
                Subject prices fill this automatically. Edit this field for custom tutor charges.
              </small>
            </div>
          </div>

          <div className="form-section lilac-card">
            <h3>Payment Details</h3>

            <div className="form-group">
              <label>Payment Method</label>
              <div className="radio-group" style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="card"
                    checked={paymentMethod === 'card'}
                    onChange={() => setPaymentMethod('card')}
                  />
                  Card
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="cash"
                    checked={paymentMethod === 'cash'}
                    onChange={() => setPaymentMethod('cash')}
                  />
                  Cash
                </label>
              </div>
            </div>

            {collectPaymentNow || checkoutMode === 'existing_booking' ? (
              paymentMethod === 'cash' ? (
                <p style={{ margin: 0, color: '#374151' }}>
                  This payment will be recorded as cash and linked to the lesson.
                </p>
              ) : (
                <>
                  <div className="form-group">
                    <label htmlFor="cardholderName">Name of Cardholder *</label>
                    <input
                      type="text"
                      id="cardholderName"
                      value={formData.cardholderName}
                      onChange={handleInputChange}
                      placeholder="e.g. John Doe"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="cardNumber">Card Number</label>
                    <input
                      type="text"
                      id="cardNumber"
                      value={formData.cardNumber}
                      onChange={handleInputChange}
                      placeholder="0000 0000 0000 0000"
                      maxLength="19"
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="expiryDate">Expiry Date</label>
                      <input
                        type="text"
                        id="expiryDate"
                        value={formData.expiryDate}
                        onChange={handleInputChange}
                        placeholder="MM/YY"
                        maxLength="5"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="cvv">CVV</label>
                      <input
                        type="text"
                        id="cvv"
                        value={formData.cvv}
                        onChange={handleInputChange}
                        placeholder="123"
                        maxLength="4"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="postCode">Post Code</label>
                    <input
                      type="text"
                      id="postCode"
                      value={formData.postCode}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </>
              )
            ) : (
              <p style={{ margin: 0, color: '#374151' }}>
                Payment details are skipped. The booking will be confirmed and saved as unpaid.
              </p>
            )}
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary btn-large btn-block">
          {loading
            ? (checkoutMode === 'existing_booking'
              ? 'Recording Payment...'
              : (collectPaymentNow ? 'Processing Payment...' : 'Creating Booking...'))
            : (checkoutMode === 'existing_booking'
              ? `Record Payment (£${Number(amount).toFixed(2)})`
              : (collectPaymentNow
                ? paymentMethod === 'cash'
                  ? `Record Cash Payment (£${Number(amount).toFixed(2)})`
                  : `Charge £${Number(amount).toFixed(2)}`
                : 'Create Booking (Unpaid)'))}
        </button>
      </form>

      <style jsx>{`
        .pos-form {
          max-width: 800px;
          margin: 0 auto;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          margin-bottom: 2rem;
        }
        .lilac-card {
          background: linear-gradient(145deg, rgba(255,255,255,0.17), rgba(255,255,255,0.08)) !important;
          color: #e5e5e5 !important;
          border: 1px solid rgba(255,255,255,0.25);
          padding: 1.5rem;
          border-radius: 16px;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.22);
          transition: all 0.2s ease;
        }
        .lilac-card:hover {
          border-color: rgba(99, 102, 241, 0.5);
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(99, 102, 241, 0.45);
        }
        .lilac-card h3 {
          margin-top: 0;
          margin-bottom: 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.15);
          padding-bottom: 0.5rem;
          color: #fff;
        }
        .lilac-card label {
          color: #e5e5e5;
          font-weight: 500;
          margin-bottom: 4px;
          display: block;
        }
        .lilac-card input,
        .lilac-card select {
          background-color: rgba(30, 41, 59, 0.8);
          color: #e5e5e5;
          border: 1px solid rgba(255,255,255,0.2);
          padding: 8px;
          border-radius: 8px;
          width: 100%;
          backdrop-filter: blur(10px);
          transition: all 0.2s ease;
        }
        .lilac-card input:focus,
        .lilac-card select:focus {
          background-color: rgba(30, 41, 59, 0.9);
          border-color: rgba(99, 102, 241, 0.5);
          outline: none;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .form-row {
          display: flex;
          gap: 1rem;
        }
        .form-row .form-group {
          flex: 1;
        }
        .form-group {
          margin-bottom: 1rem;
        }
        .price-display {
          font-size: 1.5rem;
          font-weight: bold;
          color: #93c5fd;
          background: rgba(59, 130, 246, 0.1);
          padding: 1rem;
          border-radius: 8px;
          border: 1px solid rgba(59, 130, 246, 0.2);
        }
        .bg-gray {
          background-color: rgba(107, 114, 128, 0.1) !important;
          color: #9ca3af !important;
        }
        .btn-block {
          width: 100%;
          padding: 1rem;
          font-size: 1.1rem;
        }
        @media (max-width: 768px) {
          .form-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
