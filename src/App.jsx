import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './contexts/auth'
import { Analytics } from '@vercel/analytics/react'
import Home from './components/Home'
import Login from './components/auth/Login'
import Register from './components/auth/Register'
import ResetPassword from './components/auth/ResetPassword'
import StudentDashboard from './components/student/StudentDashboard'
import TutorDashboard from './components/tutor/TutorDashboard'
import TutorSelection from './components/student/TutorSelection'
import BookingForm from './components/student/BookingForm'
import Policies from './pages/Policies' //
import VideoRoom from './components/VideoRoom/VideoRoom'
import VideoRoomPage from './pages/VideoRoomPage'
import PaymentPage from './pages/PaymentPage'
import MaintenancePage from './pages/Maintenance'
import { getSystemSetting } from './lib/settingsAPI'

function ProtectedRoute({ children, allowedRole, maintenanceMode }) {
  const { user, profile, loading } = useAuth()
  const resolvedRole = profile?.role ?? user?.user_metadata?.role ?? user?.app_metadata?.role ?? null

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#000000',
        color: '#ffffff'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid #2a2a2a',
          borderTop: '4px solid #45d5e8',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ marginTop: '1rem' }}>Loading...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  if (maintenanceMode && resolvedRole === 'student') {
    return <Navigate to="/maintenance" replace />
  }

  if (allowedRole && resolvedRole !== allowedRole) {
    if (resolvedRole === 'tutor') {
      return <Navigate to="/tutor" replace />
    }

    if (resolvedRole === 'student') {
      return <Navigate to="/student" replace />
    }

    return <Navigate to="/" replace />
  }

  if (resolvedRole === 'student' && user?.app_metadata?.force_password_reset) {
    return <Navigate to="/reset-password" replace />
  }

  return children
}

function AppRoutes() {
  const { loading, user, profile } = useAuth()
  const location = useLocation()
  const resolvedRole = profile?.role ?? user?.user_metadata?.role ?? user?.app_metadata?.role ?? null
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [maintenanceLoading, setMaintenanceLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadMaintenance = async () => {
      if (resolvedRole !== 'student') {
        if (mounted) {
          setMaintenanceMode(false)
          setMaintenanceLoading(false)
        }
        return
      }

      setMaintenanceLoading(true)
      try {
        const { data } = await getSystemSetting('maintenance_mode')
        if (mounted) {
          setMaintenanceMode(data?.value === 'true')
        }
      } catch {
        if (mounted) {
          setMaintenanceMode(false)
        }
      } finally {
        if (mounted) {
          setMaintenanceLoading(false)
        }
      }
    }

    if (!loading) {
      loadMaintenance()
    }

    return () => {
      mounted = false
    }
  }, [loading, resolvedRole])

  if (loading || maintenanceLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#000000',
        color: '#ffffff'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid #2a2a2a',
          borderTop: '4px solid #45d5e8',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ marginTop: '1rem' }}>Loading...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  if (maintenanceMode && resolvedRole === 'student' && location.pathname !== '/maintenance') {
    return <Navigate to="/maintenance" replace />
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/policies" element={<Policies />} />
      <Route path="/maintenance" element={<MaintenancePage />} />
      
      <Route path="/student" element={<ProtectedRoute allowedRole="student" maintenanceMode={maintenanceMode}><StudentDashboard /></ProtectedRoute>} />
      <Route path="/student/tutors" element={<ProtectedRoute allowedRole="student" maintenanceMode={maintenanceMode}><TutorSelection /></ProtectedRoute>} />
      <Route path="/student/book/:tutorId" element={<ProtectedRoute allowedRole="student" maintenanceMode={maintenanceMode}><BookingForm /></ProtectedRoute>} />
      <Route path="/payment/:bookingId" element={<ProtectedRoute maintenanceMode={maintenanceMode}><PaymentPage /></ProtectedRoute>} />
      <Route path="/video/:roomToken" element={<ProtectedRoute maintenanceMode={maintenanceMode}><VideoRoomPage /></ProtectedRoute>} />
      
      <Route path="/tutor" element={<ProtectedRoute allowedRole="tutor" maintenanceMode={maintenanceMode}><TutorDashboard /></ProtectedRoute>} />

      <Route path="/video-room/:meetingId" element={<VideoRoom />} />
      <Route path="*" element={<Navigate to="/" />} />   
       </Routes>
 
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
        <Analytics />
      </AuthProvider>
    </Router>
  )
}

export default App
