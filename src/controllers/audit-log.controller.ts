import {authenticate} from '@loopback/authentication';
import {authorize} from '@loopback/authorization';
import {inject} from '@loopback/core';
import {repository, Filter} from '@loopback/repository';
import {param, get, response, HttpErrors} from '@loopback/rest';
import {AuditLog} from '../models';
import {AuditLogRepository, TaskRepository} from '../repositories';
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

    if (userRole === UserRole.CONTRIBUTOR) {
      // Contributors can see logs they performed
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
  @response(200, {
    description: 'Array of AuditLog model instances for a specific task',
    content: {
      'application/json': {
        schema: {type: 'array', items: {'x-ts-type': AuditLog}},
      },
    },
  })
  async findByTaskId(@param.path.number('id') id: number): Promise<AuditLog[]> {
    const userId = parseInt(this.user[securityId]);
    const userRole = this.user.role;

    if (userRole === UserRole.CONTRIBUTOR) {
      const task = await this.taskRepository.findById(id);
      if (task.createdBy !== userId) {
        throw new HttpErrors.Forbidden(
          'Managers can only view history for tasks they created.',
        );
      }
    }

    return this.auditLogRepository.find({
      where: {
        and: [{entityType: 'Task'}, {entityId: id}],
      },
    });
  }
}
