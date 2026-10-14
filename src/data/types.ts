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
  tags: string[];
  photoUrl: string;
  photoAlt: string;
  createdAt: string;
  status: 'draft' | 'ready';
}

/** A publishable collection of family moments. */
export interface Book {
  id: string;
  projectId: string;
  title: string;
  subtitle: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  coverMediaAssetId?: string;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  description: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Moment {
  id: string;
  /** Stable link to an interview, including interviews migrated from older snapshots. */
  sourceMemoryId?: string;
  bookId: string;
  chapterId: string;
  title: string;
  summary: string;
  occurredAt?: string;
  tags: string[];
  primaryPerspectiveId?: string;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
}

export type PerspectiveType = 'text' | 'audio' | 'photo' | 'video';

export interface Perspective {
  id: string;
  /** Only interview-owned text/photos carry this link; relatives' contributions do not. */
  sourceMemoryId?: string;
  momentId: string;
  authorId?: string;
  type: PerspectiveType;
  content: string;
  mediaAssetId?: string;
  caption?: string;
  createdAt: string;
  isPrimary: boolean;
}

export interface Reflection {
  id: string;
  momentId: string;
  authorId?: string;
  text: string;
  createdAt: string;
}

export type MediaAssetType = 'audio' | 'photo' | 'video' | 'document';

export interface MediaAsset {
  id: string;
  type: MediaAssetType;
  url: string;
  mimeType: string;
  fileName?: string;
  alt?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  createdAt: string;
}

export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppSettings {
  cloudBackup: boolean;
  allowTranscriptSharing: boolean;
  weeklyReminder: boolean;
  highContrast: boolean;
  theme: ThemePreference;
}

export interface AppSnapshot {
  version: 1;
  project: FamilyProject;
  people: Person[];
  questions: Question[];
  memories: Memory[];
  drafts: MemoryDraft[];
  books: Book[];
  chapters: Chapter[];
  moments: Moment[];
  perspectives: Perspective[];
  reflections: Reflection[];
  mediaAssets: MediaAsset[];
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
