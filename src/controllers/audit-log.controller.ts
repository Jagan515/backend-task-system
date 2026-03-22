import {
  authenticate,
} from '@loopback/authentication';
import {
  authorize,
} from '@loopback/authorization';
import {
  repository,
  Filter,
} from '@loopback/repository';
import {
  param,
  get,
  response,
} from '@loopback/rest';
import {AuditLog} from '../models';
import {AuditLogRepository} from '../repositories';
import {PERMISSIONS} from '../config/permissions';

@authenticate('jwt')
@authorize({allowedRoles: PERMISSIONS.VIEW_AUDIT_LOGS})
export class AuditLogController {
  constructor(
    @repository(AuditLogRepository)
    public auditLogRepository: AuditLogRepository,
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
  async findByTaskId(
    @param.path.number('id') id: number,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: {
        and: [
          {entityType: 'Task'},
          {entityId: id}
        ]
      }
    });
  }
}
