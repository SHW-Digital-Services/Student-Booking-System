import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, LayoutDashboard } from 'lucide-react'
import BrandLogo from '../components/shared/BrandLogo'
import { getBookingById } from '../lib/bookingAPI'
import { supabase } from '../lib/supabaseClient'

export default function PaymentPage() {
  const { bookingId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [amount, setAmount] = useState(0)
  const paymentCancelled = useMemo(() => {
    const searchParams = new URLSearchParams(location.search)
    return searchParams.get('cancelled') === '1'
  }, [location.search])

  useEffect(() => {
    if (paymentCancelled) {
      setLoading(false)
      return
    }

    let isCancelled = false

    const startStripeCheckout = async () => {
      try {
        if (!bookingId) {
          throw new Error('Booking ID is missing')
        }

        const { data: booking, error: bookingError } = await getBookingById(bookingId)
        if (bookingError) throw bookingError
        if (!booking) throw new Error('Booking not found')

        const hourlyRate = Number(booking.tutor?.hourly_rate || 0)
        const durationMinutes = Number(booking.duration_minutes || 60)
        const savedLessonPrice = Number(booking.lesson_price || 0)
        const bookingAmount = savedLessonPrice > 0
          ? savedLessonPrice
          : Number(((hourlyRate * durationMinutes) / 60).toFixed(2))

        if (!bookingAmount || bookingAmount <= 0) {
          throw new Error('Unable to calculate the booking amount')
        }

        if (!isCancelled) {
          setAmount(bookingAmount)
        }

        const { data, error: paymentError } = await supabase.functions.invoke(
          'stripe-init',
          {
            body: {
              amount: bookingAmount,
              bookingId: booking.id,
              studentId: booking.student_id,
              email: booking.student?.email || booking.student_email || '',
            },
          },
        )

        if (paymentError) {
          throw new Error(paymentError.message || 'Failed to initialize Stripe checkout')
        }

        if (!data?.checkout_url) {
          throw new Error('Failed to initialize Stripe checkout')
        }

        window.location.href = data.checkout_url
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || 'Failed to start payment')
          setLoading(false)
        }
      }
    }

    startStripeCheckout()

    return () => {
      isCancelled = true
    }
  }, [bookingId, paymentCancelled])

  const handleBack = () => {
    navigate(-1)
  }

  const handleDashboard = () => {
    navigate('/student')
  }

  if (paymentCancelled) {
    return (
      <div
        className="min-h-screen px-4 py-10"
        style={{
          background:
            'radial-gradient(circle at top, rgba(245, 158, 11, 0.18), transparent 35%), linear-gradient(180deg, #fff8ef 0%, #fffdf8 100%)',
        }}
      >
        <div className="mx-auto flex min-h-[80vh] max-w-2xl items-center justify-center">
          <div
            className="w-full rounded-3xl border p-8 shadow-xl"
            style={{
              borderColor: 'rgba(251, 191, 36, 0.45)',
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,250,240,0.98) 100%)',
            }}
          >
            <div className="mb-8 flex items-center justify-between gap-4 border-b border-amber-200 pb-6">
              <BrandLogo size={44} wordmarkSize={20} />
              <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
                Checkout cancelled
              </span>
            </div>

            <div className="mb-6 flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#b45309' }}
              >
                <AlertCircle size={26} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-700">
                  Payment cancelled
                </p>
                <h2 className="text-3xl font-extrabold text-slate-900">
                  You left Stripe before paying
                </h2>
              </div>
            </div>

            <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-slate-700">
              <p className="text-base leading-7">
                No charge was taken and your booking was not completed. You can return to the dashboard, or go back and try the payment again when ready.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleDashboard}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <LayoutDashboard size={18} />
                Back to dashboard
              </button>
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-3 font-semibold text-amber-900 transition hover:bg-amber-50"
              >
                <ArrowLeft size={18} />
                Go back
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-xl shadow-md text-center">
        <h2 className="text-3xl font-extrabold text-gray-900">Stripe Checkout</h2>
        {loading && !error && (
          <p className="text-sm text-gray-600">
            Preparing your Stripe payment for £{amount.toFixed(2)}...
          </p>
        )}
        {error && (
          <div className="text-sm text-red-600 space-y-4">
            <p className="inline-flex items-center justify-center gap-2">
              <AlertCircle size={16} />
              {error}
            </p>
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white"
            >
              Go back
            </button>
          </div>
        )}
        {!loading && !error && (
          <div className="text-sm text-gray-600">
            <CheckCircle2 className="mx-auto mb-2" size={24} />
            Redirecting to Stripe...
          </div>
        )}
      </div>
    </div>
  )
}
