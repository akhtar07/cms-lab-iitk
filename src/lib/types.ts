export type MemberRole = "pi" | "postdoc" | "phd" | "mtech" | "srf_jrf" | "intern" | "ugp" | "alumni";
export type MemberStatus = "pending" | "active" | "rejected" | "left";
export type MeetingMode = "online" | "offline";
export type MeetingType = "progress" | "paper" | "thesis" | "urgent" | "other";
export type MeetingStatus = "confirmed" | "cancelled" | "completed" | "no_show";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: MemberRole;
  status: MemberStatus;
  requested_role: MemberRole | null;
  mentor_id: string | null;
  joined_on: string | null;
  expected_completion: string | null;
  research_interests: string | null;
  bio: string | null;
  phone: string | null;
  scholar_url: string | null;
  orcid: string | null;
  created_at: string;
  approved_at: string | null;
}

export interface LabSettings {
  id: 1;
  lab_name: string;
  pi_email: string | null;
  pi_display_name: string | null;
  default_location: string | null;
  timezone: string;
  booking_horizon_days: number;
  min_notice_hours: number;
  cancel_notice_hours: number;
}

export interface AvailabilityRule {
  id: string;
  weekday: number;
  start_time: string; // "15:00:00"
  end_time: string;
  slot_minutes: number;
  mode: "online" | "offline" | "both";
  location: string | null;
  active: boolean;
}

export interface AvailabilityBlock {
  id: string;
  kind: "open" | "blocked";
  start_at: string;
  end_at: string;
  reason: string | null;
  source: string;
}

export interface Meeting {
  id: string;
  host_id: string;
  requester_id: string;
  start_at: string;
  end_at: string;
  mode: MeetingMode;
  type: MeetingType;
  agenda: string;
  status: MeetingStatus;
  location: string | null;
  meet_link: string | null;
  gcal_event_id: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  late_cancel: boolean;
  created_at: string;
  project_id: string | null;
  pi_brief: string | null;
  brief_generated_at: string | null;
  requester?: Pick<Profile, "full_name" | "email" | "avatar_url" | "role">;
  project?: Pick<Project, "id" | "title" | "short_code"> | null;
}

export interface BusyRange { id: string; start_at: string; end_at: string }

export const ROLE_LABEL: Record<MemberRole, string> = {
  pi: "Principal Investigator",
  postdoc: "Post-doc",
  phd: "PhD scholar",
  mtech: "M.Tech (thesis)",
  srf_jrf: "SRF / JRF",
  intern: "Intern",
  ugp: "UGP student",
  alumni: "Alumni",
};

export const ROLE_ORDER: MemberRole[] = ["pi", "postdoc", "phd", "mtech", "srf_jrf", "intern", "ugp", "alumni"];

export const TYPE_LABEL: Record<MeetingType, string> = {
  progress: "Progress update",
  paper: "Paper discussion",
  thesis: "Thesis / synopsis",
  urgent: "Urgent",
  other: "Other",
};

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ------------------------------------------------------ Phase 2: research */
export type ProjectStage =
  | "idea" | "literature" | "calculations" | "analysis" | "writing"
  | "submitted" | "under_review" | "revision" | "accepted" | "published" | "shelved";
export type ItemStatus = "open" | "done" | "dropped";

export interface Project {
  id: string;
  title: string;
  short_code: string | null;
  stage: ProjectStage;
  lead_id: string | null;
  target_journal: string | null;
  arxiv_id: string | null;
  doi: string | null;
  manuscript_url: string | null;
  repo_url: string | null;
  summary: string | null;
  external_collaborators: string | null;
  submitted_on: string | null;
  revision_due: string | null;
  last_activity: string;
  created_at: string;
  created_by: string | null;
  members?: ProjectMember[];
}

export interface ProjectMember {
  project_id: string;
  profile_id: string;
  role: "lead" | "contributor" | "mentor";
  profile?: Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "role">;
}

export interface MeetingNote {
  id: string;
  meeting_id: string;
  author_id: string;
  raw_notes: string | null;
  summary: string | null;
  decisions: string[] | null;
  next_focus: string | null;
  confirmed_by_pi: boolean;
  confirmed_by_requester: boolean;
  extracted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionItem {
  id: string;
  project_id: string | null;
  meeting_id: string | null;
  owner_id: string;
  title: string;
  due_on: string | null;
  status: ItemStatus;
  created_by: string | null;
  created_at: string;
  done_at: string | null;
  owner?: Pick<Profile, "full_name" | "email" | "avatar_url">;
  project?: Pick<Project, "title" | "short_code"> | null;
}

export interface WeeklyUpdate {
  id: string;
  author_id: string;
  project_id: string | null;
  week_start: string;
  did: string | null;
  blocked: string | null;
  next: string | null;
  hours_compute: number | null;
  created_at: string;
  author?: Pick<Profile, "full_name" | "email" | "avatar_url" | "role">;
  project?: Pick<Project, "title" | "short_code"> | null;
}

export interface Publication {
  id: string;
  title: string;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
  url: string | null;
  arxiv_id: string | null;
  status: "preprint" | "published";
  project_id: string | null;
  added_by: string | null;
  created_at: string;
}

export interface Digest { id: string; kind: string; content: string; created_at: string }

export const STAGE_ORDER: ProjectStage[] = [
  "idea", "literature", "calculations", "analysis", "writing",
  "submitted", "under_review", "revision", "accepted", "published", "shelved",
];
export const STAGE_LABEL: Record<ProjectStage, string> = {
  idea: "Idea",
  literature: "Literature",
  calculations: "Calculations",
  analysis: "Analysis",
  writing: "Writing",
  submitted: "Submitted",
  under_review: "Under review",
  revision: "Revision",
  accepted: "Accepted",
  published: "Published",
  shelved: "Shelved",
};
/** Days without activity after which a live project is flagged as stale. */
export const STALE_DAYS = 14;
export const isLiveStage = (s: ProjectStage) => !["published", "shelved"].includes(s);
