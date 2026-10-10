import { useEffect, useState } from 'react'
import { BookOpen, CircleHelp, Mail, Send } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './HelpCenter.css'

const SUPPORT_EMAIL = 'scott@scott-hw.online'

const studentGuides = [
  ['Book a lesson', 'Open Book a Lesson, choose a tutor and time that suits you, then complete payment to confirm it.'],
  ['Join your lesson', 'Check your lesson arrangements and contact your tutor if you need help joining.'],
  ['Submit homework', 'Choose Homework, select the relevant lesson, attach your work and submit it for tutor review.'],
  ['Manage your account', 'Use My Profile to keep your details up to date and Payments to view payment information.'],
]

const tutorGuides = [
  ['Manage bookings', 'Use Bookings to review upcoming requests and keep lesson arrangements up to date.'],
  ['Set availability', 'Add your regular teaching hours and block dates or times when you are unavailable.'],
  ['Run lessons', 'Use Lessons to prepare lesson notes and check your lesson arrangements before teaching.'],
  ['Review student work', 'Open Homework Submissions to download work, give feedback and mark completed submissions.'],
]

export default function HelpCenter({ role, user, profile }) {
  const [recipient, setRecipient] = useState(null)
  const [recipientError, setRecipientError] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formMessage, setFormMessage] = useState('')
  const [inbox, setInbox] = useState([])

  const guides = role === 'student' ? studentGuides : tutorGuides
  const recipientLabel = role === 'student' ? 'your tutor' : SUPPORT_EMAIL

  useEffect(() => {
    if (!user?.id) return

    let active = true

    async function loadRecipient() {
      setRecipient(null)
      setRecipientError('')

      if (role === 'tutor') {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('email', SUPPORT_EMAIL)
          .maybeSingle()

        if (!active) return
        if (error || !data) {
          setRecipientError(`Support account (${SUPPORT_EMAIL}) is not available yet.`)
          return
        }
        setRecipient(data)
        return
      }

      const [lessonResult, bookingResult] = await Promise.all([
        supabase
          .from('lessons')
          .select('tutor_id, lesson_date')
          .eq('student_id', user.id)
          .neq('status', 'cancelled')
          .order('lesson_date', { ascending: false })
          .limit(1),
        supabase
          .from('bookings')
          .select('tutor_id, lesson_date')
          .eq('student_id', user.id)
          .eq('status', 'confirmed')
          .order('lesson_date', { ascending: false })
          .limit(1),
      ])

      if (!active) return
      const tutorId = lessonResult.data?.[0]?.tutor_id || bookingResult.data?.[0]?.tutor_id
      if (!tutorId) {
        setRecipientError('Book a confirmed lesson first so we know which tutor to contact.')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', tutorId)
        .maybeSingle()

      if (!active) return
      if (error || !data) {
        setRecipientError('Your tutor could not be found. Please try again shortly.')
        return
      }
      setRecipient(data)
    }

    loadRecipient()
    return () => { active = false }
  }, [role, user?.id])

  useEffect(() => {
    if (role !== 'tutor' || !user?.id) return

    let active = true
    async function loadInbox() {
      const { data } = await supabase
        .from('system_mail')
        .select('id, sender_email, subject, body, created_at, read_at')
        .eq('recipient_id', user.id)
        .like('subject', 'Help request:%')
        .order('created_at', { ascending: false })
        .limit(25)
      if (active) setInbox(data || [])
    }
    loadInbox()
    return () => { active = false }
  }, [role, user?.id, formMessage])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!recipient || !subject.trim() || !message.trim()) return

    setSubmitting(true)
    setFormMessage('')
    const { error } = await supabase
      .from('system_mail')
      .insert({
        sender_id: user.id,
        recipient_id: recipient.id,
        sender_email: user.email || profile?.email || '',
        recipient_email: recipient.email || '',
        subject: `Help request: ${subject.trim()}`,
        body: message.trim(),
      })

    if (error) {
      setFormMessage(error.message || 'Your message could not be sent. Please try again.')
    } else {
      setSubject('')
      setMessage('')
      setFormMessage(`Your message has been sent to ${recipientLabel}.`)
    }
    setSubmitting(false)
  }

  return (
    <div className="help-center">
      <div className="help-intro">
        <CircleHelp size={28} />
        <div>
          <h2>{role === 'student' ? 'Student help' : 'Tutor help'}</h2>
          <p>Find the essentials below or send a message if you need a hand.</p>
        </div>
      </div>

      <div className="help-guides">
        {guides.map(([title, description]) => (
          <article className="help-guide" key={title}>
            <BookOpen size={20} />
            <div><h3>{title}</h3><p>{description}</p></div>
          </article>
        ))}
      </div>

      <section className="help-contact">
        <div className="help-contact-heading"><Mail size={22} /><div><h2>Contact {role === 'student' ? 'your tutor' : 'support'}</h2><p>{recipient ? `Your message will be delivered to ${recipient.full_name || recipient.email}.` : 'Finding the right recipient…'}</p></div></div>
        <form onSubmit={handleSubmit} className="help-form">
          <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength="160" required /></label>
          <label>How can we help?<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows="5" maxLength="5000" required /></label>
          {recipientError && <p className="help-error">{recipientError}</p>}
          {formMessage && <p className={formMessage.startsWith('Your message') ? 'help-success' : 'help-error'}>{formMessage}</p>}
          <button type="submit" className="help-send" disabled={submitting || !recipient}><Send size={18} />{submitting ? 'Sending…' : 'Send message'}</button>
        </form>
      </section>

      {role === 'tutor' && (
        <section className="help-inbox">
          <h2>Help requests</h2>
          {inbox.length === 0 ? <p>No help requests yet.</p> : inbox.map((item) => <article className="help-message" key={item.id}><div><strong>{item.subject.replace('Help request: ', '')}</strong><span>{item.sender_email} · {new Date(item.created_at).toLocaleString('en-GB')}</span></div><p>{item.body}</p></article>)}
        </section>
      )}
    </div>
  )
}
