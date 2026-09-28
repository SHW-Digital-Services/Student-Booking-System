SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE OR REPLACE FUNCTION "public"."enforce_student_booking_minimum_notice"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  booking_start timestamptz;
begin
  if tg_op = 'UPDATE'
     and new.lesson_date = old.lesson_date
     and new.lesson_time = old.lesson_time then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if new.tutor_id = auth.uid() then
    return new;
  end if;

  if new.student_id = auth.uid() then
    booking_start := (new.lesson_date::timestamp + new.lesson_time);
    if booking_start < (now() + interval '24 hours') then
      raise exception using
        errcode = '23514',
        message = 'Students must book at least 24 hours in advance.';
    end if;
  end if;

  return new;
end;
$$;

ALTER FUNCTION "public"."enforce_student_booking_minimum_notice"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name, role, date_of_birth)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    nullif(new.raw_user_meta_data->>'date_of_birth', '')::date
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."verify_video_room_access"("p_room_token" "text", "p_passcode" "text") RETURNS TABLE("id" "uuid", "student_id" "uuid", "tutor_id" "uuid", "lesson_date" "date", "lesson_time" time without time zone, "video_room_token" "text", "video_provider" "text", "video_room_lobby_enabled" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    b.id, b.student_id, b.tutor_id, b.lesson_date, b.lesson_time,
    b.video_room_token, b.video_provider, b.video_room_lobby_enabled
  from public.bookings b
  where b.video_room_token = p_room_token
    and (b.student_id = auth.uid() or b.tutor_id = auth.uid())
    and b.video_room_passcode = p_passcode
  limit 1;
$$;

ALTER FUNCTION "public"."verify_video_room_access"("p_room_token" "text", "p_passcode" "text") OWNER TO "postgres";

SET default_tablespace = '';
SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "message" "text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "announcements_message_check" CHECK ((("char_length"(TRIM(BOTH FROM "message")) > 0) AND ("char_length"("message") <= 500))),
    CONSTRAINT "announcements_valid_date_range" CHECK ((("ends_at" IS NULL) OR ("ends_at" >= "starts_at")))
);
ALTER TABLE "public"."announcements" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."assignment_resources" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL PRIMARY KEY,
    "assignment_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL
);
ALTER TABLE "public"."assignment_resources" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."assignment_students" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL PRIMARY KEY,
    "assignment_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "assigned_date" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."assignment_students" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."blocked_time_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "tutor_id" "uuid" NOT NULL,
    "start_datetime" timestamp with time zone NOT NULL,
    "end_datetime" timestamp with time zone NOT NULL,
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "blocked_time_slots_check" CHECK (("end_datetime" > "start_datetime"))
);
ALTER TABLE "public"."blocked_time_slots" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "student_id" "uuid" NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "lesson_date" "date" NOT NULL,
    "lesson_time" time without time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "video_room_enabled" boolean DEFAULT false NOT NULL,
    "video_meeting_id" "uuid",
    "video_room_token" "text" DEFAULT "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") NOT NULL,
    "video_provider" "text" DEFAULT 'jitsi'::"text" NOT NULL,
    "video_room_created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "video_room_passcode" "text" DEFAULT "lpad"((("floor"(("random"() * (1000000)::double precision)))::integer)::"text", 6, '0'::"text") NOT NULL,
    "video_room_lobby_enabled" boolean DEFAULT true NOT NULL,
    "lesson_subject_id" "uuid",
    "lesson_subject_name" "text",
    "lesson_price" numeric(10,2),
    CONSTRAINT "bookings_duration_minutes_check" CHECK ((("duration_minutes" > 0) AND ("duration_minutes" <= 480))),
    CONSTRAINT "bookings_lesson_price_check" CHECK ((("lesson_price" IS NULL) OR ("lesson_price" >= (0)::numeric))),
    CONSTRAINT "bookings_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'paid'::"text", 'refunded'::"text"]))),
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'cancelled'::"text", 'completed'::"text"])))
);
ALTER TABLE "public"."bookings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."homework_analytics" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL PRIMARY KEY,
    "tutor_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "assignment_id" "uuid",
    "submitted_count" integer DEFAULT 0,
    "on_time_count" integer DEFAULT 0,
    "late_count" integer DEFAULT 0,
    "average_grade" numeric(5,2),
    "completion_rate" numeric(3,2),
    "last_submission_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."homework_analytics" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."homework_assignments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL PRIMARY KEY,
    "tutor_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text" NOT NULL,
    "category" character varying(50) NOT NULL,
    "due_date" "date" NOT NULL,
    "due_time" time without time zone DEFAULT '23:59:00'::time without time zone,
    "max_score" numeric(5,2),
    "instructions" "text",
    "attachment_url" "text",
    "attachment_name" character varying(255),
    "attachment_size" integer,
    "status" character varying(20) DEFAULT 'active'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "homework_assignments_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'closed'::character varying, 'archived'::character varying])::"text"[])))
);
ALTER TABLE "public"."homework_assignments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."homework_comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL PRIMARY KEY,
    "submission_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "is_tutor_feedback" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."homework_comments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."homework_resources" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL PRIMARY KEY,
    "tutor_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "resource_type" character varying(50) NOT NULL,
    "category" character varying(100),
    "file_url" "text" NOT NULL,
    "file_name" character varying(255) NOT NULL,
    "file_size" integer,
    "access_level" character varying(20) DEFAULT 'private'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "homework_resources_access_level_check" CHECK ((("access_level")::"text" = ANY ((ARRAY['private'::character varying, 'public'::character varying])::"text"[])))
);
ALTER TABLE "public"."homework_resources" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."homework_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "lesson_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "submission_file_url" "text" NOT NULL,
    "submission_file_name" "text" NOT NULL,
    "submission_file_size" bigint DEFAULT 0 NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tutor_feedback" "text",
    "marked_at" timestamp with time zone,
    "marked_by" "uuid",
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assignment_id" "uuid",
    "grade" numeric(5,2),
    "grading_rubric" "jsonb",
    "submission_notes" "text",
    "draft_saved_at" timestamp with time zone,
    "is_draft" boolean DEFAULT false,
    "attempt_number" integer DEFAULT 1,
    CONSTRAINT "homework_submissions_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'marked'::"text", 'resubmitted'::"text"]))),
    CONSTRAINT "homework_submissions_submission_file_size_check" CHECK (("submission_file_size" >= 0))
);
ALTER TABLE "public"."homework_submissions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."lesson_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "lesson_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" bigint DEFAULT 0 NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lesson_activities_file_size_check" CHECK (("file_size" >= 0))
);
ALTER TABLE "public"."lesson_activities" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "student_id" "uuid" NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "lesson_date" "date" NOT NULL,
    "lesson_time" time without time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "title" "text" NOT NULL,
    "covered_in_previous_lesson" "text" DEFAULT ''::"text" NOT NULL,
    "covered_in_current_lesson" "text" DEFAULT ''::"text" NOT NULL,
    "next_lesson_description" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lessons_duration_minutes_check" CHECK ((("duration_minutes" > 0) AND ("duration_minutes" <= 480))),
    CONSTRAINT "lessons_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'completed'::"text", 'cancelled'::"text", 'archived'::"text"])))
);
ALTER TABLE "public"."lessons" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "booking_id" "uuid",
    "student_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "payment_method" "text" DEFAULT 'paypal'::"text" NOT NULL,
    "paypal_transaction_id" "text",
    "paypal_order_id" "text",
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "payment_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_payment_intent_id" "text",
    "tutor_id" "uuid",
    CONSTRAINT "payments_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'refunded'::"text"])))
);
ALTER TABLE "public"."payments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL PRIMARY KEY,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "date_of_birth" "date",
    "phone_number" "text",
    "address" "text",
    "profile_picture_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hourly_rate" numeric(10,2) DEFAULT 30.00,
    "subjects" "text",
    "stripe_customer_id" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['student'::"text", 'tutor'::"text"])))
);
ALTER TABLE "public"."profiles" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_password_reset_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "student_id" "uuid" NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "tutor_name" "text" DEFAULT ''::"text" NOT NULL,
    "tutor_email" "text" DEFAULT ''::"text" NOT NULL,
    "student_email" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_password_reset_requests_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'sent'::"text", 'failed'::"text"])))
);
ALTER TABLE "public"."student_password_reset_requests" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_temporary_passwords" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "student_id" "uuid" NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "password_hash" "text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."student_temporary_passwords" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."system_mail" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "sender_email" "text" DEFAULT ''::"text" NOT NULL,
    "recipient_email" "text" DEFAULT ''::"text" NOT NULL,
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "external_sent" boolean DEFAULT false NOT NULL,
    "external_error" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."system_mail" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "key" "text" NOT NULL PRIMARY KEY,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."system_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."tutor_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "tutor_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "tutor_availability_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "tutor_availability_time_order" CHECK (("end_time" > "start_time"))
);
ALTER TABLE "public"."tutor_availability" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."tutor_subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "tutor_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tutor_subjects_name_not_blank" CHECK (("length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "tutor_subjects_price_check" CHECK (("price" >= (0)::numeric))
);
ALTER TABLE "public"."tutor_subjects" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL PRIMARY KEY,
    "hourly_rate" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."user_profiles" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."video_meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "meeting_id" character varying(50) NOT NULL,
    "passcode" character varying(50) NOT NULL,
    "booking_id" "uuid",
    "tutor_id" "uuid",
    "student_id" "uuid",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "scheduled_start" timestamp with time zone,
    "scheduled_end" timestamp with time zone,
    "actual_start" timestamp with time zone,
    "actual_end" timestamp with time zone,
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "recording_url" "text",
    "is_recorded" boolean DEFAULT true,
    CONSTRAINT "valid_scheduled_times" CHECK ((("scheduled_end" IS NULL) OR ("scheduled_start" IS NULL) OR ("scheduled_start" <= "scheduled_end"))),
    CONSTRAINT "valid_times" CHECK ((("actual_end" IS NULL) OR ("actual_start" IS NULL) OR ("actual_start" <= "actual_end"))),
    CONSTRAINT "video_meetings_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'completed'::character varying, 'cancelled'::character varying])::"text"[])))
);
ALTER TABLE "public"."video_meetings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."video_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "meeting_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_type" character varying(20) NOT NULL,
    "user_name" character varying(255),
    "session_id" character varying(255),
    "joined_at" timestamp with time zone,
    "left_at" timestamp with time zone,
    "is_muted" boolean DEFAULT false,
    "camera_off" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "valid_participant_times" CHECK ((("left_at" IS NULL) OR ("joined_at" IS NULL) OR ("joined_at" <= "left_at"))),
    CONSTRAINT "video_participants_user_type_check" CHECK ((("user_type")::"text" = ANY ((ARRAY['tutor'::character varying, 'student'::character varying])::"text"[])))
);
ALTER TABLE "public"."video_participants" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."video_room_admissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "booking_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."video_room_admissions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."video_room_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "booking_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "event_type" "text" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "video_room_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['joined'::"text", 'left'::"text", 'chat'::"text"])))
);
ALTER TABLE "public"."video_room_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."video_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "booking_id" "uuid" NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "locked" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "video_rooms_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);
ALTER TABLE "public"."video_rooms" OWNER TO "postgres";

