import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, HelpCircle, FileText, Lock } from 'lucide-react'
import BrandLogo from '../components/shared/BrandLogo'

export default function Policies() {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('faq')

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Navigation Header */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1.5rem 2rem',
        borderBottom: '1px solid #334155',
        backgroundColor: '#1e293b'
      }}>
        <div
          onClick={() => navigate('/')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
        >
          <BrandLogo size={40} wordmarkSize={20} />
          <span style={{ color: '#7fd8ff', fontWeight: '700' }}>Legal</span>
        </div>
        <button 
          onClick={() => navigate('/')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'transparent',
            border: '1px solid #475569',
            color: '#cbd5e1',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Back to Home
        </button>
      </nav>

      <div style={{ display: 'flex', maxWidth: '1200px', margin: '0 auto', padding: '2rem', gap: '2rem', flexWrap: 'wrap' }}>
        
        {/* Sidebar Menu */}
        <aside style={{ flex: '1 1 250px', minWidth: '250px' }}>
          <div style={{ position: 'sticky', top: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <MenuButton 
              active={activeSection === 'faq'} 
              onClick={() => setActiveSection('faq')} 
              icon={<HelpCircle size={18} />} 
              label="Frequency Asked Questions" 
            />
            <MenuButton 
              active={activeSection === 'privacy'} 
              onClick={() => setActiveSection('privacy')} 
              icon={<Lock size={18} />} 
              label="Privacy Policy (GDPR)" 
            />
            <MenuButton 
              active={activeSection === 'terms'} 
              onClick={() => setActiveSection('terms')} 
              icon={<FileText size={18} />} 
              label="Terms of Service" 
            />
          </div>
        </aside>

        {/* Content Area */}
        <main style={{ flex: '3 1 600px', backgroundColor: '#1e293b', padding: '2.5rem', borderRadius: '12px', border: '1px solid #334155' }}>
          
          {activeSection === 'faq' && <FAQSection />}
          {activeSection === 'privacy' && <PrivacyPolicy />}
          {activeSection === 'terms' && <TermsOfService />}

        </main>
      </div>

      <footer style={{ textAlign: 'center', padding: '2rem', color: '#64748b', borderTop: '1px solid #334155', marginTop: 'auto' }}>
        <p>© 2026 Edumaxim. All rights reserved.</p>
      </footer>
    </div>
  )
}

// --- Components ---

function MenuButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        width: '100%',
        padding: '1rem',
        border: 'none',
        borderRadius: '8px',
        background: active ? 'linear-gradient(135deg, #45d5e8 0%, #9e65ec 100%)' : 'transparent',
        color: active ? '#ffffff' : '#94a3b8',
        fontWeight: active ? '600' : '400',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s'
      }}
    >
      {icon} {label}
    </button>
  )
}

function FAQSection() {
  return (
    <div>
      <h2 style={{ fontSize: '2rem', marginBottom: '2rem', color: '#fff' }}>Frequency Asked Questions</h2>
      
      <h3 style={{ color: '#818cf8', marginTop: '2rem', marginBottom: '1rem' }}>🎓 For Students</h3>
      <Accordion question="How do I book a lesson?">
        To book a lesson, log in to your student dashboard, browse our list of qualified tutors, select a tutor's profile, and choose an available time slot from their calendar.
      </Accordion>
      <Accordion question="How do payments work?">
        Payments are processed securely through PayPal at the time of booking. You pay when you reserve the lesson, and the booking is confirmed once PayPal confirms the payment.
      </Accordion>
      <Accordion question="Can I cancel a lesson?">
        Yes, you can cancel a lesson up to 24 hours before the scheduled start time for a full refund. Cancellations made within 24 hours may be subject to a cancellation fee at the tutor's discretion.
      </Accordion>
      <Accordion question="How do I join the online lesson?">
        Currently, lessons are conducted via external video platforms (Zoom/Teams/Google Meet). Your tutor will send you the meeting link via the messaging system or email prior to the lesson.
      </Accordion>

      <h3 style={{ color: '#818cf8', marginTop: '3rem', marginBottom: '1rem' }}>👨‍🏫 For Tutors</h3>
      <Accordion question="How do I set my hourly rate?">
        You can set your hourly rate in the "Settings" tab of your Tutor Dashboard. You can change this rate at any time, but changes will only apply to new bookings.
      </Accordion>
      <Accordion question="When do I get paid?">
        Earnings are processed after the successful completion of a lesson. Payouts are typically transferred to your connected bank account on a weekly basis, subject to a minimum threshold of £50.
      </Accordion>
      <Accordion question="Can I block out time for holidays?">
        Yes, use the "Availability" tab in your dashboard to set your weekly schedule. You can also use the "Block Time" feature to mark specific dates as unavailable for holidays or appointments.
      </Accordion>
    </div>
  )
}

