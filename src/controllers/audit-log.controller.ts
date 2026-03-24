import {authenticate} from '@loopback/authentication';
import {authorize} from '@loopback/authorization';
import {inject} from '@loopback/core';
import {repository, Filter} from '@loopback/repository';
import {param, get, response, HttpErrors} from '@loopback/rest';
import {AuditLog} from '../models';
import {
  AuditLogRepository,
  TaskRepository,
  TaskAssignmentRepository,
} from '../repositories';
import {PERMISSIONS, UserRole} from '../config/permissions';
import {SecurityBindings, UserProfile, securityId} from '@loopback/security';

@authenticate('jwt')
@authorize({allowedRoles: PERMISSIONS.VIEW_AUDIT_LOGS})
export class AuditLogController {
  constructor(
    @repository(AuditLogRepository)
    public auditLogRepository: AuditLogRepository,
    @repository(TaskRepository)
    public taskRepository: TaskRepository,
    @repository(TaskAssignmentRepository)
    public taskAssignmentRepository: TaskAssignmentRepository,
    @inject(SecurityBindings.USER)
    public user: UserProfile,
  ) {}

  @get('/audit-logs')
  @response(200, {
    description: 'Array of AuditLog model instances',
    content: {
      'application/json': {
        schema: {type: 'array', items: {'x-ts-type': AuditLog}},
      },
    },
  })
  async find(
    @param.filter(AuditLog) filter?: Filter<AuditLog>,
  ): Promise<AuditLog[]> {
    const userId = parseInt(this.user[securityId]);
    const userRole = this.user.role;

    if (userRole === UserRole.MANAGER) {
      // Managers can see logs they performed
      const userFilter: Filter<AuditLog> = {
        ...filter,
        where: {
          ...filter?.where,
          performedBy: userId,
        },
      };
      return this.auditLogRepository.find(userFilter);
    }

    return this.auditLogRepository.find(filter);
  }

  @get('/tasks/{id}/history')
  @authorize({allowedRoles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.USER]})
  @response(200, {
    description: 'Array of AuditLog model instances for a specific task',
    content: {
      'application/json': {
        schema: {type: 'array', items: {'x-ts-type': AuditLog}},
      },
    },
  })
  async findByTaskId(@param.path.number('id') id: number): Promise<AuditLog[]> {
    try {
      const userId = parseInt(this.user[securityId]);
      const userRole = this.user.role;

      // Check if user has access to this task
      const task = await this.taskRepository.findById(id);

      if (userRole === UserRole.USER) {
        const assignments = await this.taskAssignmentRepository.find({
          where: {taskId: id, userId: userId},
        });
        const isAssigned = assignments.length > 0;
        const isOwner = task.createdBy === userId;

        if (!isAssigned && !isOwner) {
          throw new HttpErrors.Forbidden(
            'You do not have access to this task history.',
          );
        }
      }

      return await this.auditLogRepository.find({
        where: {
          and: [{entityType: 'Task'}, {entityId: id}],
        },
      });
    } catch (err) {
      if (err instanceof HttpErrors.HttpError) throw err;
      throw new HttpErrors.InternalServerError(
        `Failed to retrieve task history: ${err.message}`,
      );
    }
  }
}
