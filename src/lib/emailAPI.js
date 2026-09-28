import { supabase } from './supabaseClient'

export async function sendStudentEmail({ studentEmail, subject, message }) {
  const { data, error } = await supabase.functions.invoke('system-mail', {
    body: {
      recipient_email: studentEmail,
      subject,
      body: message
    }
  })

  if (error) {
    let details
    try {
      details = await error.context?.json()
    } catch {
      // Network errors and non-JSON responses have no backend error details.
    }
    throw new Error(details?.error || error.message || 'Failed to send email')
  }

  if (data?.error) throw new Error(data.error)

  if (!data?.ok || !data?.external_sent) {
    throw new Error(data?.external_error || 'The email could not be sent. Please try again.')
  }

  return data
}