function PrivacyPolicy() {
  return (
    <div style={{ lineHeight: '1.7', color: '#cbd5e1' }}>
      <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', color: '#fff' }}>Privacy Policy (GDPR)</h2>
      <p style={{ marginBottom: '1rem' }}><strong>Last Updated:</strong> February 2026</p>
      
      <p style={{ marginBottom: '2rem' }}>
        At Edumaxim, we are committed to protecting your privacy and ensuring the security of your personal data. This policy explains how we collect, use, and protect your information in compliance with the General Data Protection Regulation (GDPR).
      </p>

      <h3 style={{ color: '#fff', marginTop: '2rem' }}>1. Data We Collect</h3>
      <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
        <li><strong>Identity Data:</strong> Name, date of birth, profile pictures.</li>
        <li><strong>Contact Data:</strong> Email address, phone number, billing address.</li>
        <li><strong>Financial Data:</strong> Payment details (processed securely by PayPal and other necessary payment infrastructure providers).</li>
        <li><strong>Usage Data:</strong> Information about how you use our website and services.</li>
      </ul>

      <h3 style={{ color: '#fff', marginTop: '2rem' }}>2. How We Use Your Data</h3>
      <p>We use your data to:</p>
      <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
        <li>Facilitate bookings and communication between students and tutors.</li>
        <li>Process payments and payouts.</li>
        <li>Send important service updates and notifications.</li>
        <li>Ensure the security of our platform.</li>
      </ul>

      <h3 style={{ color: '#fff', marginTop: '2rem' }}>3. Your Rights (GDPR)</h3>
      <p>Under the GDPR, you have the right to:</p>
      <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
        <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
        <li><strong>Rectification:</strong> Request correction of inaccurate data.</li>
        <li><strong>Erasure:</strong> Request deletion of your data ("Right to be Forgotten"), subject to legal retention obligations.</li>
        <li><strong>Restriction:</strong> Request restriction of processing your data.</li>
      </ul>
      <p>To exercise these rights, please contact our Data Protection Officer at <strong>privacy@edumaxim.com</strong>.</p>

      <h3 style={{ color: '#fff', marginTop: '2rem' }}>4. Data Security</h3>
      <p>
        We implement robust security measures to prevent your personal data from being accidentally lost, used, or accessed in an unauthorized way. Access to your personal data is limited to those employees, agents, and contractors who have a business need to know.
      </p>
    </div>
  )
}

function TermsOfService() {
  return (
    <div style={{ lineHeight: '1.7', color: '#cbd5e1' }}>
      <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', color: '#fff' }}>Terms of Service</h2>
      
      <h3 style={{ color: '#fff', marginTop: '2rem' }}>1. Acceptance of Terms</h3>
      <p>By accessing and using Edumaxim, you accept and agree to be bound by the terms and provision of this agreement.</p>

      <h3 style={{ color: '#fff', marginTop: '2rem' }}>2. User Conduct</h3>
      <p>Users agree not to:</p>
      <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
        <li>Harass, abuse, or harm another person.</li>
        <li>Use the service for any illegal or unauthorized purpose.</li>
        <li>Attempt to circumvent the booking system to avoid fees.</li>
      </ul>

      <h3 style={{ color: '#fff', marginTop: '2rem' }}>3. Cancellation Policy</h3>
      <p>
        Students may cancel a booking up to 24 hours before the start time for a full refund. Cancellations made within 24 hours of the start time are non-refundable unless otherwise agreed by the tutor.
      </p>

      <h3 style={{ color: '#fff', marginTop: '2rem' }}>4. Limitation of Liability</h3>
      <p>
        Edumaxim acts as a platform to connect students and tutors. We are not responsible for the quality of instruction provided by tutors or the conduct of students.
      </p>
    </div>
  )
}

function Accordion({ question, children }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid #334155', padding: '1rem 0' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          color: '#f1f5f9',
          fontSize: '1.1rem',
          fontWeight: '500',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        {question}
        {isOpen ? <ChevronUp size={20} color="#45d5e8" /> : <ChevronDown size={20} color="#94a3b8" />}
      </button>
      {isOpen && (
        <div style={{ marginTop: '0.75rem', color: '#94a3b8', lineHeight: '1.6' }}>
          {children}
        </div>
      )}
    </div>
  )
}
