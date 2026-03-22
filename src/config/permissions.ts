export enum UserRole {
  CONSUMER = 'CONSUMER',
  CONTRIBUTOR = 'CONTRIBUTOR',
  POWER_USER = 'POWER_USER',
}

export const PERMISSIONS = {
  // Task Permissions
  CREATE_TASK: [UserRole.CONTRIBUTOR, UserRole.POWER_USER],
  UPDATE_TASK: [UserRole.CONTRIBUTOR, UserRole.POWER_USER],
  DELETE_TASK: [UserRole.CONTRIBUTOR, UserRole.POWER_USER],
  VIEW_TASKS: [UserRole.CONSUMER, UserRole.CONTRIBUTOR, UserRole.POWER_USER],

  // Audit Permissions
  VIEW_AUDIT_LOGS: [UserRole.CONTRIBUTOR, UserRole.POWER_USER],

  // User Management Permissions
  MANAGE_USERS: [UserRole.POWER_USER],

  // Comment Permissions
  CREATE_COMMENT: [
    UserRole.CONSUMER,
    UserRole.CONTRIBUTOR,
    UserRole.POWER_USER,
  ],
};
