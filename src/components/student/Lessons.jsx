import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/auth'
import { supabase } from '../../lib/supabaseClient'
import HomeworkSubmission from './HomeworkSubmission'
import { getLessonActivities } from '../../lib/lessonsAPI'
import { getLessonHomework } from '../../lib/homeworkAPI'

export default function Lessons({ studentId }) {
  const { user } = useAuth()
  const [lessons, setLessons] = useState([])
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [activities, setActivities] = useState([])
  const [homework, setHomework] = useState([])
  const [loading, setLoading] = useState(true)

  const loadLessons = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('student_id', studentId || user?.id)
        .order('lesson_date', { ascending: false })

      if (error) throw error
      setLessons(data || [])
    } catch (error) {
      console.error('Error loading lessons:', error)
    } finally {
      setLoading(false)
    }
  }, [studentId, user?.id])

  useEffect(() => {
    if (!(studentId || user?.id)) return
    loadLessons()
  }, [studentId, user?.id, loadLessons])

  async function loadLessonDetails(lessonId) {
    try {
      setSelectedLesson(lessonId)

      // Load activities
      const { data: activitiesData } = await getLessonActivities(lessonId)
      setActivities(activitiesData || [])

      // Load homework submissions
      const { data: homeworkData } = await getLessonHomework(lessonId)
      setHomework(homeworkData || [])
    } catch (err) {
      console.error('Failed to load lesson details', err)
    }
  }

  const downloadActivity = (activity) => {
    window.open(activity.file_url, '_blank')
  }

  if (loading) return <div>Loading lessons...</div>

  return (
    <div className="lessons-container">
      <h2>My Lessons</h2>

      {lessons.length === 0 ? (
        <div className="empty-state">
          <p>No lessons yet.</p>
        </div>
      ) : (
        <div className="lessons-list">
          {lessons.map((lesson) => (
            <div key={lesson.id} className="lesson-card">
              <div className="lesson-header">
                <h3>{lesson.title}</h3>
                <button
                  onClick={() => {
                    if (selectedLesson === lesson.id) {
                      setSelectedLesson(null)
                    } else {
                      loadLessonDetails(lesson.id)
                    }
                  }}
                  className="btn-secondary"
                >
                  {selectedLesson === lesson.id ? 'Hide Details' : 'View Details'}
                </button>
              </div>

              <div className="lesson-info">
                <p><strong>Date:</strong> {new Date(lesson.lesson_date).toLocaleDateString()}</p>
                <p><strong>Time:</strong> {lesson.lesson_time.slice(0, 5)}</p>
                <p><strong>Duration:</strong> {lesson.duration_minutes} minutes</p>
              </div>

              {selectedLesson === lesson.id && (
                <div className="lesson-details">
                  {/* Read-only lesson fields */}
                  <div className="lesson-fields">
                    <div className="form-group">
                      <label>Date of Lesson (Read Only)</label>
                      <input
                        type="text"
                        value={new Date(lesson.lesson_date).toLocaleDateString()}
                        disabled
                        className="read-only-input"
                      />
                    </div>

                    <div className="form-group">
                      <label>Time of Lesson (Read Only)</label>
                      <input
                        type="text"
                        value={lesson.lesson_time.slice(0, 5)}
                        disabled
                        className="read-only-input"
                      />
                    </div>

                    <div className="form-group">
                      <label>Lesson Duration (Read Only)</label>
                      <input
                        type="text"
                        value={`${lesson.duration_minutes} minutes`}
                        disabled
                        className="read-only-input"
                      />
                    </div>

                    <div className="form-group">
                      <label>Title of Lesson (Read Only)</label>
                      <input
                        type="text"
                        value={lesson.title}
                        disabled
                        className="read-only-input"
                      />
                    </div>

                    <div className="form-group">
                      <label>Covered in Previous Lesson (Read Only)</label>
                      <textarea
                        value={lesson.covered_in_previous_lesson || ''}
                        disabled
                        className="read-only-input"
                        rows="4"
                      />
                    </div>

                    <div className="form-group">
                      <label>Covered in Current Lesson (Read Only)</label>
                      <textarea
                        value={lesson.covered_in_current_lesson || ''}
                        disabled
                        className="read-only-input"
                        rows="4"
                      />
                    </div>

                    <div className="form-group">
                      <label>Next Lesson Description (Read Only)</label>
                      <textarea
                        value={lesson.next_lesson_description || ''}
                        disabled
                        className="read-only-input"
                        rows="4"
                      />
                    </div>
                  </div>

                  {/* Activities Section */}
                  <div className="activities-section">
                    <h4>Lesson Activities</h4>
                    {activities.length === 0 ? (
                      <p>No activities available for this lesson.</p>
                    ) : (
                      <div className="activities-list">
                        {activities.map((activity) => (
                          <div key={activity.id} className="activity-item">
                            <div className="activity-info">
                              <h5>{activity.title}</h5>
                              {activity.description && <p>{activity.description}</p>}
                              <small>{activity.file_name} ({(activity.file_size / 1024).toFixed(2)} KB)</small>
                            </div>
                            <button
                              onClick={() => downloadActivity(activity)}
                              className="btn-secondary"
                            >
                              Download
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Homework Submission Section */}
                  <div className="homework-section">
                    <h4>Submit Homework</h4>
                    <HomeworkSubmission 
                      lessonId={lesson.id} 
                      onSubmissionSuccess={() => {
                        // Reload homework submissions for this lesson
                        loadLessonDetails(lesson.id)
                      }}
                    />
                  </div>

                  {/* Submitted Homework */}
                  {homework.length > 0 && (
                    <div className="submitted-homework">
                      <h4>Submitted Homework</h4>
                      {homework.map((hw) => (
                        <div key={hw.id} className="homework-item">
                          <p><strong>Submitted:</strong> {new Date(hw.submitted_at).toLocaleString()}</p>
                          <p><strong>File:</strong> {hw.submission_file_name}</p>
                          <p><strong>Status:</strong> {hw.status}</p>
                          {hw.tutor_feedback && (
                            <div className="feedback-section">
                              <strong>Feedback (Read Only):</strong>
                              <div className="feedback-content">{hw.tutor_feedback}</div>
                              {hw.marked_at && (
                                <small>Marked on: {new Date(hw.marked_at).toLocaleString()}</small>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
