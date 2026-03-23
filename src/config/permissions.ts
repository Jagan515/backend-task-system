export enum UserRole {
  USER = 'user',
  MANAGER = 'manager',
  ADMIN = 'admin',
}

export const PERMISSIONS = {
  // Task Permissions
  CREATE_TASK: [UserRole.MANAGER, UserRole.ADMIN],
  UPDATE_TASK: [UserRole.MANAGER, UserRole.ADMIN],
  DELETE_TASK: [UserRole.MANAGER, UserRole.ADMIN],
  VIEW_TASKS: [UserRole.USER, UserRole.MANAGER, UserRole.ADMIN],

  // Audit Permissions
  VIEW_AUDIT_LOGS: [UserRole.MANAGER, UserRole.ADMIN],
  // Comment Permissions
  CREATE_COMMENT: [
    UserRole.USER,
    UserRole.MANAGER,
    UserRole.ADMIN,
  ],
};