CREATE INDEX "announcements_active_dates_idx" ON "public"."announcements" USING "btree" ("starts_at", "ends_at");
CREATE INDEX "blocked_time_slots_start_idx" ON "public"."blocked_time_slots" USING "btree" ("start_datetime");
CREATE INDEX "blocked_time_slots_tutor_id_idx" ON "public"."blocked_time_slots" USING "btree" ("tutor_id");
CREATE INDEX "bookings_lesson_date_idx" ON "public"."bookings" USING "btree" ("lesson_date");
CREATE INDEX "bookings_lesson_subject_id_idx" ON "public"."bookings" USING "btree" ("lesson_subject_id");
CREATE INDEX "bookings_student_id_idx" ON "public"."bookings" USING "btree" ("student_id");
CREATE INDEX "bookings_tutor_id_idx" ON "public"."bookings" USING "btree" ("tutor_id");
CREATE UNIQUE INDEX "bookings_video_room_token_idx" ON "public"."bookings" USING "btree" ("video_room_token");
CREATE INDEX "homework_submissions_lesson_id_idx" ON "public"."homework_submissions" USING "btree" ("lesson_id");
CREATE INDEX "homework_submissions_student_id_idx" ON "public"."homework_submissions" USING "btree" ("student_id");
CREATE INDEX "homework_submissions_submitted_at_idx" ON "public"."homework_submissions" USING "btree" ("submitted_at");
CREATE INDEX "idx_analytics_tutor_student" ON "public"."homework_analytics" USING "btree" ("tutor_id", "student_id");
CREATE INDEX "idx_assignment_students_assignment" ON "public"."assignment_students" USING "btree" ("assignment_id");
CREATE INDEX "idx_assignment_students_student" ON "public"."assignment_students" USING "btree" ("student_id");
CREATE INDEX "idx_assignments_due_date" ON "public"."homework_assignments" USING "btree" ("due_date");
CREATE INDEX "idx_assignments_status" ON "public"."homework_assignments" USING "btree" ("status");
CREATE INDEX "idx_assignments_tutor" ON "public"."homework_assignments" USING "btree" ("tutor_id");
CREATE INDEX "idx_comments_submission" ON "public"."homework_comments" USING "btree" ("submission_id");
CREATE INDEX "idx_resources_tutor" ON "public"."homework_resources" USING "btree" ("tutor_id");
CREATE INDEX "idx_resources_type" ON "public"."homework_resources" USING "btree" ("resource_type");
CREATE INDEX "idx_submissions_assignment" ON "public"."homework_submissions" USING "btree" ("assignment_id");
CREATE INDEX "idx_submissions_draft" ON "public"."homework_submissions" USING "btree" ("is_draft");
CREATE INDEX "idx_user_profiles_id" ON "public"."user_profiles" USING "btree" ("id");
CREATE INDEX "idx_video_meetings_booking_id" ON "public"."video_meetings" USING "btree" ("booking_id");
CREATE INDEX "idx_video_meetings_meeting_id" ON "public"."video_meetings" USING "btree" ("meeting_id");
CREATE INDEX "idx_video_meetings_status" ON "public"."video_meetings" USING "btree" ("status");
CREATE INDEX "idx_video_meetings_student_id" ON "public"."video_meetings" USING "btree" ("student_id");
CREATE INDEX "idx_video_meetings_tutor_id" ON "public"."video_meetings" USING "btree" ("tutor_id");
CREATE INDEX "idx_video_participants_meeting_id" ON "public"."video_participants" USING "btree" ("meeting_id");
CREATE INDEX "idx_video_participants_user_id" ON "public"."video_participants" USING "btree" ("user_id");
CREATE INDEX "lesson_activities_lesson_id_idx" ON "public"."lesson_activities" USING "btree" ("lesson_id");
CREATE INDEX "lesson_activities_uploaded_by_idx" ON "public"."lesson_activities" USING "btree" ("uploaded_by");
CREATE INDEX "lessons_booking_id_idx" ON "public"."lessons" USING "btree" ("booking_id");
CREATE INDEX "lessons_lesson_date_idx" ON "public"."lessons" USING "btree" ("lesson_date");
CREATE INDEX "lessons_student_id_idx" ON "public"."lessons" USING "btree" ("student_id");
CREATE INDEX "lessons_tutor_id_idx" ON "public"."lessons" USING "btree" ("tutor_id");
CREATE INDEX "payments_booking_id_idx" ON "public"."payments" USING "btree" ("booking_id");
CREATE INDEX "payments_payment_date_idx" ON "public"."payments" USING "btree" ("payment_date");
CREATE INDEX "payments_stripe_payment_intent_id_idx" ON "public"."payments" USING "btree" ("stripe_payment_intent_id");
CREATE INDEX "payments_student_id_idx" ON "public"."payments" USING "btree" ("student_id");
CREATE INDEX "payments_tutor_id_idx" ON "public"."payments" USING "btree" ("tutor_id");
CREATE INDEX "profiles_role_idx" ON "public"."profiles" USING "btree" ("role");
CREATE INDEX "student_password_reset_requests_created_at_idx" ON "public"."student_password_reset_requests" USING "btree" ("created_at");
CREATE INDEX "student_password_reset_requests_student_id_idx" ON "public"."student_password_reset_requests" USING "btree" ("student_id");
CREATE INDEX "student_password_reset_requests_tutor_id_idx" ON "public"."student_password_reset_requests" USING "btree" ("tutor_id");
CREATE INDEX "student_temporary_passwords_created_at_idx" ON "public"."student_temporary_passwords" USING "btree" ("created_at");
CREATE INDEX "student_temporary_passwords_student_id_idx" ON "public"."student_temporary_passwords" USING "btree" ("student_id");
CREATE INDEX "student_temporary_passwords_tutor_id_idx" ON "public"."student_temporary_passwords" USING "btree" ("tutor_id");
CREATE INDEX "system_mail_created_at_idx" ON "public"."system_mail" USING "btree" ("created_at");
CREATE INDEX "system_mail_recipient_id_idx" ON "public"."system_mail" USING "btree" ("recipient_id");
CREATE INDEX "system_mail_sender_id_idx" ON "public"."system_mail" USING "btree" ("sender_id");
CREATE INDEX "tutor_availability_tutor_id_idx" ON "public"."tutor_availability" USING "btree" ("tutor_id");
CREATE INDEX "tutor_subjects_active_idx" ON "public"."tutor_subjects" USING "btree" ("is_active");
CREATE INDEX "tutor_subjects_tutor_id_idx" ON "public"."tutor_subjects" USING "btree" ("tutor_id");
CREATE INDEX "video_room_admissions_booking_id_idx" ON "public"."video_room_admissions" USING "btree" ("booking_id");
CREATE INDEX "video_room_admissions_student_id_idx" ON "public"."video_room_admissions" USING "btree" ("student_id");
CREATE INDEX "video_room_events_booking_id_idx" ON "public"."video_room_events" USING "btree" ("booking_id");
CREATE INDEX "video_room_events_created_at_idx" ON "public"."video_room_events" USING "btree" ("created_at");
CREATE INDEX "video_rooms_booking_id_idx" ON "public"."video_rooms" USING "btree" ("booking_id");
CREATE INDEX "video_rooms_status_idx" ON "public"."video_rooms" USING "btree" ("status");
CREATE INDEX "video_rooms_student_id_idx" ON "public"."video_rooms" USING "btree" ("student_id");
CREATE INDEX "video_rooms_tutor_id_idx" ON "public"."video_rooms" USING "btree" ("tutor_id");

