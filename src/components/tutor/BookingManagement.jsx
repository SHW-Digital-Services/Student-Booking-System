import { useState, useEffect, useCallback } from 'react'
import { cancelBooking, ensureBookingVideoRoom, getTutorBookings, markBookingPaidByCash, subscribeToTutorBookings, updateBookingStatus } from '../../lib/bookingAPI'
import { buildVideoRoomUrl } from '../../lib/videoRoomAPI'
import { recordBookingPayment } from '../../lib/paymentsAPI'

function parseLessonDate(lessonDate) {
  if (!lessonDate) return null
  const [year, month, day] = String(lessonDate).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function isArchivedBooking(booking, today) {
  if (booking?.status === 'archived') return true
  const lessonDate = parseLessonDate(booking?.lesson_date)
  if (!lessonDate) return false
  return lessonDate < today
}

function getBookingPaymentAmount(booking) {
  const savedPrice = Number(booking?.lesson_price || 0)
  if (savedPrice > 0) return savedPrice

  return booking?.duration_minutes ? Number(booking.duration_minutes) / 60 : 1
}

export default function BookingManagement({ tutorId }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [hoveredBookingId, setHoveredBookingId] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  const loadBookings = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await getTutorBookings(tutorId)
      if (error) throw error
      setBookings(data || [])
    } catch (err) {
      setError(err.message || 'Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }, [tutorId])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  useEffect(() => {
    if (!tutorId) return

    return subscribeToTutorBookings(tutorId, () => {
      loadBookings()
    })
  }, [tutorId, loadBookings])

  const handleStatusChange = useCallback(
    async (bookingId, newStatus) => {
      try {
        const { error } = await updateBookingStatus(bookingId, newStatus)
        if (error) throw error
        await loadBookings()
        setSelectedBooking(null)
      } catch (err) {
        setError(err.message || 'Failed to update booking')
      }
    },
    [loadBookings]
  )

  const formatBookingDate = (booking) => {
    if (booking.status === 'tba') return 'To be arranged'
    return new Date(booking.lesson_date).toLocaleDateString()
  }

  const formatBookingTime = (booking) => {
    if (booking.status === 'tba') return 'To be arranged'
    return booking.lesson_time
  }

  const formatStatusLabel = (status) => {
    if (status === 'tba') return 'To be arranged'
    return status
  }
  const copyRoomLink = useCallback(async (videoRoomToken) => {
    const url = buildVideoRoomUrl(videoRoomToken)
    if (!url) return

    try {
      await navigator.clipboard.writeText(url)
      window.alert('Video room link copied.')
    } catch (err) {
      console.error('Failed to copy video room link', err)
      window.prompt('Copy this video room link:', url)
    }
  }, [])

  const handleGenerateRoom = useCallback(async (bookingId) => {
    try {
      const { data, error } = await ensureBookingVideoRoom(bookingId)
      if (error) throw error
      await loadBookings()
      if (data) {
        setSelectedBooking((prev) => (prev?.id === bookingId ? { ...prev, ...data } : prev))
      }
      window.alert('Video room generated.')
    } catch (err) {
      setError(err.message || 'Failed to generate video room')
    }
  }, [loadBookings])

  const handleCancelBooking = useCallback(async (bookingId) => {
    if (!window.confirm('Cancel this booking?')) return
    try {
      const { error } = await cancelBooking(bookingId)
      if (error) throw error
      await loadBookings()
      setSelectedBooking(null)
    } catch (err) {
      setError(err.message || 'Failed to cancel booking')
    }
  }, [loadBookings])

  const handleMarkPaidByCash = useCallback(async (booking) => {
    if (!booking || !booking.student_id) return
    if (!window.confirm('Mark this lesson as paid by cash?')) return

    try {
      const defaultAmount = getBookingPaymentAmount(booking)
      const rawAmount = window.prompt(
        'Enter the cash amount received for this lesson (GBP):',
        defaultAmount.toFixed(2)
      )
      const amount = rawAmount ? parseFloat(rawAmount.replace(/[^0-9.]/g, '')) : NaN
      if (Number.isNaN(amount) || amount <= 0) {
        throw new Error('A valid cash amount is required to record payment.')
      }

      const { error } = await markBookingPaidByCash(booking.id, booking.student_id, amount)
      if (error) throw error
      await loadBookings()
      setSelectedBooking(null)
    } catch (err) {
      setError(err.message || 'Failed to mark booking paid by cash')
    }
  }, [loadBookings])

  const handleAssignPayment = useCallback(async (booking) => {
    if (!booking || !booking.student_id) return
    if (!window.confirm('Assign a payment to this lesson?')) return

    try {
      const rawAmount = window.prompt(
        'Enter the payment amount in GBP:',
        getBookingPaymentAmount(booking).toFixed(2)
      )
      const amount = rawAmount ? parseFloat(rawAmount.replace(/[^0-9.]/g, '')) : NaN
      if (Number.isNaN(amount) || amount <= 0) {
        throw new Error('A valid payment amount is required.')
      }

      const paymentMethod = window.prompt(
        'Enter the payment method (cash, card, bank_transfer, etc.):',
        'manual'
      ) || 'manual'

      const transactionReference = window.prompt(
        'Optional transaction reference or receipt number:',
        ''
      ) || undefined

      const { error } = await recordBookingPayment({
        bookingId: booking.id,
        studentId: booking.student_id,
        tutorId,
        amount,
        paymentMethod,
        transactionReference,
        status: 'completed'
      })

      if (error) throw error
      await loadBookings()
      setSelectedBooking((prev) => (prev?.id === booking.id ? { ...prev, payment_status: 'paid' } : prev))
      window.alert('Payment assigned to booking.')
    } catch (err) {
      setError(err.message || 'Failed to assign payment')
    }
  }, [loadBookings, tutorId])

  if (loading) return <div>Loading bookings...</div>

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const activeBookings = bookings.filter((booking) => !isArchivedBooking(booking, today))
  const archivedBookings = bookings.filter((booking) => isArchivedBooking(booking, today))

  const renderBookings = (items) => (
    <div
      className="bookings-list"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1rem'
      }}
    >
      {items.map((booking) => (
        <div
          key={booking.id}
          className={`booking-card booking-card-glass ${booking.status}`}
          onClick={() => setSelectedBooking(booking)}
          onMouseEnter={() => setHoveredBookingId(booking.id)}
          onMouseLeave={() => setHoveredBookingId(null)}
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.17), rgba(255,255,255,0.08))',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: '16px',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            boxShadow: hoveredBookingId === booking.id
              ? '0 14px 30px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(99, 102, 241, 0.45)'
              : '0 8px 20px rgba(15, 23, 42, 0.22)',
            transform: hoveredBookingId === booking.id ? 'translateY(-5px)' : 'translateY(0)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            padding: '1rem',
            cursor: 'pointer'
          }}
        >
          <div className="booking-header">
            <h3>{booking.student?.full_name || 'Unknown Student'}</h3>
            <span className={`status-badge ${booking.status}`}>
              {formatStatusLabel(booking.status)}
            </span>
          </div>
          <p>
            <strong>Date:</strong> {formatBookingDate(booking)}
          </p>
          <p>
            <strong>Time:</strong> {formatBookingTime(booking)}
          </p>
          <p>
            <strong>Duration:</strong> {booking.duration_minutes} minutes
          </p>
          {booking.lesson_subject_name && (
            <p>
              <strong>Subject:</strong> {booking.lesson_subject_name}
            </p>
          )}
          {booking.lesson_price && (
            <p>
              <strong>Price:</strong> £{Number(booking.lesson_price).toFixed(2)}
            </p>
          )}
          <p>
            <strong>Payment:</strong> {booking.payment_status}
          </p>
          {booking.video_room_token && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <a
                href={buildVideoRoomUrl(booking.video_room_token)}
                className="btn-secondary"
                onClick={(e) => e.stopPropagation()}
              >
                Join Room
              </a>
              <button
                type="button"
                className="btn-secondary"
                onClick={(e) => {
                  e.stopPropagation()
                  copyRoomLink(booking.video_room_token)
                }}
              >
                Copy Link
              </button>
            </div>
          )}
          {booking.video_room_passcode && (
            <p>
              <strong>Passcode:</strong> {booking.video_room_passcode}
            </p>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className="booking-management">
      <h2>Booking Requests</h2>

      {error && <div className="error-message">{error}</div>}

      {bookings.length === 0 ? (
        <div className="empty-state">
          <p>No bookings yet.</p>
        </div>
      ) : (
        <>
          {activeBookings.length > 0 ? (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>Bookings</h3>
              {renderBookings(activeBookings)}
            </div>
          ) : (
            <div className="empty-state" style={{ marginBottom: '1.5rem' }}>
              <p>No current or upcoming bookings.</p>
            </div>
          )}
          {archivedBookings.length > 0 && (
            <div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowArchived((prev) => !prev)}
                style={{ marginBottom: '0.75rem' }}
              >
                {showArchived ? `Hide Archived (${archivedBookings.length})` : `Show Archived (${archivedBookings.length})`}
              </button>
              {showArchived && (
                <div>
                  <h3 style={{ marginBottom: '0.75rem' }}>Archived Bookings</h3>
                  {renderBookings(archivedBookings)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {selectedBooking && (
        <div className="booking-detail-modal">
          <div className="modal-content">
            <h3>Booking Details</h3>
            <p>
              <strong>Student:</strong> {selectedBooking.student?.full_name}
            </p>
            <p>
              <strong>Email:</strong> {selectedBooking.student?.email}
            </p>
            <p>
              <strong>Date:</strong> {formatBookingDate(selectedBooking)}
            </p>
            <p>
              <strong>Time:</strong> {formatBookingTime(selectedBooking)}
            </p>
            <p>
              <strong>Status:</strong> {formatStatusLabel(selectedBooking.status)}
            </p>
            {selectedBooking.lesson_subject_name && (
              <p>
                <strong>Subject:</strong> {selectedBooking.lesson_subject_name}
              </p>
            )}
            {selectedBooking.lesson_price && (
              <p>
                <strong>Price:</strong> £{Number(selectedBooking.lesson_price).toFixed(2)}
              </p>
            )}
            {selectedBooking.video_room_token && (
              <p>
                <strong>Room Link:</strong>{' '}
                <a href={buildVideoRoomUrl(selectedBooking.video_room_token)}>
                  {buildVideoRoomUrl(selectedBooking.video_room_token)}
                </a>
              </p>
            )}
            {selectedBooking.video_room_passcode && (
              <p>
                <strong>Passcode:</strong> {selectedBooking.video_room_passcode}
              </p>
            )}
            <p>
              <strong>Lobby Enabled:</strong> {selectedBooking.video_room_lobby_enabled ? 'Yes' : 'No'}
            </p>

            <div className="modal-actions">
              {selectedBooking.status === 'pending' && (
                <>
                  <button
                    onClick={() =>
                      handleStatusChange(selectedBooking.id, 'confirmed')
                    }
                    className="btn-success"
                  >
                    Confirm
                  </button>
                </>
              )}
              {selectedBooking.payment_status !== 'paid' && selectedBooking.status !== 'cancelled' && (
                <button
                  onClick={() => handleMarkPaidByCash(selectedBooking)}
                  className="btn-warning"
                >
                  Mark Paid by Cash
                </button>
              )}
              <button
                onClick={() => handleAssignPayment(selectedBooking)}
                className="btn-secondary"
              >
                Assign Payment
              </button>
              {selectedBooking.status !== 'cancelled' && (
                <button
                  onClick={() => handleCancelBooking(selectedBooking.id)}
                  className="btn-danger"
                >
                  Cancel Booking
                </button>
              )}
              <button
                onClick={() => {
                  window.open(buildVideoRoomUrl(selectedBooking.video_room_token), '_blank')
                }}
                className="btn-secondary"
                disabled={!selectedBooking.video_room_token}
              >
                Join Video Room
              </button>
              {!selectedBooking.video_room_token && (
                <button
                  onClick={() => handleGenerateRoom(selectedBooking.id)}
                  className="btn-secondary"
                >
                  Generate Video Room
                </button>
              )}
              <button
                onClick={() => setSelectedBooking(null)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
