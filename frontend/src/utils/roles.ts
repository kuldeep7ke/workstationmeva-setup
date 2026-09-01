export interface RoleDefinition {
  id: string;
  label: string;
  defaultLevel: number;
  taskTypes: { value: string; label: string }[];
  priorityOptions: { value: string; label: string }[];
}

const ALL_PRIORITIES: { value: string; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export const ROLES: RoleDefinition[] = [
  {
    id: 'admin',
    label: 'Admin',
    defaultLevel: 1,
    priorityOptions: ALL_PRIORITIES,
    taskTypes: [
      { value: 'assignment', label: 'Assignment' },
      { value: 'review', label: 'Review' },
      { value: 'approval', label: 'Approval' },
      { value: 'planning', label: 'Planning' },
    ],
  },
  {
    id: 'executive_editor',
    label: 'Executive Editor',
    defaultLevel: 2,
    priorityOptions: ALL_PRIORITIES,
    taskTypes: [
      { value: 'assignment', label: 'Assignment' },
      { value: 'review', label: 'Review' },
      { value: 'approval', label: 'Approval' },
      { value: 'planning', label: 'Planning' },
    ],
  },
  {
    id: 'anchor',
    label: 'Anchor',
    defaultLevel: 3,
    priorityOptions: [
      { value: 'breaking_news', label: 'Breaking News' },
      { value: 'single_news', label: 'Single News' },
      { value: 'special_report', label: 'Special Report' },
      { value: 'trending', label: 'Trending' },
      { value: 'local_news', label: 'Local News' },
    ],
    taskTypes: [
      { value: 'script_writing', label: 'Script Writing' },
      { value: 'recording', label: 'Recording' },
      { value: 'footage_collection', label: 'Footage Collection' },
      { value: 'live_broadcast', label: 'Live Broadcast' },
    ],
  },
  {
    id: 'video_editor',
    label: 'Video Editor',
    defaultLevel: 3,
    priorityOptions: [
      { value: 'new_ads', label: 'New Ads' },
      { value: 'new_graphics', label: 'New Graphics' },
      { value: 'trending', label: 'Trending' },
      { value: 'local_news', label: 'Local News' },
      { value: 'entertainment', label: 'Entertainment' },
      { value: 'digital', label: 'Digital' },
    ],
    taskTypes: [
      { value: 'video_edit', label: 'Video Edit' },
      { value: 'thumbnail', label: 'Thumbnail' },
      { value: 'upload', label: 'Upload' },
      { value: 'motion_graphics', label: 'Motion Graphics' },
    ],
  },
  {
    id: 'reporter',
    label: 'Reporter',
    defaultLevel: 3,
    priorityOptions: [
      { value: 'breaking_news', label: 'Breaking News' },
      { value: 'ground_report', label: 'Ground Report' },
      { value: 'local_news', label: 'Local News' },
      { value: 'single_news', label: 'Single News' },
    ],
    taskTypes: [
      { value: 'field_report', label: 'Field Report' },
      { value: 'footage_collection', label: 'Footage Collection' },
      { value: 'ground_coverage', label: 'Ground Coverage' },
    ],
  },
  {
    id: 'social_media',
    label: 'Social Media Handler',
    defaultLevel: 3,
    priorityOptions: [
      { value: 'trending', label: 'Trending' },
      { value: 'digital', label: 'Digital' },
      { value: 'entertainment', label: 'Entertainment' },
      { value: 'local_news', label: 'Local News' },
    ],
    taskTypes: [
      { value: 'social_post', label: 'Social Post' },
      { value: 'graphic_design', label: 'Graphic Design' },
      { value: 'content_create', label: 'Content Create' },
      { value: 'platform_upload', label: 'Platform Upload' },
    ],
  },
  {
    id: 'input_desk',
    label: 'Input Desk',
    defaultLevel: 3,
    priorityOptions: ALL_PRIORITIES,
    taskTypes: [
      { value: 'source_monitoring', label: 'Source Monitoring' },
      { value: 'story_pitch', label: 'Story Pitch' },
      { value: 'lead_tracking', label: 'Lead Tracking' },
      { value: 'assignment_coordination', label: 'Assignment Coordination' },
    ],
  },
  {
    id: 'output_desk',
    label: 'Output Desk',
    defaultLevel: 3,
    priorityOptions: ALL_PRIORITIES,
    taskTypes: [
      { value: 'scheduling', label: 'Scheduling' },
      { value: 'playlist_management', label: 'Playlist Management' },
      { value: 'broadcast_coordination', label: 'Broadcast Coordination' },
      { value: 'transmission', label: 'Transmission' },
    ],
  },
  {
    id: 'advertise',
    label: 'Advertise',
    defaultLevel: 3,
    priorityOptions: [
      { value: 'new_ads', label: 'New Ads' },
      { value: 'new_graphics', label: 'New Graphics' },
      { value: 'trending', label: 'Trending' },
      { value: 'digital', label: 'Digital' },
    ],
    taskTypes: [
      { value: 'ad_creation', label: 'Ad Creation' },
      { value: 'client_meeting', label: 'Client Meeting' },
      { value: 'campaign_management', label: 'Campaign Management' },
      { value: 'billing', label: 'Billing' },
    ],
  },
  {
    id: 'editorial',
    label: 'Editorial',
    defaultLevel: 3,
    priorityOptions: ALL_PRIORITIES,
    taskTypes: [
      { value: 'content_review', label: 'Content Review' },
      { value: 'script_approval', label: 'Script Approval' },
      { value: 'fact_check', label: 'Fact Check' },
      { value: 'final_approval', label: 'Final Approval' },
    ],
  },
  {
    id: 'manager',
    label: 'Manager',
    defaultLevel: 2,
    priorityOptions: ALL_PRIORITIES,
    taskTypes: [
      { value: 'assignment', label: 'Assignment' },
      { value: 'review', label: 'Review' },
      { value: 'approval', label: 'Approval' },
      { value: 'planning', label: 'Planning' },
    ],
  },
  {
    id: 'vo_artist',
    label: 'VO Artist',
    defaultLevel: 3,
    priorityOptions: ALL_PRIORITIES,
    taskTypes: [
      { value: 'voice_over', label: 'Voice Over' },
      { value: 'recording', label: 'Recording' },
      { value: 'script_reading', label: 'Script Reading' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    defaultLevel: 3,
    priorityOptions: ALL_PRIORITIES,
    taskTypes: [
      { value: 'campaign', label: 'Campaign' },
      { value: 'promotion', label: 'Promotion' },
      { value: 'branding', label: 'Branding' },
    ],
  },
  {
    id: 'general',
    label: 'General',
    defaultLevel: 3,
    priorityOptions: ALL_PRIORITIES,
    taskTypes: [
      { value: 'general_duty', label: 'General Duty' },
      { value: 'support', label: 'Support' },
    ],
  },
  {
    id: 'accounting',
    label: 'Accounting',
    defaultLevel: 3,
    priorityOptions: ALL_PRIORITIES,
    taskTypes: [
      { value: 'billing', label: 'Billing' },
      { value: 'invoice', label: 'Invoice' },
      { value: 'expense', label: 'Expense' },
    ],
  },
  {
    id: 'hr',
    label: 'HR',
    defaultLevel: 3,
    priorityOptions: ALL_PRIORITIES,
    taskTypes: [
      { value: 'recruitment', label: 'Recruitment' },
      { value: 'payroll', label: 'Payroll' },
      { value: 'attendance', label: 'Attendance' },
    ],
  },
];

export const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low',
};

export function canCreateTask(user: any): boolean {
  if (!user) return false;
  if (user.access_level <= 2) return true;
  const allowedRoles = ['admin', 'executive_editor', 'manager', 'video_editor', 'anchor', 'reporter', 'input_desk', 'output_desk'];
  return allowedRoles.includes(user.role);
}

// Program crew: operator / video editor / anchor style multi-talent staff
export function canCreateProgram(user: any): boolean {
  if (!user) return false;
  if (user.access_level <= 2) return true;
  const allowedRoles = ['video_editor', 'anchor', 'general', 'editorial', 'output_desk', 'input_desk', 'reporter'];
  return allowedRoles.includes(user.role);
}

export function getPriorityOptionsForRole(roleId: string): { value: string; label: string }[] {
  return ROLES.find(r => r.id === roleId)?.priorityOptions || ALL_PRIORITIES;
}

export const SEAT_LIMITS: Record<string, number> = {
  admin: 1,
  manager: 3,
  video_editor: 4,
  anchor: 7,
  vo_artist: 2,
  social_media: 1,
  input_desk: 1,
  output_desk: 1,
  advertise: 1,
  editorial: 1,
  marketing: 1,
  general: 3,
  accounting: 2,
  hr: 1,
};

export function getRoleLabel(roleId: string): string {
  return ROLES.find(r => r.id === roleId)?.label || roleId;
}

export function getTaskTypesForRole(roleId: string): { value: string; label: string }[] {
  return ROLES.find(r => r.id === roleId)?.taskTypes || [{ value: 'general', label: 'General' }];
}

// Helper function to format snake_case or any text to Title Case
export function formatLabel(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}
