import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  MIN_BOOKING_NOTICE_HOURS,
  createBooking,
  getBlockedTimeSlots,
  isBookingAtLeast24HoursAway,
} from "../../lib/bookingAPI";
import { getTutorAvailability } from "../../lib/availabilityAPI";
import { getTutorHourlyRate, getProfile } from "../../lib/profileAPI";
import { getTutorSubjects } from "../../lib/tutorSubjectsAPI";
import { supabase } from "../../lib/supabaseClient";
import { useParams } from "react-router-dom";

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatBookingDeadline(date) {
  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function BookingForm() {
  const { tutorId } = useParams();
  const { user } = useAuth();

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [availability, setAvailability] = useState([]);
  const [blockedSlots, setBlockedSlots] = useState([]);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hourlyRate, setHourlyRate] = useState(30.0);
  const [lessonSubjects, setLessonSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [tutorName, setTutorName] = useState("");

  const minBookingDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return formatDateForInput(date);
  }, []);

  const bookingDeadline = useMemo(() => {
    return new Date(Date.now() + MIN_BOOKING_NOTICE_HOURS * 60 * 60 * 1000);
  }, []);

  const loadTutorInfo = useCallback(async () => {
    const { data: profile } = await getProfile(tutorId);
    if (profile) setTutorName(profile.full_name);

    const { data: rateData } = await getTutorHourlyRate(tutorId);
    if (rateData?.hourly_rate) setHourlyRate(rateData.hourly_rate);

    const { data: subjectData } = await getTutorSubjects(tutorId, { activeOnly: true });
    setLessonSubjects(subjectData || []);
    if (subjectData?.length === 1) {
      setSelectedSubjectId(subjectData[0].id);
    }
  }, [tutorId]);

  const loadAvailability = useCallback(async () => {
    const { data, error } = await getTutorAvailability(tutorId);
    if (!error && data) setAvailability(data);
  }, [tutorId]);

  useEffect(() => {
    if (tutorId) {
      loadAvailability();
      loadTutorInfo();
    }
  }, [tutorId, loadAvailability, loadTutorInfo]);

  const selectedDayOfWeek = useMemo(() => {
    if (!selectedDate) return null;
    return new Date(`${selectedDate}T00:00:00`).getDay();
  }, [selectedDate]);

  useEffect(() => {
    if (!selectedDate || !tutorId) return;
    const startDate = new Date(`${selectedDate}T00:00:00`);
    const endDate = new Date(`${selectedDate}T23:59:59`);

    getBlockedTimeSlots(tutorId, startDate.toISOString(), endDate.toISOString())
      .then(({ data }) => setBlockedSlots(data || []))
      .catch(() => setBlockedSlots([]));
  }, [selectedDate, tutorId]);

  useEffect(() => {
    if (!selectedDate || selectedDayOfWeek === null) {
      setAvailableTimes([]);
      return;
    }

    const dayAvailability = availability.filter(
      (slot) => slot.is_available && slot.day_of_week === selectedDayOfWeek,
    );
    if (dayAvailability.length === 0) {
      setAvailableTimes([]);
      return;
    }

    const toMinutes = (time) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };

    const toTimeString = (minutes) => {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };

    const blockedRanges = blockedSlots.map((slot) => ({
      start: new Date(slot.start_datetime).getTime(),
      end: new Date(slot.end_datetime).getTime(),
    }));

    const durationMinutes = 60;
    const dayStart = new Date(`${selectedDate}T00:00:00`).getTime();
    const minimumAllowedStart = Date.now() + MIN_BOOKING_NOTICE_HOURS * 60 * 60 * 1000;
    const times = [];

    for (const slot of dayAvailability) {
      const startMinutes = toMinutes(slot.start_time);
      const endMinutes = toMinutes(slot.end_time);

      for (
        let t = startMinutes;
        t + durationMinutes <= endMinutes;
        t += durationMinutes
      ) {
        const timeStr = toTimeString(t);
        const slotStart = dayStart + t * 60 * 1000;
        const slotEnd = slotStart + durationMinutes * 60 * 1000;

        if (slotStart < minimumAllowedStart) continue;

        const overlapsBlocked = blockedRanges.some(
          (b) => slotStart < b.end && slotEnd > b.start,
        );
        if (!overlapsBlocked) times.push(timeStr);
      }
    }
    setAvailableTimes(times);
  }, [availability, blockedSlots, selectedDate, selectedDayOfWeek]);

  useEffect(() => {
    if (selectedTime && !availableTimes.includes(selectedTime)) {
      setSelectedTime("");
    }
  }, [availableTimes, selectedTime]);

  const selectedSubject = useMemo(() => {
    return lessonSubjects.find((subject) => subject.id === selectedSubjectId) || null;
  }, [lessonSubjects, selectedSubjectId]);

  const lessonPrice = selectedSubject ? Number(selectedSubject.price) : Number(hourlyRate);

  const handlePay = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const leadTimeCheck = isBookingAtLeast24HoursAway(selectedDate, selectedTime);
      if (!leadTimeCheck.valid) {
        throw new Error(leadTimeCheck.message);
      }

      if (lessonSubjects.length > 0 && !selectedSubject) {
        throw new Error("Please choose a lesson subject.");
      }

      const { data: booking, error: bookingError } = await createBooking({
        studentId: user.id,
        tutorId: tutorId,
        lessonDate: selectedDate,
        lessonTime: selectedTime,
        duration: 60,
        lessonSubjectId: selectedSubject?.id || null,
        lessonSubjectName: selectedSubject?.name || null,
        lessonPrice,
        createdByRole: "student",
      });

      if (bookingError) throw bookingError;

      const { data, error: paymentError } = await supabase.functions.invoke(
        "stripe-init",
        {
          body: {
            amount: lessonPrice,
            bookingId: booking.id,
            studentId: user.id,
            email: user.email,
          },
        },
      );

      if (paymentError) {
        throw new Error(paymentError.message || "Failed to initialize Stripe checkout");
      }

      if (!data?.checkout_url) {
        throw new Error("Failed to initialize Stripe checkout");
      }

      window.location.href = data.checkout_url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="booking-form-container">
      <h2>Book a Lesson with {tutorName}</h2>
      <p className="tutor-rate">
        Lesson price: GBP {Number(lessonPrice || 0).toFixed(2)}
      </p>
      <p className="booking-notice">
        Student bookings must be made at least 24 hours in advance. Earliest allowed start:{" "}
        {formatBookingDeadline(bookingDeadline)}.
      </p>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handlePay} className="booking-form">
        <div className="form-group">
          <label htmlFor="subject">Select Subject:</label>
          {lessonSubjects.length > 0 ? (
            <select
              id="subject"
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              required
              className="form-input"
            >
              <option value="">Choose a subject...</option>
              {lessonSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name} - GBP {Number(subject.price).toFixed(2)}
                </option>
              ))}
            </select>
          ) : (
            <div className="subject-fallback">General Tuition - GBP {Number(hourlyRate).toFixed(2)}</div>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="date">Select Date:</label>
          <input
            type="date"
            id="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            min={minBookingDate}
            required
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label htmlFor="time">Select Time:</label>
          <select
            id="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            required
            disabled={!selectedDate || availableTimes.length === 0}
            className="form-input"
          >
            <option value="">Choose a time...</option>
            {availableTimes.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
          {selectedDate && availableTimes.length === 0 && (
            <p className="helper-text">
              No times are available for this date once the 24-hour booking window is applied.
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || !selectedTime || !selectedDate || (lessonSubjects.length > 0 && !selectedSubject)}
          className="btn-primary"
        >
          {loading ? "Redirecting..." : "Continue to Stripe checkout"}
        </button>
      </form>

      <style jsx>{`
        .booking-form-container {
          max-width: 600px;
          margin: 0 auto;
          padding: 2rem;
        }
        .booking-form {
          background: #1a1a1a;
          border: 2px solid #3a3a3a;
          border-radius: 12px;
          padding: 2rem;
        }
        .form-group {
          margin-bottom: 1.5rem;
        }
        .form-group label {
          display: block;
          color: #ffffff;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }
        .form-input {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid #3a3a3a;
          border-radius: 6px;
          background-color: #1a1a1a;
          color: #ffffff;
        }
        .btn-primary {
          width: 100%;
          padding: 1rem;
          background-color: #7c3aed;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        .tutor-rate {
          color: #ffffff;
          margin-bottom: 1.5rem;
        }
        .subject-fallback {
          padding: 0.75rem;
          border: 2px solid #3a3a3a;
          border-radius: 6px;
          background-color: #111827;
          color: #ffffff;
        }
        .booking-notice {
          color: #cbd5e1;
          margin: 0 0 1rem 0;
          line-height: 1.5;
        }
        .error {
          background-color: #7f1d1d;
          color: #fecaca;
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1.5rem;
        }
        .helper-text {
          color: #cbd5e1;
          font-size: 0.9rem;
          margin: 0.5rem 0 0;
        }
      `}</style>
    </div>
  );
}

export default BookingForm;
