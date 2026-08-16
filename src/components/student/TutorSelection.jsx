import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllTutors } from '../../lib/profileAPI'
import { User, BookOpen, Loader2 } from 'lucide-react'

export default function TutorSelection({ previewMode = false }) {
  const [tutors, setTutors] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function loadTutors() {
      try {
        const { data } = await getAllTutors()
        if (data) setTutors(data)
      } catch (error) {
        console.error("Failed to load tutors", error)
      } finally {
        setLoading(false)
      }
    }
    loadTutors()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <Loader2 className="animate-spin" size={32} color="#7c3aed" />
      </div>
    )
  }

  const formatSubjectLines = (tutor) => {
    if (tutor.lesson_subjects?.length > 0) {
      return tutor.lesson_subjects.map((subject) => (
        <div key={subject.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <span>{subject.name}</span>
          <strong>£{Number(subject.price).toFixed(2)}</strong>
        </div>
      ))
    }

    return <span>{tutor.subjects ? tutor.subjects : "General Tuition"}</span>
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '2rem', color: '#fff' }}>Select a Tutor</h1>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
        gap: '1.5rem' 
      }}>
        {tutors.map((tutor) => (
          <div key={tutor.id} style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            transition: 'transform 0.2s',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ 
                width: '50px', 
                height: '50px', 
                backgroundColor: '#7c3aed', 
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '1.25rem'
              }}>
                {tutor.full_name ? tutor.full_name.charAt(0).toUpperCase() : 'T'}
              </div>
              <div>
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem' }}>
                  {tutor.full_name || 'Tutor'}
                </h3>
                <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                  Professional Tutor
                </p>
              </div>
            </div>

            {/* Display Subjects */}
            <div style={{ 
              backgroundColor: '#0f172a', 
              padding: '0.75rem', 
              borderRadius: '8px',
              border: '1px solid #334155'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', color: '#818cf8', fontSize: '0.85rem', fontWeight: '600' }}>
                <BookOpen size={14} /> 
                <span>SUBJECTS</span>
              </div>
              <div style={{ margin: 0, color: '#cbd5e1', fontSize: '0.95rem', display: 'grid', gap: '0.35rem' }}>
                {formatSubjectLines(tutor)}
              </div>
            </div>

            <button 
              onClick={() => {
                if (previewMode) return
                navigate(`/student/book/${tutor.id}`)
              }}
              disabled={previewMode}
              style={{
                marginTop: 'auto',
                width: '100%',
                padding: '0.875rem',
                backgroundColor: previewMode ? '#475569' : '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: previewMode ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                opacity: previewMode ? 0.7 : 1
              }}
            >
              {previewMode ? 'Preview only' : 'Book Lesson'}
            </button>
          </div>
        ))}
        
        {tutors.length === 0 && (
          <p style={{ color: '#94a3b8' }}>No tutors found.</p>
        )}
      </div>
    </div>
  )
}