CREATE OR REPLACE TRIGGER "trg_announcements_updated_at" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_blocked_time_slots_updated_at" BEFORE UPDATE ON "public"."blocked_time_slots" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_bookings_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_enforce_student_booking_minimum_notice" BEFORE INSERT OR UPDATE OF "lesson_date", "lesson_time" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_student_booking_minimum_notice"();
CREATE OR REPLACE TRIGGER "trg_lessons_updated_at" BEFORE UPDATE ON "public"."lessons" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_student_password_reset_requests_updated_at" BEFORE UPDATE ON "public"."student_password_reset_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_student_temporary_passwords_updated_at" BEFORE UPDATE ON "public"."student_temporary_passwords" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_system_mail_updated_at" BEFORE UPDATE ON "public"."system_mail" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_system_settings_updated_at" BEFORE UPDATE ON "public"."system_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_tutor_availability_updated_at" BEFORE UPDATE ON "public"."tutor_availability" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_tutor_subjects_updated_at" BEFORE UPDATE ON "public"."tutor_subjects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_video_room_admissions_updated_at" BEFORE UPDATE ON "public"."video_room_admissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "trg_video_rooms_updated_at" BEFORE UPDATE ON "public"."video_rooms" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE ONLY "public"."announcements" ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."assignment_resources" ADD CONSTRAINT "assignment_resources_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."homework_assignments"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."assignment_resources" ADD CONSTRAINT "assignment_resources_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."homework_resources"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."assignment_students" ADD CONSTRAINT "assignment_students_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."homework_assignments"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."assignment_students" ADD CONSTRAINT "assignment_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."blocked_time_slots" ADD CONSTRAINT "blocked_time_slots_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."bookings" ADD CONSTRAINT "bookings_lesson_subject_id_fkey" FOREIGN KEY ("lesson_subject_id") REFERENCES "public"."tutor_subjects"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."bookings" ADD CONSTRAINT "bookings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."bookings" ADD CONSTRAINT "bookings_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."bookings" ADD CONSTRAINT "bookings_video_meeting_id_fkey" FOREIGN KEY ("video_meeting_id") REFERENCES "public"."video_meetings"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."homework_analytics" ADD CONSTRAINT "homework_analytics_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."homework_assignments"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."homework_analytics" ADD CONSTRAINT "homework_analytics_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."homework_analytics" ADD CONSTRAINT "homework_analytics_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."homework_assignments" ADD CONSTRAINT "homework_assignments_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."homework_comments" ADD CONSTRAINT "homework_comments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."homework_submissions"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."homework_comments" ADD CONSTRAINT "homework_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."homework_resources" ADD CONSTRAINT "homework_resources_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."homework_submissions" ADD CONSTRAINT "homework_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."homework_assignments"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."homework_submissions" ADD CONSTRAINT "homework_submissions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."homework_submissions" ADD CONSTRAINT "homework_submissions_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."homework_submissions" ADD CONSTRAINT "homework_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lesson_activities" ADD CONSTRAINT "lesson_activities_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lesson_activities" ADD CONSTRAINT "lesson_activities_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lessons" ADD CONSTRAINT "lessons_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lessons" ADD CONSTRAINT "lessons_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lessons" ADD CONSTRAINT "lessons_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."payments" ADD CONSTRAINT "payments_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_password_reset_requests" ADD CONSTRAINT "student_password_reset_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_password_reset_requests" ADD CONSTRAINT "student_password_reset_requests_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_temporary_passwords" ADD CONSTRAINT "student_temporary_passwords_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_temporary_passwords" ADD CONSTRAINT "student_temporary_passwords_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."system_mail" ADD CONSTRAINT "system_mail_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."system_mail" ADD CONSTRAINT "system_mail_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."tutor_availability" ADD CONSTRAINT "tutor_availability_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."tutor_subjects" ADD CONSTRAINT "tutor_subjects_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_profiles" ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."video_meetings" ADD CONSTRAINT "video_meetings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."video_meetings" ADD CONSTRAINT "video_meetings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."video_meetings" ADD CONSTRAINT "video_meetings_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."video_participants" ADD CONSTRAINT "video_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."video_meetings"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."video_participants" ADD CONSTRAINT "video_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."video_room_admissions" ADD CONSTRAINT "video_room_admissions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."video_room_admissions" ADD CONSTRAINT "video_room_admissions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."video_room_admissions" ADD CONSTRAINT "video_room_admissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."video_room_events" ADD CONSTRAINT "video_room_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."video_room_events" ADD CONSTRAINT "video_room_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."video_rooms" ADD CONSTRAINT "video_rooms_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."video_rooms" ADD CONSTRAINT "video_rooms_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."video_rooms" ADD CONSTRAINT "video_rooms_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

