import {injectable, /* inject, */ BindingScope} from '@loopback/core';
import {repository} from '@loopback/repository';
import {AuditLogRepository} from '../repositories';

@injectable({scope: BindingScope.TRANSIENT})
export class AuditService {
  constructor(
    @repository(AuditLogRepository)
    public auditLogRepository: AuditLogRepository,
  ) {}

  async log(
    entityType: string,
    entityId: number,
    action: string,
    performedBy: number,
    details?: object,
  ) {
    await this.auditLogRepository.create({
      entityType,
      entityId,
      action,
      performedBy,
      details,
    });
  }
}
