import {Entity, model, property} from '@loopback/repository';

@model({
  settings: {
    postgresql: {table: 'task_assignments'},
  },
})
export class TaskAssignment extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id?: number;

  @property({
    type: 'number',
    required: true,
  })
  taskId: number;

  @property({
    type: 'number',
    required: true,
  })
  userId: number;

  @property({
    type: 'date',
    defaultFn: 'now',
  })
  assignedAt?: string;

  constructor(data?: Partial<TaskAssignment>) {
    super(data);
  }
}

export interface TaskAssignmentRelations {
  // describe navigational properties here
}

export type TaskAssignmentWithRelations = TaskAssignment & TaskAssignmentRelations;
