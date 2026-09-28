import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/auth'
import { useEffect } from 'react'
import BrandLogo from './shared/BrandLogo'

export default function Home() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  useEffect(() => {
    // Auto-redirect if logged in
    if (user && profile) {
      navigate(profile.role === 'tutor' ? '/tutor' : '/student')
    }
  }, [user, profile, navigate])

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      color: '#ffffff',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header/Navigation */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1.5rem 3rem',
        borderBottom: '2px solid #3a3a3a'
      }}>
        <BrandLogo size={48} wordmarkSize={28} />
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'transparent',
              color: '#e5e5e5',
              border: '2px solid #3a3a3a',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#b4ff39'
              e.target.style.color = '#ffffff'
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#3a3a3a'
              e.target.style.color = '#e5e5e5'
            }}
          >
            Login
          </button>
          <button
            onClick={() => navigate('/register')}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #8618d6 0%, #a020f0 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.filter = 'brightness(1.05)'}
            onMouseLeave={(e) => e.target.style.filter = 'none'}
          >
            Sign Up
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '4rem 2rem',
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: '4rem',
          fontWeight: 'bold',
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, #ffffff 0%, #a78bfa 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Book Your Perfect Tutor
        </h1>
        <p style={{
          fontSize: '1.5rem',
          color: '#a0a0a0',
          maxWidth: '700px',
          marginBottom: '3rem',
          lineHeight: '1.8'
        }}>
          Connect with expert tutors, schedule lessons at your convenience, and pay securely online.
        </p>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => navigate('/register')}
            style={{
              padding: '1.25rem 3rem',
              background: 'linear-gradient(135deg, #8618d6 0%, #a020f0 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1.25rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 20px rgba(180, 255, 57, 0.35)'
            }}
            onMouseEnter={(e) => {
              e.target.style.filter = 'brightness(1.06)'
              e.target.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.target.style.filter = 'none'
              e.target.style.transform = 'translateY(0)'
            }}
          >
            Get Started as Student
          </button>
          
          <button
            onClick={() => {
              window.location.href = "mailto:scott@scott-hw.online?subject=I%20would%20like%20to%20become%20a%20tutor%20with%20Edumaxim&body=Hi%20Edumaxim%20Team%2C%0D%0A%0D%0AI%20would%20like%20to%20enquire%20about%20becoming%20a%20tutor%20with%20Edumaxim.%0D%0A%0D%0AHere%20are%20my%20details%3A%0D%0A%0D%0AFull%20Name%3A%0D%0A%0D%0AEmail%20Address%3A%0D%0A%0D%0ACountry%20of%20residence%3A%0D%0A%0D%0ASubject%20I%20teach%3A%0D%0A%0D%0AOther%20Details%20I%20would%20like%20to%20include%20are%3A"
            }}
            style={{
              padding: '1.25rem 3rem',
              backgroundColor: '#1a1a1a', 
              color: '#e5e5e5',
              border: '2px solid #3a3a3a',
              borderRadius: '12px',
              fontSize: '1.25rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#b4ff39'
              e.target.style.color = '#ffffff'
              e.target.style.backgroundColor = '#2a2a2a'
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#3a3a3a'
              e.target.style.color = '#e5e5e5'
              e.target.style.backgroundColor = '#1a1a1a'
            }}
          >
            Become a Tutor
          </button>
        </div>

        {/* Features */}
        <div style={{
          marginTop: '6rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '2rem',
          maxWidth: '1200px',
          width: '100%'
        }}>
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '2px solid #3a3a3a',
            borderRadius: '12px',
            padding: '2rem',
            textAlign: 'left',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#b4ff39'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3a3a3a'}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎓</div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Customised Learning Journey</h3>
            <p style={{ color: '#a0a0a0' }}>Personalised lessons tailored to your pace, style, and learning goals</p>
          </div>

          <div style={{
            backgroundColor: '#1a1a1a',
            border: '2px solid #3a3a3a',
            borderRadius: '12px',
            padding: '2rem',
            textAlign: 'left',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#b4ff39'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3a3a3a'}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📅</div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Easy Scheduling</h3>
            <p style={{ color: '#a0a0a0' }}>Book lessons at times that work for you</p>
          </div>

          <div style={{
            backgroundColor: '#1a1a1a',
            border: '2px solid #3a3a3a',
            borderRadius: '12px',
            padding: '2rem',
            textAlign: 'left',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#b4ff39'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3a3a3a'}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💳</div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Secure Payments</h3>
            <p style={{ color: '#a0a0a0' }}>Pay safely with Stripe-powered checkout</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '3rem 3rem 2rem 3rem',
        borderTop: '2px solid #3a3a3a',
        textAlign: 'center',
        color: '#a0a0a0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem'
      }}>
        {/* Contact Button */}
        <button
          onClick={() => {
            window.location.href = "mailto:scott@scott-hw.online?subject=Enquiry%20from%20Edumaxim%20Website&body=Hi%20Edumaxim%20Team%2C%0D%0A%0D%0AI%20would%20like%20to%20enquire%20about..."
          }}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#2a2a2a',
            color: '#e5e5e5',
            border: '1px solid #3a3a3a',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#b4ff39'
            e.currentTarget.style.color = '#ffffff'
            e.currentTarget.style.backgroundColor = '#3a3a3a'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#3a3a3a'
            e.currentTarget.style.color = '#e5e5e5'
            e.currentTarget.style.backgroundColor = '#2a2a2a'
          }}
        >
          ✉️ Contact Support
        </button>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem' }}>
          <a href="/policies" style={{ color: '#a0a0a0', textDecoration: 'none', fontSize: '0.9rem' }}>Privacy Policy</a>
          <a href="/policies" style={{ color: '#a0a0a0', textDecoration: 'none', fontSize: '0.9rem' }}>Terms of Service</a>
          <a href="/policies" style={{ color: '#a0a0a0', textDecoration: 'none', fontSize: '0.9rem' }}>FAQ</a>
        </div>

        <p style={{ marginTop: '0.5rem' }}>© 2026 Edumaxim. All rights reserved.</p>
      </footer>
    </div>
  )
}
