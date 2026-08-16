import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/auth'
import { getTutorHourlyRate, updateTutorHourlyRate } from '../../lib/profileAPI'
import { getSystemSetting, updateSystemSetting } from '../../lib/settingsAPI'
import { getAnnouncements, createAnnouncement } from '../../lib/announcementsAPI'
import { deleteTutorSubject, getTutorSubjects, saveTutorSubject } from '../../lib/tutorSubjectsAPI'
import { Save, AlertTriangle, Power, Plus, Trash2 } from 'lucide-react'

export default function Settings() {
  const { user } = useAuth()
  
  // States
  const [rate, setRate] = useState(30.00)
  const [lessonSubjects, setLessonSubjects] = useState([])
  const [subjectForm, setSubjectForm] = useState({ name: '', price: '' })
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [announcements, setAnnouncements] = useState([])
  const [announcement, setAnnouncement] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  
  // UI States
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  const loadSettings = useCallback(async () => {
    if (!user?.id) return

    // Load Rate
    const { data: rateData } = await getTutorHourlyRate(user.id)
    if (rateData?.hourly_rate) setRate(rateData.hourly_rate)

    const { data: subjectData, error: subjectError } = await getTutorSubjects(user.id)
    if (!subjectError) setLessonSubjects(subjectData || [])

    // Load Maintenance Mode
    try {
      const { data: settingData } = await getSystemSetting('maintenance_mode')
      if (settingData) setMaintenanceMode(settingData.value === 'true')
    } catch (err) {
      console.error("Could not load maintenance setting:", err)
    }

    const { data: announcementData, error: announcementError } = await getAnnouncements()
    if (!announcementError) setAnnouncements(announcementData || [])
  }, [user?.id])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg({ type: '', text: '' })

    try {
      // 1. Update Hourly Rate
      const { error: rateError } = await updateTutorHourlyRate(user.id, parseFloat(rate))
      if (rateError) throw rateError

      // 2. Update Maintenance Mode
      const { error: settingError } = await updateSystemSetting('maintenance_mode', maintenanceMode)
      if (settingError) throw settingError

      setMsg({ type: 'success', text: 'All settings updated successfully!' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleSubjectSave = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMsg({ type: '', text: '' })

    const { error } = await saveTutorSubject(user.id, subjectForm)
    if (error) {
      setMsg({ type: 'error', text: error.message })
    } else {
      setSubjectForm({ name: '', price: '' })
      setMsg({ type: 'success', text: 'Lesson subject saved.' })
      await loadSettings()
    }

    setLoading(false)
  }

  const handleSubjectToggle = async (subject) => {
    setLoading(true)
    setMsg({ type: '', text: '' })

    const { error } = await saveTutorSubject(user.id, {
      ...subject,
      is_active: !subject.is_active,
    })

    if (error) {
      setMsg({ type: 'error', text: error.message })
    } else {
      await loadSettings()
    }

    setLoading(false)
  }

  const handleSubjectDelete = async (subjectId) => {
    if (!window.confirm('Delete this lesson subject? Existing bookings keep their saved subject and price.')) return
    setLoading(true)
    setMsg({ type: '', text: '' })

    const { error } = await deleteTutorSubject(user.id, subjectId)
    if (error) {
      setMsg({ type: 'error', text: error.message })
    } else {
      setMsg({ type: 'success', text: 'Lesson subject deleted.' })
      await loadSettings()
    }

    setLoading(false)
  }

  const handleAnnouncementSave = async (event) => {
    event.preventDefault()
    if (!announcement.trim() || !startsAt) {
      setMsg({ type: 'error', text: 'Enter an announcement and start date.' })
      return
    }
    if (endsAt && new Date(endsAt) < new Date(startsAt)) {
      setMsg({ type: 'error', text: 'The end date must be after the start date.' })
      return
    }
    setLoading(true)
    const { error } = await createAnnouncement({ message: announcement, startsAt, endsAt, createdBy: user.id })
    if (error) {
      setMsg({ type: 'error', text: error.message })
    } else {
      setAnnouncement('')
      setStartsAt('')
      setEndsAt('')
      setMsg({ type: 'success', text: 'Announcement saved.' })
      await loadSettings()
      window.dispatchEvent(new Event('announcements-updated'))
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: '600px', padding: '2rem', backgroundColor: '#1a1a1a', borderRadius: '12px', border: '2px solid #3a3a3a' }}>
      <h2 style={{ color: '#ffffff', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Save size={24} color="#7c3aed" /> System Settings
      </h2>
      
      {msg.text && (
        <div style={{ 
          backgroundColor: msg.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
          color: msg.type === 'success' ? '#6ee7b7' : '#fca5a5', 
          padding: '1rem', 
          borderRadius: '6px', 
          marginBottom: '1.5rem', 
          border: `1px solid ${msg.type === 'success' ? '#10b981' : '#ef4444'}` 
        }}>
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* --- SECTION 1: Hourly Rate --- */}
        <div style={{ paddingBottom: '1.5rem', borderBottom: '1px solid #333' }}>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '1rem' }}>Default pricing</h3>
          <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.5rem', fontWeight: '500' }}>
            Fallback hourly rate (£)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            required
            style={{ width: '100%', padding: '0.75rem', fontSize: '1.1rem', backgroundColor: '#000000', color: '#ffffff', border: '1px solid #3a3a3a', borderRadius: '6px' }}
          />
          <p style={{ margin: '0.75rem 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
            Used only when a booking has no selected lesson subject.
          </p>
        </div>

        <div style={{ paddingBottom: '1.5rem', borderBottom: '1px solid #333' }}>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '1rem' }}>Lesson subjects and prices</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px auto', gap: '0.75rem', alignItems: 'end' }}>
            <label style={{ color: '#cbd5e1', fontWeight: '500' }}>
              Subject
              <input
                type="text"
                value={subjectForm.name}
                onChange={(event) => setSubjectForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="GCSE Maths"
                style={{ width: '100%', boxSizing: 'border-box', marginTop: '0.5rem', padding: '0.75rem', backgroundColor: '#000000', color: '#ffffff', border: '1px solid #3a3a3a', borderRadius: '6px' }}
              />
            </label>
            <label style={{ color: '#cbd5e1', fontWeight: '500' }}>
              Price (£)
              <input
                type="number"
                min="0"
                step="0.01"
                value={subjectForm.price}
                onChange={(event) => setSubjectForm((current) => ({ ...current, price: event.target.value }))}
                placeholder="35.00"
                style={{ width: '100%', boxSizing: 'border-box', marginTop: '0.5rem', padding: '0.75rem', backgroundColor: '#000000', color: '#ffffff', border: '1px solid #3a3a3a', borderRadius: '6px' }}
              />
            </label>
            <button type="button" onClick={handleSubjectSave} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.75rem 1rem', color: '#fff', backgroundColor: '#2563eb', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              <Plus size={16} /> Add
            </button>
          </div>

          <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1rem' }}>
            {lessonSubjects.length === 0 && <span style={{ color: '#94a3b8' }}>No lesson subjects added yet.</span>}
            {lessonSubjects.map((subject) => (
              <div key={subject.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: '0.75rem', alignItems: 'center', padding: '0.75rem', backgroundColor: '#000', border: '1px solid #3a3a3a', borderRadius: '6px' }}>
                <strong style={{ color: '#fff' }}>{subject.name}</strong>
                <span style={{ color: '#cbd5e1' }}>£{Number(subject.price).toFixed(2)}</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#cbd5e1', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={subject.is_active} onChange={() => handleSubjectToggle(subject)} />
                  Active
                </label>
                <button type="button" onClick={() => handleSubjectDelete(subject.id)} title="Delete subject" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.45rem', color: '#fca5a5', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '6px', cursor: 'pointer' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* --- SECTION 2: Maintenance Mode --- */}
        <div style={{ paddingBottom: '1.5rem', borderBottom: '1px solid #333' }}>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Power size={18} color={maintenanceMode ? '#ef4444' : '#10b981'} /> 
            Maintenance Controls
          </h3>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            backgroundColor: maintenanceMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.05)', 
            padding: '1rem', 
            borderRadius: '8px',
            border: `1px solid ${maintenanceMode ? '#7f1d1d' : '#3a3a3a'}`
          }}>
            <div>
              <strong style={{ color: '#fff', display: 'block', marginBottom: '4px' }}>Maintenance Mode</strong>
              <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                {maintenanceMode 
                  ? "Active: Students CANNOT log in." 
                  : "Inactive: Students can log in normally."}
              </span>
            </div>
            
            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '60px', height: '34px' }}>
              <input 
                type="checkbox" 
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{ 
                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, 
                backgroundColor: maintenanceMode ? '#ef4444' : '#3a3a3a', 
                borderRadius: '34px', transition: '.4s' 
              }}></span>
              <span style={{ 
                position: 'absolute', content: '""', height: '26px', width: '26px', left: '4px', bottom: '4px', 
                backgroundColor: 'white', borderRadius: '50%', transition: '.4s',
                transform: maintenanceMode ? 'translateX(26px)' : 'translateX(0)'
              }}></span>
            </label>
          </div>
          
          {maintenanceMode && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', color: '#fca5a5', fontSize: '0.9rem' }}>
              <AlertTriangle size={16} />
              <span>Warning: Existing students may be disconnected upon page refresh.</span>
            </div>
          )}
        </div>

        <div style={{ paddingBottom: '1.5rem', borderBottom: '1px solid #333' }}>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '1rem' }}>Student announcement</h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <textarea id="announcement-banner" value={announcement} onChange={(event) => setAnnouncement(event.target.value)} maxLength="500" rows="3" placeholder="Write an announcement for all dashboard users..." style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', fontSize: '1rem', backgroundColor: '#000000', color: '#ffffff', border: '1px solid #3a3a3a', borderRadius: '6px', resize: 'vertical' }} />
            <label style={{ color: '#cbd5e1' }}>Starts <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required style={{ marginLeft: '0.5rem', padding: '0.5rem' }} /></label>
            <label style={{ color: '#cbd5e1' }}>Ends <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} style={{ marginLeft: '0.8rem', padding: '0.5rem' }} /></label>
            <button type="button" onClick={handleAnnouncementSave} disabled={loading} style={{ padding: '0.7rem', color: '#fff', backgroundColor: '#2563eb', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Save Announcement</button>
          </div>
          <p style={{ margin: '0.75rem 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>Active announcements scroll one after another. Leave the end date empty for an announcement with no expiry.</p>
          <h4 style={{ color: '#fff', margin: '1.5rem 0 0.75rem' }}>Previous announcements</h4>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {announcements.length === 0 && <span style={{ color: '#94a3b8' }}>No announcements saved yet.</span>}
            {announcements.map((item) => (
              <div key={item.id} style={{ padding: '0.75rem', backgroundColor: '#000', border: '1px solid #3a3a3a', borderRadius: '6px' }}>
                <div style={{ color: '#fff' }}>{item.message}</div>
                <small style={{ color: '#94a3b8' }}>{new Date(item.starts_at).toLocaleString()} – {item.ends_at ? new Date(item.ends_at).toLocaleString() : 'No expiry'}</small>
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '1rem', fontSize: '1rem', fontWeight: '600', color: '#ffffff', backgroundColor: '#7c3aed', border: 'none', borderRadius: '8px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Saving Changes...' : 'Save All Settings'}
        </button>
      </form>
    </div>
  )
}
