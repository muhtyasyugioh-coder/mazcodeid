-- ============================================================================
-- MAZCODEID SMART CBT – SUPABASE POSTGRESQL SCHEMA & INITIAL MASTER DATA
-- Jalankan script ini di Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

-- 0. website_settings
CREATE TABLE IF NOT EXISTS public.website_settings (
  id SERIAL PRIMARY KEY,
  site_name TEXT NOT NULL,
  university_name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  description TEXT NOT NULL,
  logo_text TEXT NOT NULL,
  logo_image_url TEXT,
  hero_image_url TEXT NOT NULL,
  contact_email TEXT,
  footer_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 1. roles
CREATE TABLE IF NOT EXISTS public.roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. users
CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  role_name TEXT NOT NULL,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. faculties
CREATE TABLE IF NOT EXISTS public.faculties (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  dean_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. study_programs
CREATE TABLE IF NOT EXISTS public.study_programs (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  degree TEXT NOT NULL,
  faculty_id INTEGER REFERENCES public.faculties(id) ON DELETE SET NULL,
  head_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. classes
CREATE TABLE IF NOT EXISTS public.classes (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  semester INTEGER NOT NULL,
  academic_year TEXT NOT NULL,
  study_program_id INTEGER REFERENCES public.study_programs(id) ON DELETE SET NULL,
  capacity INTEGER NOT NULL DEFAULT 40,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. lecturers
CREATE TABLE IF NOT EXISTS public.lecturers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nidn TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  faculty_id INTEGER REFERENCES public.faculties(id) ON DELETE SET NULL,
  study_program_id INTEGER REFERENCES public.study_programs(id) ON DELETE SET NULL,
  specialization TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. students
CREATE TABLE IF NOT EXISTS public.students (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nim TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  faculty_id INTEGER REFERENCES public.faculties(id) ON DELETE SET NULL,
  study_program_id INTEGER REFERENCES public.study_programs(id) ON DELETE SET NULL,
  class_id INTEGER REFERENCES public.classes(id) ON DELETE SET NULL,
  semester INTEGER NOT NULL DEFAULT 1,
  enrollment_year INTEGER NOT NULL DEFAULT 2026,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 8. courses
CREATE TABLE IF NOT EXISTS public.courses (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sks INTEGER NOT NULL,
  semester INTEGER NOT NULL,
  study_program_id INTEGER REFERENCES public.study_programs(id) ON DELETE SET NULL,
  lecturer_id INTEGER REFERENCES public.lecturers(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 9. exams
CREATE TABLE IF NOT EXISTS public.exams (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  course_id INTEGER REFERENCES public.courses(id) ON DELETE CASCADE,
  lecturer_id INTEGER REFERENCES public.lecturers(id) ON DELETE SET NULL,
  class_id INTEGER REFERENCES public.classes(id) ON DELETE SET NULL,
  exam_type TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  total_questions INTEGER NOT NULL,
  passing_grade INTEGER NOT NULL DEFAULT 70,
  randomize_questions BOOLEAN NOT NULL DEFAULT TRUE,
  randomize_options BOOLEAN NOT NULL DEFAULT TRUE,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  require_camera BOOLEAN NOT NULL DEFAULT TRUE,
  require_fullscreen BOOLEAN NOT NULL DEFAULT TRUE,
  snapshot_count INTEGER NOT NULL DEFAULT 3,
  max_violations INTEGER NOT NULL DEFAULT 3,
  violation_action TEXT NOT NULL DEFAULT 'warn_and_flag',
  status TEXT NOT NULL DEFAULT 'Berlangsung',
  results_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 10. exam_questions
CREATE TABLE IF NOT EXISTS public.exam_questions (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES public.courses(id) ON DELETE SET NULL,
  exam_id INTEGER REFERENCES public.exams(id) ON DELETE SET NULL,
  question_type TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'Sedang',
  question_text TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'none',
  media_content TEXT,
  weight INTEGER NOT NULL DEFAULT 10,
  correct_answer_key TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 11. question_options
CREATE TABLE IF NOT EXISTS public.question_options (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  option_label TEXT NOT NULL,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE
);

-- 12. exam_sessions
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Sedang Ujian',
  camera_status TEXT NOT NULL DEFAULT 'Aktif',
  connection_status TEXT NOT NULL DEFAULT 'Online',
  fullscreen_status BOOLEAN NOT NULL DEFAULT TRUE,
  snapshot1_status TEXT NOT NULL DEFAULT 'Belum Diambil',
  snapshot2_status TEXT NOT NULL DEFAULT 'Belum Diambil',
  snapshot3_status TEXT NOT NULL DEFAULT 'Belum Diambil',
  violation_count INTEGER NOT NULL DEFAULT 0,
  warning_level INTEGER NOT NULL DEFAULT 0,
  remaining_seconds INTEGER NOT NULL,
  question_order_json TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP,
  last_active_at TIMESTAMP DEFAULT NOW()
);

-- 13. student_answers
CREATE TABLE IF NOT EXISTS public.student_answers (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  answer_value TEXT NOT NULL,
  is_doubtful BOOLEAN NOT NULL DEFAULT FALSE,
  is_correct BOOLEAN,
  score_earned INTEGER NOT NULL DEFAULT 0,
  lecturer_feedback TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 14. exam_snapshots
CREATE TABLE IF NOT EXISTS public.exam_snapshots (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  exam_id INTEGER NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  nim TEXT NOT NULL,
  student_name TEXT NOT NULL,
  course_name TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  trigger_stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Berhasil',
  image_data_url TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  captured_at TIMESTAMP DEFAULT NOW()
);

-- 15. violation_logs
CREATE TABLE IF NOT EXISTS public.violation_logs (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  exam_id INTEGER NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  nim TEXT NOT NULL,
  student_name TEXT NOT NULL,
  course_name TEXT NOT NULL,
  violation_type TEXT NOT NULL,
  warning_level INTEGER NOT NULL,
  description TEXT NOT NULL,
  verified_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  action_taken TEXT NOT NULL DEFAULT 'Peringatan Otomatis',
  detected_at TIMESTAMP DEFAULT NOW()
);

-- 16. exam_results
CREATE TABLE IF NOT EXISTS public.exam_results (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  exam_id INTEGER NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  nim TEXT NOT NULL,
  student_name TEXT NOT NULL,
  study_program_name TEXT NOT NULL,
  course_name TEXT NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  empty_count INTEGER NOT NULL DEFAULT 0,
  objective_score INTEGER NOT NULL DEFAULT 0,
  essay_score INTEGER NOT NULL DEFAULT 0,
  final_score INTEGER NOT NULL DEFAULT 0,
  grade_letter TEXT NOT NULL DEFAULT 'A',
  duration_used_minutes INTEGER NOT NULL DEFAULT 0,
  violation_count INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'Terverifikasi Aman',
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  submitted_at TIMESTAMP DEFAULT NOW()
);

-- 17. audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_entity TEXT NOT NULL,
  details TEXT NOT NULL,
  ip_address TEXT NOT NULL DEFAULT '10.24.118.42',
  created_at TIMESTAMP DEFAULT NOW()
);

-- 18. cbt_cloud_state (Tabel Sinkronisasi Cepat apabila menggunakan VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
CREATE TABLE IF NOT EXISTS public.cbt_cloud_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  state_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cbt_cloud_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cbt_cloud_state' AND policyname = 'Allow public read write cbt_cloud_state'
  ) THEN
    CREATE POLICY "Allow public read write cbt_cloud_state"
      ON public.cbt_cloud_state
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Seed Roles & Super Admin
INSERT INTO public.roles (name, description)
VALUES
  ('admin', 'Administrator Utama Sistem CBT'),
  ('dosen', 'Dosen Pengampu Mata Kuliah & Pengawas Ujian'),
  ('mahasiswa', 'Mahasiswa Peserta Ujian')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.users (uid, email, password_hash, full_name, role_id, role_name, is_active)
SELECT
  'uid-admin-muhtyasyugi',
  'muhtyasyugi@unikma.ac.id',
  'muhtyasyugi@123',
  'Muhtyas Yugi (Super Admin MazCodeID)',
  id,
  'admin',
  TRUE
FROM public.roles WHERE name = 'admin'
ON CONFLICT (email) DO NOTHING;

-- Seed Fakultas & Prodi Awal
INSERT INTO public.faculties (code, name, dean_name)
VALUES ('FST', 'Fakultas Sains dan Teknologi', 'Nurul Alfiah, M.Kom.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.study_programs (code, name, degree, faculty_id, head_name)
SELECT 'TEKIN', 'Teknologi Informasi', 'S1', id, 'Ahmad Latif, M.Kom'
FROM public.faculties WHERE code = 'FST'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.study_programs (code, name, degree, faculty_id, head_name)
SELECT 'SI', 'Sistem Informasi', 'S1', id, 'Mochammad Hasymi Somaida, S. T., M. M. S. I.'
FROM public.faculties WHERE code = 'FST'
ON CONFLICT (code) DO NOTHING;