CREATE POLICY "Anyone can view active availability" ON "public"."tutor_availability" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) AND ("is_available" = true)));
CREATE POLICY "Enable read access for all users" ON "public"."system_settings" FOR SELECT USING (true);
CREATE POLICY "Enable update for tutors" ON "public"."system_settings" FOR UPDATE USING ((EXISTS ( SELECT 1 FROM "public"."profiles" WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'tutor'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."profiles" WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'tutor'::"text")))));
CREATE POLICY "Members can view video rooms" ON "public"."video_rooms" FOR SELECT USING ((("auth"."uid"() = "tutor_id") OR ("auth"."uid"() = "student_id")));
CREATE POLICY "Students can view assigned assignments" ON "public"."homework_assignments" FOR SELECT USING ((EXISTS ( SELECT 1 FROM "public"."assignment_students" WHERE (("assignment_students"."assignment_id" = "homework_assignments"."id") AND ("assignment_students"."student_id" = "auth"."uid"())))));
CREATE POLICY "Students can view resources" ON "public"."homework_resources" FOR SELECT USING (((("access_level")::"text" = 'public'::"text") OR ("tutor_id" = "auth"."uid"())));
CREATE POLICY "Students can view their analytics" ON "public"."homework_analytics" FOR SELECT USING (("student_id" = "auth"."uid"()));
CREATE POLICY "Students can view their assignments" ON "public"."assignment_students" FOR SELECT USING (("student_id" = "auth"."uid"()));
CREATE POLICY "Students can view tutor user_profiles" ON "public"."user_profiles" FOR SELECT USING ((EXISTS ( SELECT 1 FROM "public"."profiles" WHERE (("profiles"."id" = "user_profiles"."id") AND ("profiles"."role" = 'tutor'::"text")))));
CREATE POLICY "Tutor can create video room" ON "public"."video_rooms" FOR INSERT WITH CHECK (("auth"."uid"() = "tutor_id"));
CREATE POLICY "Tutor can delete video room" ON "public"."video_rooms" FOR DELETE USING (("auth"."uid"() = "tutor_id"));
CREATE POLICY "Tutor can manage own availability" ON "public"."tutor_availability" TO "authenticated" USING (("auth"."uid"() = "tutor_id")) WITH CHECK (("auth"."uid"() = "tutor_id"));
CREATE POLICY "Tutor can update video room" ON "public"."video_rooms" FOR UPDATE USING (("auth"."uid"() = "tutor_id")) WITH CHECK (("auth"."uid"() = "tutor_id"));
CREATE POLICY "Tutors can add participants" ON "public"."video_participants" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."video_meetings" "vm" WHERE (("vm"."id" = ("vm"."meeting_id")::"uuid") AND ("auth"."uid"() = "vm"."tutor_id")))));
CREATE POLICY "Tutors can create video meetings" ON "public"."video_meetings" FOR INSERT WITH CHECK (("auth"."uid"() = "tutor_id"));
CREATE POLICY "Tutors can manage student assignments" ON "public"."assignment_students" USING ((EXISTS ( SELECT 1 FROM "public"."homework_assignments" WHERE (("homework_assignments"."id" = "assignment_students"."assignment_id") AND ("homework_assignments"."tutor_id" = "auth"."uid"())))));
CREATE POLICY "Tutors can manage their assignments" ON "public"."homework_assignments" USING (("tutor_id" = "auth"."uid"()));
CREATE POLICY "Tutors can manage their resources" ON "public"."homework_resources" USING (("tutor_id" = "auth"."uid"()));
CREATE POLICY "Tutors can update participants" ON "public"."video_participants" FOR UPDATE USING ((EXISTS ( SELECT 1 FROM "public"."video_meetings" "vm" WHERE (("vm"."id" = ("vm"."meeting_id")::"uuid") AND ("auth"."uid"() = "vm"."tutor_id"))))) WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."video_meetings" "vm" WHERE (("vm"."id" = ("vm"."meeting_id")::"uuid") AND ("auth"."uid"() = "vm"."tutor_id")))));
CREATE POLICY "Tutors can update their video meetings" ON "public"."video_meetings" FOR UPDATE USING (("auth"."uid"() = "tutor_id")) WITH CHECK (("auth"."uid"() = "tutor_id"));
CREATE POLICY "Tutors can view their analytics" ON "public"."homework_analytics" FOR SELECT USING (("tutor_id" = "auth"."uid"()));
CREATE POLICY "Users can create comments" ON "public"."homework_comments" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));
CREATE POLICY "Users can insert own user_profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));
CREATE POLICY "Users can update own user_profile" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));
CREATE POLICY "Users can view comments on submissions they have access to" ON "public"."homework_comments" FOR SELECT USING ((EXISTS ( SELECT 1 FROM "public"."homework_submissions" WHERE (("homework_submissions"."id" = "homework_comments"."submission_id") AND (("homework_submissions"."student_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1 FROM "public"."lessons" WHERE (("lessons"."id" = "homework_submissions"."lesson_id") AND ("lessons"."tutor_id" = "auth"."uid"())))))))));
CREATE POLICY "Users can view meeting participants" ON "public"."video_participants" FOR SELECT USING ((EXISTS ( SELECT 1 FROM "public"."video_meetings" "vm" WHERE (("vm"."id" = "video_participants"."meeting_id") AND (("auth"."uid"() = "vm"."tutor_id") OR ("auth"."uid"() = "vm"."student_id"))))));
CREATE POLICY "Users can view own user_profile" ON "public"."user_profiles" FOR SELECT USING (("auth"."uid"() = "id"));
CREATE POLICY "Users can view their own video meetings" ON "public"."video_meetings" FOR SELECT USING ((("auth"."uid"() = "tutor_id") OR ("auth"."uid"() = "student_id")));

ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements_manage_tutors" ON "public"."announcements" TO "authenticated" USING ((EXISTS ( SELECT 1 FROM "public"."profiles" WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'tutor'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."profiles" WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'tutor'::"text")))));
CREATE POLICY "announcements_select_authenticated" ON "public"."announcements" FOR SELECT TO "authenticated" USING (true);
ALTER TABLE "public"."assignment_resources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assignment_students" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "availability_select_authenticated" ON "public"."tutor_availability" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "availability_upsert_tutor_only" ON "public"."tutor_availability" TO "authenticated" USING (("tutor_id" = "auth"."uid"())) WITH CHECK (("tutor_id" = "auth"."uid"()));
CREATE POLICY "blocked_slots_manage_tutor_only" ON "public"."blocked_time_slots" TO "authenticated" USING (("tutor_id" = "auth"."uid"())) WITH CHECK (("tutor_id" = "auth"."uid"()));
CREATE POLICY "blocked_slots_select_authenticated" ON "public"."blocked_time_slots" FOR SELECT TO "authenticated" USING (true);
ALTER TABLE "public"."blocked_time_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings_insert_student_or_tutor" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK ((("student_id" = "auth"."uid"()) OR ("tutor_id" = "auth"."uid"())));
CREATE POLICY "bookings_select_own_student_or_tutor" ON "public"."bookings" FOR SELECT TO "authenticated" USING ((("student_id" = "auth"."uid"()) OR ("tutor_id" = "auth"."uid"())));
CREATE POLICY "bookings_update_student_or_tutor" ON "public"."bookings" FOR UPDATE TO "authenticated" USING ((("student_id" = "auth"."uid"()) OR ("tutor_id" = "auth"."uid"()))) WITH CHECK ((("student_id" = "auth"."uid"()) OR ("tutor_id" = "auth"."uid"())));
ALTER TABLE "public"."homework_analytics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."homework_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."homework_comments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "homework_insert_student_only" ON "public"."homework_submissions" FOR INSERT TO "authenticated" WITH CHECK (("student_id" = "auth"."uid"()));
ALTER TABLE "public"."homework_resources" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "homework_select_student_or_tutor_of_lesson" ON "public"."homework_submissions" FOR SELECT TO "authenticated" USING ((("student_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1 FROM "public"."lessons" "l" WHERE (("l"."id" = "homework_submissions"."lesson_id") AND ("l"."tutor_id" = "auth"."uid"()))))));
ALTER TABLE "public"."homework_submissions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "homework_update_tutor_only" ON "public"."homework_submissions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM "public"."lessons" "l" WHERE (("l"."id" = "homework_submissions"."lesson_id") AND ("l"."tutor_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."lessons" "l" WHERE (("l"."id" = "homework_submissions"."lesson_id") AND ("l"."tutor_id" = "auth"."uid"())))));
ALTER TABLE "public"."lesson_activities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lesson_activities_delete_tutor_only" ON "public"."lesson_activities" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM "public"."lessons" "l" WHERE (("l"."id" = "lesson_activities"."lesson_id") AND ("l"."tutor_id" = "auth"."uid"())))));
CREATE POLICY "lesson_activities_insert_tutor_only" ON "public"."lesson_activities" FOR INSERT TO "authenticated" WITH CHECK ((("uploaded_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1 FROM "public"."lessons" "l" WHERE (("l"."id" = "lesson_activities"."lesson_id") AND ("l"."tutor_id" = "auth"."uid"()))))));
CREATE POLICY "lesson_activities_select_if_in_lesson" ON "public"."lesson_activities" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1 FROM "public"."lessons" "l" WHERE (("l"."id" = "lesson_activities"."lesson_id") AND (("l"."student_id" = "auth"."uid"()) OR ("l"."tutor_id" = "auth"."uid"()))))));
ALTER TABLE "public"."lessons" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons_delete_tutor_only" ON "public"."lessons" FOR DELETE TO "authenticated" USING (("tutor_id" = "auth"."uid"()));
CREATE POLICY "lessons_insert_tutor_only" ON "public"."lessons" FOR INSERT TO "authenticated" WITH CHECK (("tutor_id" = "auth"."uid"()));
CREATE POLICY "lessons_select_own_student_or_tutor" ON "public"."lessons" FOR SELECT TO "authenticated" USING ((("student_id" = "auth"."uid"()) OR ("tutor_id" = "auth"."uid"())));
CREATE POLICY "lessons_update_tutor_only" ON "public"."lessons" FOR UPDATE TO "authenticated" USING (("tutor_id" = "auth"."uid"())) WITH CHECK (("tutor_id" = "auth"."uid"()));
ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_delete_tutor_or_owner" ON "public"."payments" FOR DELETE TO "authenticated" USING ((("tutor_id" = "auth"."uid"()) OR ("student_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1 FROM "public"."bookings" "b" WHERE (("b"."id" = "payments"."booking_id") AND ("b"."tutor_id" = "auth"."uid"()))))));
CREATE POLICY "payments_insert_student_or_tutor_for_booking" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK ((("student_id" = "auth"."uid"()) OR ("tutor_id" = "auth"."uid"()) OR (("booking_id" IS NOT NULL) AND (EXISTS ( SELECT 1 FROM "public"."bookings" "b" WHERE (("b"."id" = "payments"."booking_id") AND ("b"."tutor_id" = "auth"."uid"())))))));
CREATE POLICY "payments_select_own" ON "public"."payments" FOR SELECT TO "authenticated" USING ((("student_id" = "auth"."uid"()) OR ("tutor_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1 FROM "public"."bookings" "b" WHERE (("b"."id" = "payments"."booking_id") AND ("b"."tutor_id" = "auth"."uid"()))))));
CREATE POLICY "payments_update_none" ON "public"."payments" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));
CREATE POLICY "profiles_owner" ON "public"."user_profiles" TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));
CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));
ALTER TABLE "public"."student_password_reset_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student_password_reset_requests_select_participants" ON "public"."student_password_reset_requests" FOR SELECT TO "authenticated" USING ((("student_id" = "auth"."uid"()) OR ("tutor_id" = "auth"."uid"())));
ALTER TABLE "public"."student_temporary_passwords" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student_temporary_passwords_insert_tutor_only" ON "public"."student_temporary_passwords" FOR INSERT TO "authenticated" WITH CHECK (("tutor_id" = "auth"."uid"()));
CREATE POLICY "student_temporary_passwords_select_participants" ON "public"."student_temporary_passwords" FOR SELECT TO "authenticated" USING ((("student_id" = "auth"."uid"()) OR ("tutor_id" = "auth"."uid"())));
CREATE POLICY "student_temporary_passwords_update_tutor_only" ON "public"."student_temporary_passwords" FOR UPDATE TO "authenticated" USING (("tutor_id" = "auth"."uid"())) WITH CHECK (("tutor_id" = "auth"."uid"()));
ALTER TABLE "public"."system_mail" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_mail_insert_sender_only" ON "public"."system_mail" FOR INSERT TO "authenticated" WITH CHECK (("sender_id" = "auth"."uid"()));
CREATE POLICY "system_mail_select_participants" ON "public"."system_mail" FOR SELECT TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("recipient_id" = "auth"."uid"())));
CREATE POLICY "system_mail_update_recipient_or_sender" ON "public"."system_mail" FOR UPDATE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("recipient_id" = "auth"."uid"()))) WITH CHECK ((("sender_id" = "auth"."uid"()) OR ("recipient_id" = "auth"."uid"())));
ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_settings_manage_tutors" ON "public"."system_settings" TO "authenticated" USING ((EXISTS ( SELECT 1 FROM "public"."profiles" WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'tutor'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."profiles" WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'tutor'::"text")))));
CREATE POLICY "system_settings_select_authenticated" ON "public"."system_settings" FOR SELECT TO "authenticated" USING (true);
ALTER TABLE "public"."tutor_availability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tutor_subjects" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tutor_subjects_delete_tutor_only" ON "public"."tutor_subjects" FOR DELETE TO "authenticated" USING (("tutor_id" = "auth"."uid"()));
CREATE POLICY "tutor_subjects_insert_tutor_only" ON "public"."tutor_subjects" FOR INSERT TO "authenticated" WITH CHECK (("tutor_id" = "auth"."uid"()));
CREATE POLICY "tutor_subjects_select_authenticated" ON "public"."tutor_subjects" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "tutor_subjects_update_tutor_only" ON "public"."tutor_subjects" FOR UPDATE TO "authenticated" USING (("tutor_id" = "auth"."uid"())) WITH CHECK (("tutor_id" = "auth"."uid"()));
CREATE POLICY "tutors_update_students" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1 FROM "public"."profiles" "profiles_1" WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."role" = 'tutor'::"text")))) AND ("role" = 'student'::"text"))) WITH CHECK (("role" = 'student'::"text"));
ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "video_admissions_insert_student" ON "public"."video_room_admissions" FOR INSERT TO "authenticated" WITH CHECK ((("student_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1 FROM "public"."bookings" "b" WHERE (("b"."id" = "video_room_admissions"."booking_id") AND ("b"."student_id" = "auth"."uid"()))))));
CREATE POLICY "video_admissions_select_participants" ON "public"."video_room_admissions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1 FROM "public"."bookings" "b" WHERE (("b"."id" = "video_room_admissions"."booking_id") AND (("b"."student_id" = "auth"."uid"()) OR ("b"."tutor_id" = "auth"."uid"()))))));
CREATE POLICY "video_admissions_update_tutor" ON "public"."video_room_admissions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM "public"."bookings" "b" WHERE (("b"."id" = "video_room_admissions"."booking_id") AND ("b"."tutor_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."bookings" "b" WHERE (("b"."id" = "video_room_admissions"."booking_id") AND ("b"."tutor_id" = "auth"."uid"())))));
CREATE POLICY "video_events_insert_own_participant" ON "public"."video_room_events" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1 FROM "public"."bookings" "b" WHERE (("b"."id" = "video_room_events"."booking_id") AND (("b"."student_id" = "auth"."uid"()) OR ("b"."tutor_id" = "auth"."uid"())))))));
CREATE POLICY "video_events_select_participants" ON "public"."video_room_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1 FROM "public"."bookings" "b" WHERE (("b"."id" = "video_room_events"."booking_id") AND (("b"."student_id" = "auth"."uid"()) OR ("b"."tutor_id" = "auth"."uid"()))))));
ALTER TABLE "public"."video_meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."video_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."video_room_admissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."video_room_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."video_rooms" ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."announcements";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bookings";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."payments";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."system_settings";

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."enforce_student_booking_minimum_notice"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_student_booking_minimum_notice"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_student_booking_minimum_notice"() TO "service_role";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."verify_video_room_access"("p_room_token" "text", "p_passcode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_video_room_access"("p_room_token" "text", "p_passcode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_video_room_access"("p_room_token" "text", "p_passcode" "text") TO "service_role";

GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";

GRANT ALL ON TABLE "public"."assignment_resources" TO "anon";
GRANT ALL ON TABLE "public"."assignment_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_resources" TO "service_role";

GRANT ALL ON TABLE "public"."assignment_students" TO "anon";
GRANT ALL ON TABLE "public"."assignment_students" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_students" TO "service_role";

GRANT ALL ON TABLE "public"."blocked_time_slots" TO "anon";
GRANT ALL ON TABLE "public"."blocked_time_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."blocked_time_slots" TO "service_role";

GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";

GRANT ALL ON TABLE "public"."homework_analytics" TO "anon";
GRANT ALL ON TABLE "public"."homework_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."homework_analytics" TO "service_role";

GRANT ALL ON TABLE "public"."homework_assignments" TO "anon";
GRANT ALL ON TABLE "public"."homework_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."homework_assignments" TO "service_role";

GRANT ALL ON TABLE "public"."homework_comments" TO "anon";
GRANT ALL ON TABLE "public"."homework_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."homework_comments" TO "service_role";

GRANT ALL ON TABLE "public"."homework_resources" TO "anon";
GRANT ALL ON TABLE "public"."homework_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."homework_resources" TO "service_role";

GRANT ALL ON TABLE "public"."homework_submissions" TO "anon";
GRANT ALL ON TABLE "public"."homework_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."homework_submissions" TO "service_role";

GRANT ALL ON TABLE "public"."lesson_activities" TO "anon";
GRANT ALL ON TABLE "public"."lesson_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_activities" TO "service_role";

GRANT ALL ON TABLE "public"."lessons" TO "anon";
GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";

GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";

GRANT ALL ON TABLE "public"."student_password_reset_requests" TO "anon";
GRANT ALL ON TABLE "public"."student_password_reset_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."student_password_reset_requests" TO "service_role";

GRANT ALL ON TABLE "public"."student_temporary_passwords" TO "anon";
GRANT ALL ON TABLE "public"."student_temporary_passwords" TO "authenticated";
GRANT ALL ON TABLE "public"."student_temporary_passwords" TO "service_role";

GRANT ALL ON TABLE "public"."system_mail" TO "anon";
GRANT ALL ON TABLE "public"."system_mail" TO "authenticated";
GRANT ALL ON TABLE "public"."system_mail" TO "service_role";

GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";

GRANT ALL ON TABLE "public"."tutor_availability" TO "anon";
GRANT ALL ON TABLE "public"."tutor_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."tutor_availability" TO "service_role";

GRANT ALL ON TABLE "public"."tutor_subjects" TO "anon";
GRANT ALL ON TABLE "public"."tutor_subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."tutor_subjects" TO "service_role";

GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";

GRANT ALL ON TABLE "public"."video_meetings" TO "anon";
GRANT ALL ON TABLE "public"."video_meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."video_meetings" TO "service_role";

GRANT ALL ON TABLE "public"."video_participants" TO "anon";
GRANT ALL ON TABLE "public"."video_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."video_participants" TO "service_role";

GRANT ALL ON TABLE "public"."video_room_admissions" TO "anon";
GRANT ALL ON TABLE "public"."video_room_admissions" TO "authenticated";
GRANT ALL ON TABLE "public"."video_room_admissions" TO "service_role";

GRANT ALL ON TABLE "public"."video_room_events" TO "anon";
GRANT ALL ON TABLE "public"."video_room_events" TO "authenticated";
GRANT ALL ON TABLE "public"."video_room_events" TO "service_role";

GRANT ALL ON TABLE "public"."video_rooms" TO "anon";
GRANT ALL ON TABLE "public"."video_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."video_rooms" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";