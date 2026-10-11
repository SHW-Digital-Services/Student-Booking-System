import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/auth'
import { useLocation, useNavigate } from 'react-router-dom'
import { 
  User, 
  CalendarPlus, 
  BookOpen, 
  CreditCard, 
  Upload, 
  LogOut,
  Menu,
  X,
  Home,
  CircleHelp
} from 'lucide-react'

// Import Sub-components
import StudentProfile from './Profile'
import StudentPayments from './Payments'
import StudentLessons from './Lessons'
import HomeworkSubmission from './HomeworkSubmission'
import TutorSelection from './TutorSelection' // Assuming this is your "Book a Lesson" flow

import './StudentDashboard.css'
import BrandLogo from '../shared/BrandLogo'
import HelpCenter from '../shared/HelpCenter'
import AnnouncementBanner from '../shared/AnnouncementBanner'

export default function StudentDashboard({ previewStudentId = null, previewStudentProfile = null, previewMode = false }) {
  const { user, profile, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('lessons') // Default to 'lessons' or 'home'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [paymentSyncMessage, setPaymentSyncMessage] = useState('')
  const [paymentSyncError, setPaymentSyncError] = useState('')

  const studentIdToUse = previewStudentId || user?.id
  const studentProfileDisplay = previewMode ? (previewStudentProfile || profile) : profile

  const menuItems = [
    { id: 'lessons', label: 'My Lessons', icon: BookOpen },
    { id: 'book', label: 'Book a Lesson', icon: CalendarPlus },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'homework', label: 'Homework', icon: Upload },
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'help', label: 'Help & Contact', icon: CircleHelp },
  ]

  const handleSignOut = async () => {
    await signOut()
  }

  useEffect(() => {
    if (previewMode || !user?.id) return

    const searchParams = new URLSearchParams(location.search)
    const paymentFlag = searchParams.get('payment')
    const bookingId = searchParams.get('booking_id')
    if (paymentFlag !== 'success' || !bookingId) return

    setPaymentSyncError('')
    setPaymentSyncMessage('PayPal payment confirmed. Your booking is confirmed.')
    const nextParams = new URLSearchParams(location.search)
    nextParams.delete('payment')
    nextParams.delete('booking_id')
    navigate({ pathname: location.pathname, search: nextParams.toString() ? `?${nextParams.toString()}` : '' }, { replace: true })
  }, [location.pathname, location.search, navigate, previewMode, user?.id])

  return (
    <div className="dashboard-layout">
      {/* Mobile Menu Toggle */}
      <button 
        className="mobile-menu-toggle"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        {mobileMenuOpen ? <X /> : <Menu />}
      </button>

      {/* Sidebar Navigation */}
      <aside className={`dashboard-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-placeholder">
            <BrandLogo size={36} wordmarkSize={18} />
          </div>
          <div className="user-profile-summary">
            <div className="avatar-circle">
              {studentProfileDisplay?.full_name?.charAt(0) || user?.email?.charAt(0) || 'S'}
            </div>
            <div className="user-info">
              <p className="user-name">{studentProfileDisplay?.full_name || 'Student'}</p>
              <p className="user-role">{previewMode ? 'Student Preview Mode' : 'Student Account'}</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(item.id)
                  setMobileMenuOpen(false)
                }}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleSignOut} className="nav-item logout">
            <LogOut size={20} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-main">
        <AnnouncementBanner />
        <header className="content-header">
          <h1>{menuItems.find(i => i.id === activeTab)?.label}</h1>
          <p className="current-date">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {paymentSyncMessage && (
            <p style={{ marginTop: '0.5rem', color: '#16a34a' }}>{paymentSyncMessage}</p>
          )}
          {paymentSyncError && (
            <p style={{ marginTop: '0.5rem', color: '#dc2626' }}>{paymentSyncError}</p>
          )}
        </header>

        <div className="content-body">
          <section className="page-section glass-card">
            {activeTab === 'profile' && <StudentProfile previewMode={previewMode} previewProfile={studentProfileDisplay} />}
            {activeTab === 'book' && <TutorSelection previewMode={previewMode} />}
            {activeTab === 'lessons' && <StudentLessons studentId={studentIdToUse} />}
            {activeTab === 'payments' && <StudentPayments studentId={studentIdToUse} />}
            {activeTab === 'homework' && <HomeworkSubmission studentId={studentIdToUse} previewMode={previewMode} />}
            {activeTab === 'help' && <HelpCenter role="student" user={user} profile={studentProfileDisplay} />}
          </section>
        </div>
      </main>
    </div>
  )
}
