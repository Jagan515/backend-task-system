import {Entity, model, property} from '@loopback/repository';

@model({
  settings: {
    postgresql: {table: 'audit_logs'},
  },
})
export class AuditLog extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id?: number;

  @property({
    type: 'string',
    required: true,
  })
  entityType: string;

  @property({
    type: 'number',
    required: true,
  })
  entityId: number;

  @property({
    type: 'string',
    required: true,
  })
  action: string;

  @property({
    type: 'number',
    required: true,
  })
  performedBy: number;

  @property({
    type: 'date',
    defaultFn: 'now',
  })
  timestamp?: string;

  @property({
    type: 'object',
  })
  details?: object;

  constructor(data?: Partial<AuditLog>) {
    super(data);
  }
}

export interface AuditLogRelations {
  // describe navigational properties here
}

export type AuditLogWithRelations = AuditLog & AuditLogRelations;
