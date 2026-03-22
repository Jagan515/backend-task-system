import {inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {TaskAssignment, TaskAssignmentRelations} from '../models';

export class TaskAssignmentRepository extends DefaultCrudRepository<
  TaskAssignment,
  typeof TaskAssignment.prototype.id,
  TaskAssignmentRelations
> {
  constructor(@inject('datasources.db') dataSource: DbDataSource) {
    super(TaskAssignment, dataSource);
  }
}
