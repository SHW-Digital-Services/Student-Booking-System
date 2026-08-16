import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/auth'
import { getStudentBookings, subscribeToStudentBookings } from '../../lib/bookingAPI'
import { getAllTutors } from '../../lib/profileAPI'
import Profile from './Profile'
import Lessons from './Lessons'
import Payments from './Payments'

export default function StudentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('bookings')
  const [bookings, setBookings] = useState([])
  const [tutors, setTutors] = useState([])
  const [showTutorSelection, setShowTutorSelection] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tutorLoadingError, setTutorLoadingError] = useState(null)

  const loadBookings = useCallback(async () => {
    try {
      const { data, error } = await getStudentBookings(user.id)
      if (error) throw error
      setBookings(data || [])
    } catch (err) {
      console.error("Failed to load bookings", err)
    } finally {
      setLoading(false)
    }
  }, [user.id])

  const loadTutors = useCallback(async () => {
    try {
      const { data, error } = await getAllTutors()
      if (error) {
        console.error("Failed to load tutors", error)
        setTutorLoadingError(error.message || "Failed to load tutors")
        // If it's a permissions error, set a more helpful message
        if (error.message?.includes('policy') || error.code === 'PGRST301' || error.message?.includes('permission')) {
          setTutorLoadingError("Database permission error: Please ensure RLS policies allow students to view tutor profiles.")
        }
      } else {
        setTutors(data || [])
        setTutorLoadingError(null)
      }
    } catch (err) {
      console.error("Failed to load tutors", err)
      setTutorLoadingError(err.message || "Failed to load tutors")
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadBookings()
      loadTutors()
    }
  }, [user, loadBookings, loadTutors])

  useEffect(() => {
    if (!user?.id) return

    return subscribeToStudentBookings(user.id, () => {
      loadBookings()
    })
  }, [user?.id, loadBookings])

  const handleBookLesson = () => {
    if (tutorLoadingError) {
      alert(`Error loading tutors: ${tutorLoadingError}\n\nPlease check the browser console for details. If this is a permissions error, you may need to add an RLS policy to allow students to view tutor profiles.`)
      return
    }
    
    if (tutors.length === 0) {
      alert('No tutors available. Please contact support.')
      return
    }
    
    // If only one tutor, go directly to booking
    if (tutors.length === 1) {
      navigate(`/book/${tutors[0].id}`)
      return
    }
    
    // Show tutor selection
    setShowTutorSelection(true)
  }

  const handleCancel = async (bookingId) => {
    if (!confirm('Cancel this booking?')) return
    try {
      const { cancelBooking } = await import('../../lib/bookingAPI')
      const { error } = await cancelBooking(bookingId)
      if (error) throw error
      // reload
      loadBookings()
    } catch (err) {
      console.error('Failed to cancel booking', err)
      alert('Failed to cancel booking')
    }
  }

  const formatBookingDate = (booking) => {
    if (booking.status === 'tba') return 'To be arranged'
    return new Date(booking.lesson_date).toLocaleDateString()
  }

  const formatBookingTime = (booking) => {
    if (booking.status === 'tba') return 'To be arranged'
    return (booking.lesson_time || '').slice(0, 5)
  }

  const formatStatusLabel = (status) => {
    if (status === 'tba') return 'To be arranged'
    return status
  }

  const handleTutorSelect = (tutorId) => {
    navigate(`/book/${tutorId}`)
    setShowTutorSelection(false)
  }

  const formatTutorSubjects = (tutor) => {
    if (tutor.lesson_subjects?.length > 0) {
      return tutor.lesson_subjects
        .map((subject) => `${subject.name} (£${Number(subject.price).toFixed(2)})`)
        .join(', ')
    }

    return tutor.subjects || 'General Tuition'
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Student Dashboard</h1>
      </div>

      <div className="dashboard-tabs">
        <button
          className={activeTab === 'bookings' ? 'active' : ''}
          onClick={() => setActiveTab('bookings')}
        >
          Bookings
        </button>
        <button
          className={activeTab === 'lessons' ? 'active' : ''}
          onClick={() => setActiveTab('lessons')}
        >
          Lessons
        </button>
        <button
          className={activeTab === 'profile' ? 'active' : ''}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
        <button
          className={activeTab === 'payments' ? 'active' : ''}
          onClick={() => setActiveTab('payments')}
        >
          Finance
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'bookings' && (
          <div className="bookings-section">
            <div className="section-header">
              <h2>My Bookings</h2>
              <button onClick={handleBookLesson} className="btn-primary">Book New Lesson</button>
            </div>

            {showTutorSelection && (
              <div className="tutor-selection-modal" style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}>
                <div className="modal-content" style={{
                  backgroundColor: 'white',
                  padding: '2rem',
                  borderRadius: '8px',
                  maxWidth: '500px',
                  width: '90%'
                }}>
                  <h3>Select a Tutor</h3>
                  <p>Please choose a tutor for your lesson:</p>
                  <div className="tutor-list" style={{ marginTop: '1rem' }}>
                    {tutors.map((tutor) => (
                      <button
                        key={tutor.id}
                        onClick={() => handleTutorSelect(tutor.id)}
                        className="tutor-option btn-secondary"
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '0.75rem',
                          marginBottom: '0.5rem',
                          textAlign: 'left'
                        }}
                      >
                        <strong>{tutor.full_name}</strong>
                        <br />
                        <small>{tutor.email}</small>
                        <br />
                        <small>{formatTutorSubjects(tutor)}</small>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowTutorSelection(false)}
                    className="btn-secondary"
                    style={{ marginTop: '1rem', width: '100%' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <p>Loading schedule...</p>
            ) : bookings.length === 0 ? (
              <div className="empty-state">
                <p>No lessons booked yet.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="bookings-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Subject</th>
                      <th>Tutor</th>
                      <th>Status</th>
                      <th>Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => (
                      <tr key={booking.id}>
                        <td>{formatBookingDate(booking)}</td>
                        <td>{formatBookingTime(booking)}</td>
                        <td>
                          {booking.lesson_subject_name || 'General Tuition'}
                          {booking.lesson_price && (
                            <span> (£{Number(booking.lesson_price).toFixed(2)})</span>
                          )}
                        </td>
                        <td>{booking.tutor?.full_name || 'Unknown Tutor'}</td>
                        <td>
                          <span className={`status-badge ${booking.status}`}>
                            {formatStatusLabel(booking.status)}
                          </span>
                        </td>
                        <td>
                          {booking.payment_status === 'paid' ? (
                            <span className="text-success">Paid</span>
                          ) : (
                            <Link to={`/payment/${booking.id}`} className="pay-link">
                              Pay with Stripe
                            </Link>
                          )}
                        </td>
                        <td>
                          {booking.status !== 'cancelled' && (
                            <button onClick={() => handleCancel(booking.id)} className="btn-secondary">
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'lessons' && <Lessons />}
        {activeTab === 'profile' && <Profile />}
        {activeTab === 'payments' && <Payments />}
      </div>
    </div>
  )
}
