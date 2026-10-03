export type PersonStatus = 'active' | 'invited' | 'paused';
export type QuestionStatus = 'next' | 'planned' | 'answered' | 'draft';

export interface FamilyProject {
  id: string;
  title: string;
  subtitle: string;
  createdAt: string;
  inviteCode: string;
}

export interface Person {
  id: string;
  projectId: string;
  name: string;
  relation: string;
  birthYear?: number;
  initials: string;
  avatarColor: string;
  bio: string;
  answeredCount: number;
  totalQuestions: number;
  lastActiveAt: string;
  status: PersonStatus;
}

export interface Question {
  id: string;
  personId: string;
  text: string;
  hint: string;
  prompts: string[];
  category: string;
  status: QuestionStatus;
  order: number;
}

export interface Memory {
  id: string;
  personId: string;
  questionId: string;
  title: string;
  questionText: string;
  recordedAt: string;
  durationSeconds: number;
  transcript: string;
  tags: string[];
  photoUrl: string;
  photoAlt: string;
  source: 'app' | 'link' | 'import';
  favorite: boolean;
}

export interface MemoryDraft {
  id: string;
  personId: string;
  questionId: string;
  transcript: string;
  durationSeconds: number;
  createdAt: string;
  status: 'draft' | 'ready';
}

export interface AppSettings {
  cloudBackup: boolean;
  allowTranscriptSharing: boolean;
  weeklyReminder: boolean;
  highContrast: boolean;
}

export interface AppSnapshot {
  version: 1;
  project: FamilyProject;
  people: Person[];
  questions: Question[];
  memories: Memory[];
  drafts: MemoryDraft[];
  settings: AppSettings;
}

export interface NewMemoryInput {
  personId: string;
  questionId: string;
  transcript: string;
  durationSeconds: number;
  tags: string[];
  photoUrl?: string;
  photoAlt?: string;
}
