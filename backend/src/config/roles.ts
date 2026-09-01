export interface RoleDefinition {
  id: string;
  label: string;
  defaultLevel: number;
  taskTypes: { value: string; label: string }[];
}

export const ROLES: RoleDefinition[] = [
  {
    id: 'admin',
    label: 'Admin',
    defaultLevel: 1,
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
    taskTypes: [
      { value: 'general_duty', label: 'General Duty' },
      { value: 'support', label: 'Support' },
    ],
  },
  {
    id: 'accounting',
    label: 'Accounting',
    defaultLevel: 3,
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
    taskTypes: [
      { value: 'recruitment', label: 'Recruitment' },
      { value: 'payroll', label: 'Payroll' },
      { value: 'attendance', label: 'Attendance' },
    ],
  },
];

export function getRole(roleId: string): RoleDefinition | undefined {
  return ROLES.find(r => r.id === roleId);
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

export function getTaskTypesForRole(roleId: string): { value: string; label: string }[] {
  const role = getRole(roleId);
  return role ? role.taskTypes : [{ value: 'general', label: 'General' }];
}
