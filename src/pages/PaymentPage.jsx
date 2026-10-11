import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import BrandLogo from '../components/shared/BrandLogo'
import { getBookingById } from '../lib/bookingAPI'
import { supabase } from '../lib/supabaseClient'

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID
const PAYPAL_SDK_URL = 'https://www.paypal.com/sdk/js'

export default function PaymentPage() {
  const { bookingId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const buttonContainer = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [amount, setAmount] = useState(0)
  const [paypalReady, setPaypalReady] = useState(false)
  const [processing, setProcessing] = useState(false)
  const paymentCancelled = useMemo(() => new URLSearchParams(location.search).get('cancelled') === '1', [location.search])

  useEffect(() => {
    if (paymentCancelled) {
      setLoading(false)
      return
    }

    let cancelled = false
    const loadBooking = async () => {
      try {
        if (!bookingId) throw new Error('Booking ID is missing')
        if (!PAYPAL_CLIENT_ID) throw new Error('PayPal checkout is not configured. Please contact support.')

        const { data: booking, error: bookingError } = await getBookingById(bookingId)
        if (bookingError) throw bookingError
        if (!booking) throw new Error('Booking not found')

        const savedLessonPrice = Number(booking.lesson_price || 0)
        const hourlyRate = Number(booking.tutor?.hourly_rate || 0)
        const durationMinutes = Number(booking.duration_minutes || 60)
        const bookingAmount = savedLessonPrice > 0 ? savedLessonPrice : Number(((hourlyRate * durationMinutes) / 60).toFixed(2))
        if (!bookingAmount || bookingAmount <= 0) throw new Error('Unable to calculate the booking amount')

        if (!cancelled) {
          setAmount(bookingAmount)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to prepare PayPal checkout')
          setLoading(false)
        }
      }
    }

    loadBooking()
    return () => { cancelled = true }
  }, [bookingId, paymentCancelled])

  useEffect(() => {
    if (loading || error || paymentCancelled || !PAYPAL_CLIENT_ID || !buttonContainer.current) return undefined

    let disposed = false
    let buttons
    const initializeButtons = async () => {
      try {
        if (!window.paypal) {
          const existingScript = document.querySelector(`script[src^="${PAYPAL_SDK_URL}"]`)
          const script = existingScript || document.createElement('script')
          if (!existingScript) {
            const params = new URLSearchParams({ 'client-id': PAYPAL_CLIENT_ID, currency: 'GBP', intent: 'capture', components: 'buttons' })
            script.src = `${PAYPAL_SDK_URL}?${params}`
            script.async = true
            document.head.appendChild(script)
          }
          await new Promise((resolve, reject) => {
            if (window.paypal) return resolve()
            script.addEventListener('load', resolve, { once: true })
            script.addEventListener('error', () => reject(new Error('PayPal checkout could not be loaded.')), { once: true })
          })
        }

        if (disposed || !window.paypal || !buttonContainer.current) return
        buttons = window.paypal.Buttons({
          createOrder: async () => {
            const { data, error: createError } = await supabase.functions.invoke('paypal-create-order', { body: { bookingId } })
            if (createError) throw new Error(createError.message || 'Could not start PayPal checkout')
            if (!data?.orderId) throw new Error('PayPal did not return an order ID')
            return data.orderId
          },
          onApprove: async (details) => {
            setProcessing(true)
            setError(null)
            const { data, error: captureError } = await supabase.functions.invoke('paypal-capture-order', {
              body: { bookingId, orderId: details.orderID },
            })
            if (captureError) throw new Error(captureError.message || 'PayPal could not confirm the payment')
            if (!data?.ok) throw new Error(data?.error || 'PayPal could not confirm the payment')
            navigate(`/student?payment=success&booking_id=${encodeURIComponent(bookingId)}`, { replace: true })
          },
          onCancel: () => setError('You cancelled PayPal checkout. Your booking has not been paid.'),
          onError: (paypalError) => {
            console.error('PayPal checkout failed:', paypalError)
            setError('PayPal checkout could not be completed. Please try again.')
            setProcessing(false)
          },
          style: { layout: 'vertical', shape: 'rect', label: 'paypal' },
        })

        await buttons.render(buttonContainer.current)
        if (!disposed) setPaypalReady(true)
      } catch (err) {
        if (!disposed) setError(err.message || 'PayPal checkout could not be loaded')
      }
    }

    initializeButtons()
    return () => {
      disposed = true
      buttons?.close?.()
    }
  }, [bookingId, error, loading, navigate, paymentCancelled])

  const handleBack = () => navigate(-1)

  if (paymentCancelled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full space-y-5 bg-white p-8 rounded-xl shadow-md text-center">
          <BrandLogo size={44} wordmarkSize={20} />
          <h2 className="text-2xl font-bold text-gray-900">Checkout cancelled</h2>
          <p className="text-gray-600">No payment was taken and your booking was not confirmed. You can try again when ready.</p>
          <button type="button" onClick={() => navigate(`/payment/${bookingId}`, { replace: true })} className="rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white">Try PayPal again</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-xl shadow-md text-center">
        <BrandLogo size={44} wordmarkSize={20} />
        <h2 className="text-3xl font-extrabold text-gray-900">Pay with PayPal</h2>
        {loading && <p className="text-sm text-gray-600">Preparing payment…</p>}
        {!loading && !error && <p className="text-sm text-gray-600">Lesson payment: £{amount.toFixed(2)}</p>}
        {error && <div role="alert" className="text-sm text-red-600 space-y-4"><p className="inline-flex items-center justify-center gap-2"><AlertCircle size={16} />{error}</p><button type="button" onClick={handleBack} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white"><ArrowLeft size={16} />Go back</button></div>}
        {!loading && !error && <div ref={buttonContainer} aria-label="PayPal checkout buttons" />}
        {processing && <p role="status" className="text-sm text-gray-600">Confirming your PayPal payment…</p>}
        {paypalReady && !processing && <p className="text-xs text-gray-500">You’ll return here after approving the payment in PayPal.</p>}
      </div>
    </div>
  )
}
