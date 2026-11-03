export type ID = string;

export const FIRM_STATUSES = [
  'Not Started', 'Researching', 'Outreach Sent', 'Call Scheduled', 'Contacted',
  'Applied', 'Interview', 'Offer', 'Declined', 'Not Pursuing',
] as const;
export type FirmStatus = (typeof FIRM_STATUSES)[number];

export const PERSON_STATUSES = [
  'Prospect', 'Outreach sent', 'Scheduling', 'Spoke', 'Thanked', 'Keep warm', 'No response', 'Dormant',
] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const ROLES = ['Partner', 'Counsel', 'Associate', 'Clerk', 'Summer Associate', 'Student', 'Recruiter', 'In-house', 'Other'] as const;
export type Role = (typeof ROLES)[number] | '';

export const INTERACTION_TYPES = {
  'email-out': 'Email sent',
  'email-in': 'Email received',
  'text': 'Text / DM',
  'call': 'Phone call',
  'video': 'Video call',
  'coffee': 'Coffee chat',
  'in-person': 'In person',
  'reception': 'Reception / event',
  'career-fair': 'Career fair',
  'thank-you': 'Thank-you sent',
  'check-in': 'Check-in sent',
  'note': 'Note',
} as const;
export type InteractionType = keyof typeof INTERACTION_TYPES;

export const CONVERSATION_TYPES: InteractionType[] = ['call', 'video', 'coffee', 'in-person', 'reception', 'career-fair'];
export const OUTREACH_TYPES: InteractionType[] = ['email-out', 'text'];

export const MARKETS = ['NYC', 'Toronto', 'Montreal', 'Calgary', 'Vancouver', 'Boston', 'DC', 'Chicago', 'Bay Area', 'London', 'Other'] as const;

export interface Firm {
  id: ID;
  name: string;
  aliases: string[];
  kind: 'firm' | 'company';
  market: string;
  offices: string;
  size: string;
  tiers: string[];
  practiceAreas: string;
  howFound: string;
  status: FirmStatus;
  interest: number | null;
  notes: string;
  links: string[];
  review?: string;
}

export interface Person {
  id: ID;
  name: string;
  firmId: ID | null;
  pastEmployers: string;
  role: Role;
  title: string;
  gradYear: number | null;
  school: string;
  tags: string[];
  email: string;
  linkedin: string;
  otherChannel: string;
  status: PersonStatus;
  statusManual: boolean;
  whereMet: string;
  personal: string;
  notes: string;
  review?: string;
  flag?: { note: string; at: string }; // your own "follow up on this" reminder; shows on Today until cleared
  createdAt: string;
}

export interface Interaction {
  id: ID;
  personId: ID;
  date: string; // YYYY-MM-DD
  type: InteractionType;
  summary: string;
  takeaways: string;
  impression: number | null;
  link?: string;            // e.g. Gmail thread
  gmailKey?: string;        // Gmail log entry this interaction came from or is linked to
  source?: 'gmail';
}

export interface Task {
  id: ID;
  text: string;
  personId?: ID | null;
  firmId?: ID | null;
  direction: 'owe' | 'owed';
  due?: string | null;
  trigger?: { firmId: ID; status: FirmStatus } | null;
  done: boolean;
  doneAt?: string | null;
  createdAt: string;
}

export interface Deadline {
  id: ID;
  firmId?: ID | null;
  program: string;
  name: string;
  date: string;
  time?: string;
  source: string;
  verified: boolean;
  notes: string;
}

export interface Template {
  id: ID;
  name: string;
  kind: InteractionType; // interaction logged when marked sent
  subject: string;
  body: string;
}

export interface Question {
  id: ID;
  category: string;
  text: string;
}

export interface Settings {
  name: string;
  school: string;
  year: string;
  email: string;
  signature: string;
  silenceWeeks: number;
  noReplyDays: number;
}

export interface Data {
  version: 1;
  firms: Firm[];
  people: Person[];
  interactions: Interaction[];
  tasks: Task[];
  deadlines: Deadline[];
  templates: Template[];
  questions: Question[];
  settings: Settings;
  updatedAt: string;
}
