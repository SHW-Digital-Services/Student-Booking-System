import { useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { getAnnouncements } from '../../lib/announcementsAPI'
import { supabase } from '../../lib/supabaseClient'
import './AnnouncementBanner.css'

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState([])

  useEffect(() => {
    let mounted = true

    const loadAnnouncement = async () => {
      const { data, error } = await getAnnouncements({ activeOnly: true })
      if (!error && mounted) setAnnouncements(data || [])
    }

    loadAnnouncement()

    const channel = supabase
      .channel('announcements')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements' },
        () => loadAnnouncement()
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [])

  if (!announcements.length) return null
  const announcement = announcements.map(({ message }) => message.trim()).join('   •   ')

  return (
    <section className="announcement-banner" aria-label="Tutor announcement">
      <Megaphone className="announcement-banner-icon" size={20} aria-hidden="true" />
      <div className="announcement-banner-viewport">
        <p className="announcement-banner-message">{announcement}</p>
      </div>
    </section>
  )
}
