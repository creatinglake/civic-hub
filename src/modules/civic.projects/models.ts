export type ProjectStatus = "active" | "archived";

export type SentimentValue = "support" | "oppose";

export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string;
  sources: string[];
  status: ProjectStatus;
  support_count: number;
  oppose_count: number;
  assistant_helped: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectUpdate {
  id: string;
  project_id: string;
  content: string;
  media_urls: string[];
  created_at: string;
}

export interface ProjectSentiment {
  project_id: string;
  user_id: string;
  sentiment: SentimentValue;
  created_at: string;
  updated_at: string;
}

export interface ProjectComment {
  id: string;
  project_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface CreateProjectInput {
  title: string;
  description?: string;
  sources?: string[];
  user_id: string;
  assistant_helped?: boolean;
}
