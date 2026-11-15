import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 0. website_settings (CRUD Website: Nama Website, Tagline, Foto Banner, Logo, Universitas, dll)
export const websiteSettings = pgTable('website_settings', {
  id: serial('id').primaryKey(),
  siteName: text('site_name').notNull(),
  universityName: text('university_name').notNull(),
  tagline: text('tagline').notNull(),
  description: text('description').notNull(),
  logoText: text('logo_text').notNull(),
  logoImageUrl: text('logo_image_url'),
  heroImageUrl: text('hero_image_url').notNull(),
  contactEmail: text('contact_email'),
  footerText: text('footer_text'),
  isActive: boolean('is_active').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 1. roles
export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // 'admin', 'dosen', 'mahasiswa'
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. users
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  roleId: integer('role_id')
    .references(() => roles.id, { onDelete: 'restrict' })
    .notNull(),
  roleName: text('role_name').notNull(), // 'admin' | 'dosen' | 'mahasiswa'
  avatarUrl: text('avatar_url'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 3. faculties
export const faculties = pgTable('faculties', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  deanName: text('dean_name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 4. study_programs
export const studyPrograms = pgTable('study_programs', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  degree: text('degree').notNull(), // S1, D3, S2
  facultyId: integer('faculty_id').references(() => faculties.id, {
    onDelete: 'set null',
  }),
  headName: text('head_name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 5. classes
export const classes = pgTable('classes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  semester: integer('semester').notNull(),
  academicYear: text('academic_year').notNull(),
  studyProgramId: integer('study_program_id').references(
    () => studyPrograms.id,
    { onDelete: 'set null' }
  ),
  capacity: integer('capacity').default(40).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 6. lecturers
export const lecturers = pgTable('lecturers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  nidn: text('nidn').notNull().unique(),
  fullName: text('full_name').notNull(),
  facultyId: integer('faculty_id').references(() => faculties.id, {
    onDelete: 'set null',
  }),
  studyProgramId: integer('study_program_id').references(
    () => studyPrograms.id,
    { onDelete: 'set null' }
  ),
  specialization: text('specialization').notNull(),
  phone: text('phone'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 7. students
export const students = pgTable('students', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  nim: text('nim').notNull().unique(),
  fullName: text('full_name').notNull(),
  facultyId: integer('faculty_id').references(() => faculties.id, {
    onDelete: 'set null',
  }),
  studyProgramId: integer('study_program_id').references(
    () => studyPrograms.id,
    { onDelete: 'set null' }
  ),
  classId: integer('class_id').references(() => classes.id, {
    onDelete: 'set null',
  }),
  semester: integer('semester').default(1).notNull(),
  enrollmentYear: integer('enrollment_year').default(2026).notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 8. courses
export const courses = pgTable('courses', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  sks: integer('sks').notNull(),
  semester: integer('semester').notNull(),
  studyProgramId: integer('study_program_id').references(
    () => studyPrograms.id,
    { onDelete: 'set null' }
  ),
  lecturerId: integer('lecturer_id').references(() => lecturers.id, {
    onDelete: 'set null',
  }),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 9. exams
export const exams = pgTable('exams', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  courseId: integer('course_id').references(() => courses.id, {
    onDelete: 'cascade',
  }),
  lecturerId: integer('lecturer_id').references(() => lecturers.id, {
    onDelete: 'set null',
  }),
  classId: integer('class_id').references(() => classes.id, {
    onDelete: 'set null',
  }),
  examType: text('exam_type').notNull(), // UTS, UAS, Kuis
  durationMinutes: integer('duration_minutes').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  totalQuestions: integer('total_questions').notNull(),
  passingGrade: integer('passing_grade').default(70).notNull(),
  randomizeQuestions: boolean('randomize_questions').default(true).notNull(),
  randomizeOptions: boolean('randomize_options').default(true).notNull(),
  maxAttempts: integer('max_attempts').default(1).notNull(),
  requireCamera: boolean('require_camera').default(true).notNull(),
  requireFullscreen: boolean('require_fullscreen').default(true).notNull(),
  snapshotCount: integer('snapshot_count').default(3).notNull(),
  maxViolations: integer('max_violations').default(3).notNull(),
  violationAction: text('violation_action').default('warn_and_flag').notNull(),
  status: text('status').default('Berlangsung').notNull(),
  resultsPublished: boolean('results_published').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 10. exam_questions
export const examQuestions = pgTable('exam_questions', {
  id: serial('id').primaryKey(),
  courseId: integer('course_id').references(() => courses.id, {
    onDelete: 'set null',
  }),
  examId: integer('exam_id').references(() => exams.id, {
    onDelete: 'set null',
  }),
  questionType: text('question_type').notNull(),
  difficulty: text('difficulty').default('Sedang').notNull(),
  questionText: text('question_text').notNull(),
  mediaType: text('media_type').default('none').notNull(),
  mediaContent: text('media_content'),
  weight: integer('weight').default(10).notNull(),
  correctAnswerKey: text('correct_answer_key').notNull(),
  explanation: text('explanation'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 11. question_options
export const questionOptions = pgTable('question_options', {
  id: serial('id').primaryKey(),
  questionId: integer('question_id')
    .references(() => examQuestions.id, { onDelete: 'cascade' })
    .notNull(),
  optionLabel: text('option_label').notNull(),
  optionText: text('option_text').notNull(),
  isCorrect: boolean('is_correct').default(false).notNull(),
});

// 12. exam_sessions
export const examSessions = pgTable('exam_sessions', {
  id: serial('id').primaryKey(),
  examId: integer('exam_id')
    .references(() => exams.id, { onDelete: 'cascade' })
    .notNull(),
  studentId: integer('student_id')
    .references(() => students.id, { onDelete: 'cascade' })
    .notNull(),
  status: text('status').default('Sedang Ujian').notNull(),
  cameraStatus: text('camera_status').default('Aktif').notNull(),
  connectionStatus: text('connection_status').default('Online').notNull(),
  fullscreenStatus: boolean('fullscreen_status').default(true).notNull(),
  snapshot1Status: text('snapshot1_status').default('Belum Diambil').notNull(),
  snapshot2Status: text('snapshot2_status').default('Belum Diambil').notNull(),
  snapshot3Status: text('snapshot3_status').default('Belum Diambil').notNull(),
  violationCount: integer('violation_count').default(0).notNull(),
  warningLevel: integer('warning_level').default(0).notNull(),
  remainingSeconds: integer('remaining_seconds').notNull(),
  questionOrderJson: text('question_order_json'),
  startedAt: timestamp('started_at').defaultNow(),
  finishedAt: timestamp('finished_at'),
  lastActiveAt: timestamp('last_active_at').defaultNow(),
});

// 13. student_answers
export const studentAnswers = pgTable('student_answers', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id')
    .references(() => examSessions.id, { onDelete: 'cascade' })
    .notNull(),
  questionId: integer('question_id')
    .references(() => examQuestions.id, { onDelete: 'cascade' })
    .notNull(),
  answerValue: text('answer_value').notNull(),
  isDoubtful: boolean('is_doubtful').default(false).notNull(),
  isCorrect: boolean('is_correct'),
  scoreEarned: integer('score_earned').default(0).notNull(),
  lecturerFeedback: text('lecturer_feedback'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 14. exam_snapshots
export const examSnapshots = pgTable('exam_snapshots', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id')
    .references(() => examSessions.id, { onDelete: 'cascade' })
    .notNull(),
  examId: integer('exam_id')
    .references(() => exams.id, { onDelete: 'cascade' })
    .notNull(),
  studentId: integer('student_id')
    .references(() => students.id, { onDelete: 'cascade' })
    .notNull(),
  nim: text('nim').notNull(),
  studentName: text('student_name').notNull(),
  courseName: text('course_name').notNull(),
  sequenceNumber: integer('sequence_number').notNull(),
  triggerStage: text('trigger_stage').notNull(),
  status: text('status').default('Berhasil').notNull(),
  imageDataUrl: text('image_data_url').notNull(),
  retryCount: integer('retry_count').default(0).notNull(),
  capturedAt: timestamp('captured_at').defaultNow(),
});

// 15. violation_logs
export const violationLogs = pgTable('violation_logs', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id')
    .references(() => examSessions.id, { onDelete: 'cascade' })
    .notNull(),
  examId: integer('exam_id')
    .references(() => exams.id, { onDelete: 'cascade' })
    .notNull(),
  studentId: integer('student_id')
    .references(() => students.id, { onDelete: 'cascade' })
    .notNull(),
  nim: text('nim').notNull(),
  studentName: text('student_name').notNull(),
  courseName: text('course_name').notNull(),
  violationType: text('violation_type').notNull(),
  warningLevel: integer('warning_level').notNull(),
  description: text('description').notNull(),
  verifiedByAdmin: boolean('verified_by_admin').default(false).notNull(),
  actionTaken: text('action_taken').default('Peringatan Otomatis').notNull(),
  detectedAt: timestamp('detected_at').defaultNow(),
});

// 16. exam_results
export const examResults = pgTable('exam_results', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id')
    .references(() => examSessions.id, { onDelete: 'cascade' })
    .notNull(),
  examId: integer('exam_id')
    .references(() => exams.id, { onDelete: 'cascade' })
    .notNull(),
  studentId: integer('student_id')
    .references(() => students.id, { onDelete: 'cascade' })
    .notNull(),
  nim: text('nim').notNull(),
  studentName: text('student_name').notNull(),
  studyProgramName: text('study_program_name').notNull(),
  courseName: text('course_name').notNull(),
  correctCount: integer('correct_count').default(0).notNull(),
  wrongCount: integer('wrong_count').default(0).notNull(),
  emptyCount: integer('empty_count').default(0).notNull(),
  objectiveScore: integer('objective_score').default(0).notNull(),
  essayScore: integer('essay_score').default(0).notNull(),
  finalScore: integer('final_score').default(0).notNull(),
  gradeLetter: text('grade_letter').default('A').notNull(),
  durationUsedMinutes: integer('duration_used_minutes').default(0).notNull(),
  violationCount: integer('violation_count').default(0).notNull(),
  verificationStatus: text('verification_status')
    .default('Terverifikasi Aman')
    .notNull(),
  isPublished: boolean('is_published').default(true).notNull(),
  submittedAt: timestamp('submitted_at').defaultNow(),
});

// 17. audit_logs
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  actorName: text('actor_name').notNull(),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  targetEntity: text('target_entity').notNull(),
  details: text('details').notNull(),
  ipAddress: text('ip_address').default('10.24.118.42').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
}));

export const studyProgramsRelations = relations(studyPrograms, ({ one }) => ({
  faculty: one(faculties, {
    fields: [studyPrograms.facultyId],
    references: [faculties.id],
  }),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  course: one(courses, {
    fields: [exams.courseId],
    references: [courses.id],
  }),
  lecturer: one(lecturers, {
    fields: [exams.lecturerId],
    references: [lecturers.id],
  }),
  questions: many(examQuestions),
  sessions: many(examSessions),
}));

export const examQuestionsRelations = relations(
  examQuestions,
  ({ one, many }) => ({
    exam: one(exams, {
      fields: [examQuestions.examId],
      references: [exams.id],
    }),
    options: many(questionOptions),
  })
);

export const questionOptionsRelations = relations(
  questionOptions,
  ({ one }) => ({
    question: one(examQuestions, {
      fields: [questionOptions.questionId],
      references: [examQuestions.id],
    }),
  })
);
