export type RoleType = 'admin' | 'dosen' | 'mahasiswa';

export interface WebsiteSettingRecord {
  id: number;
  siteName: string;
  universityName: string;
  tagline: string;
  description: string;
  logoText: string;
  logoImageUrl?: string | null;
  heroImageUrl: string;
  contactEmail?: string | null;
  footerText?: string | null;
  isActive: boolean;
  updatedAt?: string;
}

export interface UserRecord {
  id: number;
  uid: string;
  email: string;
  passwordHash?: string;
  fullName: string;
  roleId: number;
  roleName: RoleType;
  avatarUrl?: string;
  isActive: boolean;
  createdAt?: string;
}

export interface FacultyRecord {
  id: number;
  code: string;
  name: string;
  deanName: string;
}

export interface StudyProgramRecord {
  id: number;
  code: string;
  name: string;
  degree: string;
  facultyId?: number | null;
  headName: string;
}

export interface ClassRecord {
  id: number;
  code: string;
  name: string;
  semester: number;
  academicYear: string;
  studyProgramId?: number | null;
  capacity: number;
}

export interface LecturerRecord {
  id: number;
  userId: number;
  nidn: string;
  fullName: string;
  facultyId?: number | null;
  studyProgramId?: number | null;
  specialization: string;
  phone?: string;
}

export interface StudentRecord {
  id: number;
  userId: number;
  nim: string;
  fullName: string;
  facultyId?: number | null;
  studyProgramId?: number | null;
  classId?: number | null;
  semester: number;
  enrollmentYear: number;
  avatarUrl?: string;
}

export interface CourseRecord {
  id: number;
  code: string;
  name: string;
  sks: number;
  semester: number;
  studyProgramId?: number | null;
  lecturerId?: number | null;
  description?: string;
}

export interface ExamRecord {
  id: number;
  code: string;
  title: string;
  courseId?: number | null;
  lecturerId?: number | null;
  classId?: number | null;
  examType: string;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  totalQuestions: number;
  passingGrade: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  maxAttempts: number;
  requireCamera: boolean;
  requireFullscreen: boolean;
  snapshotCount: number;
  maxViolations: number;
  violationAction: string;
  status: string;
  resultsPublished: boolean;
}

export interface QuestionOptionRecord {
  id: number;
  questionId: number;
  optionLabel: string;
  optionText: string;
  isCorrect: boolean;
}

export interface QuestionRecord {
  id: number;
  courseId?: number | null;
  examId?: number | null;
  questionType:
    | 'pilihan_ganda'
    | 'pilihan_ganda_kompleks'
    | 'benar_salah'
    | 'isian_singkat'
    | 'esai';
  difficulty: string;
  questionText: string;
  mediaType: 'none' | 'image' | 'table' | 'math';
  mediaContent?: string | null;
  weight: number;
  correctAnswerKey: string;
  explanation?: string;
  options: QuestionOptionRecord[];
}

export interface ExamSessionRecord {
  id: number;
  examId: number;
  studentId: number;
  status: string;
  cameraStatus: string;
  connectionStatus: string;
  fullscreenStatus: boolean;
  snapshot1Status: string;
  snapshot2Status: string;
  snapshot3Status: string;
  violationCount: number;
  warningLevel: number;
  remainingSeconds: number;
  startedAt?: string;
  finishedAt?: string;
  lastActiveAt?: string;
}

export interface StudentAnswerRecord {
  id: number;
  sessionId: number;
  questionId: number;
  answerValue: string;
  isDoubtful: boolean;
  isCorrect?: boolean | null;
  scoreEarned: number;
  lecturerFeedback?: string | null;
}

export interface ExamSnapshotRecord {
  id: number;
  sessionId: number;
  examId: number;
  studentId: number;
  nim: string;
  studentName: string;
  courseName: string;
  sequenceNumber: number;
  triggerStage: string;
  status: string;
  imageDataUrl: string;
  retryCount: number;
  capturedAt: string;
}

export interface ViolationLogRecord {
  id: number;
  sessionId: number;
  examId: number;
  studentId: number;
  nim: string;
  studentName: string;
  courseName: string;
  violationType: string;
  warningLevel: number;
  description: string;
  verifiedByAdmin: boolean;
  actionTaken: string;
  detectedAt: string;
}

export interface ExamResultRecord {
  id: number;
  sessionId: number;
  examId: number;
  studentId: number;
  nim: string;
  studentName: string;
  studyProgramName: string;
  courseName: string;
  correctCount: number;
  wrongCount: number;
  emptyCount: number;
  objectiveScore: number;
  essayScore: number;
  finalScore: number;
  gradeLetter: string;
  durationUsedMinutes: number;
  violationCount: number;
  verificationStatus: string;
  isPublished: boolean;
  submittedAt: string;
}

export interface AuditLogRecord {
  id: number;
  userId?: number;
  actorName: string;
  actorRole: string;
  action: string;
  targetEntity: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

export interface CbtSystemState {
  websiteSettings: WebsiteSettingRecord[];
  roles: Array<{ id: number; name: string; description: string }>;
  users: UserRecord[];
  faculties: FacultyRecord[];
  studyPrograms: StudyProgramRecord[];
  classes: ClassRecord[];
  lecturers: LecturerRecord[];
  students: StudentRecord[];
  courses: CourseRecord[];
  exams: ExamRecord[];
  questions: QuestionRecord[];
  sessions: ExamSessionRecord[];
  answers: StudentAnswerRecord[];
  snapshots: ExamSnapshotRecord[];
  violations: ViolationLogRecord[];
  results: ExamResultRecord[];
  auditLogs: AuditLogRecord[];
}
