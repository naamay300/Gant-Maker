export interface CustomStatus {
  id: string;
  name: string;
  color: string;
}

export interface Assignee {
  name: string;
  color: string;
}

export interface Task {
  id: string;
  number: number;
  name: string;
  assignees: Assignee[];
  startDate: string;       // ISO: "2025-03-16"
  duration: number;        // days
  dependencies: string[];  // task IDs
  statusId: string;        // references CustomStatus.id
  createdAt: string;       // ISO datetime
  order: number;           // for manual sorting
}

export interface Project {
  id: string;
  name: string;
  accountId: string;
  tasks: Task[];
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string;
}

export interface Account {
  id: string;
  name: string;
  ownerId: string;
  role: 'owner' | 'admin' | 'member';
}

export type ColorMode = 'status' | 'assignee';

export type SortField =
  | 'manual'
  | 'createdAt'
  | 'assignee'
  | 'startDate'
  | 'endDate'
  | 'status';

export type SortDirection = 'asc' | 'desc';
