import {authenticate} from '@loopback/authentication';
import {authorize} from '@loopback/authorization';
import {inject} from '@loopback/core';
import {repository, Filter} from '@loopback/repository';
import {
  post,
  param,
  get,
  put,
  patch,
  del,
  requestBody,
  response,
  HttpErrors,
} from '@loopback/rest';
import {Task} from '../models';
import {TaskRepository, TaskAssignmentRepository} from '../repositories';
import {AuditService, ReminderService} from '../services';
import {securityId, UserProfile, SecurityBindings} from '@loopback/security';
import {PERMISSIONS, UserRole} from '../config/permissions';

@authenticate('jwt')
export class TaskController {
  constructor(
    @repository(TaskRepository)
    public taskRepository: TaskRepository,
    @repository(TaskAssignmentRepository)
    public taskAssignmentRepository: TaskAssignmentRepository,
    @inject('services.AuditService')
    public auditService: AuditService,
    @inject('services.ReminderService')
    public reminderService: ReminderService,
    @inject(SecurityBindings.USER)
    public user: UserProfile,
  ) {}

  @authorize({allowedRoles: PERMISSIONS.CREATE_TASK})
  @post('/tasks')
  @response(200, {
    description: 'Task model instance',
    content: {'application/json': {schema: {'x-ts-type': Task}}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['title', 'dueDate'],
            properties: {
              title: {type: 'string'},
              description: {type: 'string'},
              dueDate: {type: 'string', format: 'date-time'},
              priority: {type: 'string'},
              assignees: {type: 'array', items: {type: 'number'}},
            },
          },
        },
      },
    })
    taskData: Omit<Task, 'id'> & {assignees?: number[]},
  ): Promise<Task> {
    const {assignees, ...taskFields} = taskData;
    const userId = parseInt(this.user[securityId]);
    const userRole = this.user.role;

    // Restriction: CONSUMER (User) cannot create tasks
    if (userRole === 'CONSUMER') {
      throw new HttpErrors.Forbidden(
        'Users with CONSUMER role cannot create tasks.',
      );
    }

    // Create task
    const task = await this.taskRepository.create({
      ...taskFields,
      createdBy: userId,
    });

    // Create assignments
    if (assignees && assignees.length > 0) {
      for (const assigneeId of assignees) {
        await this.taskAssignmentRepository.create({
          taskId: task.id!,
          userId: assigneeId,
        });
      }
    }

    await this.auditService.log('Task', task.id!, 'CREATE', userId, {
      title: task.title,
    });

    // Schedule reminder
    await this.reminderService.scheduleReminder(
      task.id!,
      new Date(task.dueDate),
    );

    return task;
  }

  @get('/tasks')
  @response(200, {
    description: 'Array of Task model instances',
    content: {
      'application/json': {
        schema: {type: 'array', items: {'x-ts-type': Task}},
      },
    },
  })
  async find(@param.filter(Task) filter?: Filter<Task>): Promise<Task[]> {
    const userId = parseInt(this.user[securityId]);
    const userRole = this.user.role;

    // Restriction: CONSUMER (User) can only see assigned tasks or tasks they created
    if (userRole === 'CONSUMER') {
      const assignments = await this.taskAssignmentRepository.find({
        where: {userId: userId},
      });
      const assignedTaskIds = assignments.map(a => a.taskId);

      const userFilter: Filter<Task> = {
        ...filter,
        where: {
          ...filter?.where,
          or: [{createdBy: userId}, {id: {inq: assignedTaskIds}}],
        },
      };
      return this.taskRepository.find(userFilter);
    }

    return this.taskRepository.find(filter);
  }

  @get('/tasks/{id}')
  @response(200, {
    description: 'Task model instance',
    content: {'application/json': {schema: {'x-ts-type': Task}}},
  })
  async findById(@param.path.number('id') id: number): Promise<Task> {
    return this.taskRepository.findById(id);
  }

  @authorize({
    allowedRoles: [
      UserRole.CONSUMER,
      UserRole.CONTRIBUTOR,
      UserRole.POWER_USER,
    ],
  })
  @patch('/tasks/{id}')
  @response(204, {description: 'Task PATCH success'})
  async updateById(
    @param.path.number('id') id: number,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              title: {type: 'string'},
              description: {type: 'string'},
              dueDate: {type: 'string', format: 'date-time'},
              status: {type: 'string'},
              priority: {type: 'string'},
              assignees: {type: 'array', items: {type: 'number'}},
              lastUpdatedAt: {type: 'string', format: 'date-time'},
            },
          },
        },
      },
    })
    taskData: Partial<Task> & {assignees?: number[]; lastUpdatedAt?: string},
  ): Promise<void> {
    const {assignees, lastUpdatedAt, ...taskFields} = taskData;
    const userId = parseInt(this.user[securityId]);
    const userRole = this.user.role;

    const oldTask = await this.taskRepository.findById(id);

    // Concurrency Check (Optimistic Locking)
    if (lastUpdatedAt && oldTask.updatedAt) {
      const incomingUpdate = new Date(lastUpdatedAt).getTime();
      const existingUpdate = new Date(oldTask.updatedAt).getTime();
      if (Math.abs(incomingUpdate - existingUpdate) > 1000) {
        throw new HttpErrors.Conflict(
          'This task has been modified by another user. Please refresh and try again.',
        );
      }
    }

    const assignments = await this.taskAssignmentRepository.find({
      where: {taskId: id},
    });
    const isAssigned = assignments.some(a => a.userId === userId);
    const isOwner = oldTask.createdBy === userId;

    if (userRole === 'CONSUMER') {
      if (!isAssigned && !isOwner) {
        throw new HttpErrors.Forbidden(
          'You are not authorized to update this task.',
        );
      }
      // User can only update status
      const allowedKeys = ['status'];
      const attemptedKeys = Object.keys(taskFields);
      if (
        attemptedKeys.some(k => !allowedKeys.includes(k)) ||
        assignees !== undefined
      ) {
        throw new HttpErrors.Forbidden(
          'Users with CONSUMER role can only update task status.',
        );
      }
    } else if (userRole === 'CONTRIBUTOR') {
      if (!isOwner) {
        throw new HttpErrors.Forbidden(
          'Managers can only update tasks they created.',
        );
      }
    }

    // Validation: Due date cannot be in the past (Requirement 4.2)
    if (taskFields.dueDate) {
      const dueDate = new Date(taskFields.dueDate);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (dueDate < now) {
        throw new HttpErrors.BadRequest('Due date cannot be in the past.');
      }
    }

    await this.taskRepository.updateById(id, {
      ...taskFields,
      updatedAt: new Date().toISOString(),
    });

    if (assignees !== undefined) {
      // Sync assignments
      await this.taskAssignmentRepository.deleteAll({taskId: id});
      for (const assigneeId of assignees) {
        await this.taskAssignmentRepository.create({
          taskId: id,
          userId: assigneeId,
        });
      }
    }

    // Identify what changed for the audit log
    const changes: Record<string, {old?: unknown; new: unknown}> = {};
    for (const key of Object.keys(taskFields)) {
      const typedKey = key as keyof Task;
      if (
        taskFields[typedKey] !==
        (oldTask as unknown as Record<string, unknown>)[typedKey]
      ) {
        changes[typedKey] = {
          old: (oldTask as unknown as Record<string, unknown>)[typedKey],
          new: taskFields[typedKey],
        };
      }
    }

    if (assignees !== undefined) {
      changes.assignees = {new: assignees};
    }

    await this.auditService.log('Task', id, 'UPDATE', userId, changes);
  }

  @get('/tasks/{id}/assignees')
  @response(200, {
    description: 'List of assignees for a task',
    content: {
      'application/json': {
        schema: {type: 'array', items: {type: 'number'}},
      },
    },
  })
  async findAssigneesByTaskId(
    @param.path.number('id') id: number,
  ): Promise<number[]> {
    const assignments = await this.taskAssignmentRepository.find({
      where: {taskId: id},
    });
    return assignments.map(a => a.userId);
  }

  @authorize({allowedRoles: PERMISSIONS.UPDATE_TASK})
  @patch('/tasks/bulk')
  @response(200, {
    description: 'Bulk update tasks',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async bulkUpdate(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['ids', 'data'],
            properties: {
              ids: {type: 'array', items: {type: 'number'}},
              data: {
                type: 'object',
                properties: {
                  status: {type: 'string'},
                  priority: {type: 'string'},
                  dueDate: {type: 'string', format: 'date-time'},
                },
              },
            },
          },
        },
      },
    })
    bulkData: {
      ids: number[];
      data: Partial<Task>;
    },
  ): Promise<{count: number}> {
    const userId = parseInt(this.user[securityId]);
    const userRole = this.user.role;
    const {ids, data} = bulkData;

    // Validation: Due date cannot be in the past (Requirement 4.2)
    if (data.dueDate) {
      const dueDate = new Date(data.dueDate);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (dueDate < now) {
        throw new HttpErrors.BadRequest('Due date cannot be in the past.');
      }
    }

    // Role-based Ownership Check
    if (userRole === UserRole.CONTRIBUTOR) {
      const tasks = await this.taskRepository.find({where: {id: {inq: ids}}});
      if (tasks.some(t => t.createdBy !== userId)) {
        throw new HttpErrors.Forbidden(
          'Managers can only update tasks they created.',
        );
      }
    }

    const result = await this.taskRepository.updateAll(data, {
      id: {inq: ids},
    });

    for (const id of ids) {
      await this.auditService.log('Task', id, 'BULK_UPDATE', userId, data);
    }

    return result;
  }

  @authorize({allowedRoles: PERMISSIONS.DELETE_TASK})
  @post('/tasks/bulk-delete')
  @response(200, {
    description: 'Bulk delete tasks',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async bulkDelete(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['ids'],
            properties: {
              ids: {type: 'array', items: {type: 'number'}},
            },
          },
        },
      },
    })
    bulkData: {
      ids: number[];
    },
  ): Promise<{count: number}> {
    const userId = parseInt(this.user[securityId]);
    const userRole = this.user.role;
    const {ids} = bulkData;

    // Role-based Ownership Check
    if (userRole === UserRole.CONTRIBUTOR) {
      const tasks = await this.taskRepository.find({where: {id: {inq: ids}}});
      if (tasks.some(t => t.createdBy !== userId)) {
        throw new HttpErrors.Forbidden(
          'Managers can only delete tasks they created.',
        );
      }
    }

    // Delete assignments first
    await this.taskAssignmentRepository.deleteAll({taskId: {inq: ids}});

    const result = await this.taskRepository.deleteAll({
      id: {inq: ids},
    });

    for (const id of ids) {
      await this.auditService.log('Task', id, 'BULK_DELETE', userId);
    }

    return result;
  }

  @authorize({allowedRoles: PERMISSIONS.UPDATE_TASK})
  @patch('/tasks/bulk-assign')
  @response(200, {
    description: 'Bulk assign tasks to users',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async bulkAssign(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['ids', 'userIds'],
            properties: {
              ids: {type: 'array', items: {type: 'number'}},
              userIds: {type: 'array', items: {type: 'number'}},
            },
          },
        },
      },
    })
    bulkData: {
      ids: number[];
      userIds: number[];
    },
  ): Promise<{count: number}> {
    const userId = parseInt(this.user[securityId]);
    const userRole = this.user.role;
    const {ids, userIds} = bulkData;

    // Role-based Ownership Check
    if (userRole === UserRole.CONTRIBUTOR) {
      const tasks = await this.taskRepository.find({where: {id: {inq: ids}}});
      if (tasks.some(t => t.createdBy !== userId)) {
        throw new HttpErrors.Forbidden(
          'Managers can only assign tasks they created.',
        );
      }
    }

    for (const taskId of ids) {
      // Clear existing assignments for each task
      await this.taskAssignmentRepository.deleteAll({taskId});

      // Add new assignments
      for (const assigneeId of userIds) {
        await this.taskAssignmentRepository.create({
          taskId,
          userId: assigneeId,
        });
      }

      await this.auditService.log('Task', taskId, 'BULK_ASSIGN', userId, {
        userIds,
      });
    }

    return {count: ids.length};
  }

  @put('/tasks/{id}')
  @response(204, {description: 'Task PUT success'})
  async replaceById(
    @param.path.number('id') id: number,
    @requestBody() task: Task,
  ): Promise<void> {
    const userId = parseInt(this.user[securityId]);
    await this.taskRepository.replaceById(id, task);
    await this.auditService.log('Task', id, 'UPDATE', userId, task);
  }
  @authorize({allowedRoles: PERMISSIONS.DELETE_TASK})
  @del('/tasks/{id}')
  @response(204, {description: 'Task DELETE success'})
  async deleteById(@param.path.number('id') id: number): Promise<void> {
    const userId = parseInt(this.user[securityId]);
    const userRole = this.user.role;

    const task = await this.taskRepository.findById(id);

    if (userRole === UserRole.CONTRIBUTOR && task.createdBy !== userId) {
      throw new HttpErrors.Forbidden(
        'Managers can only delete tasks they created.',
      );
    }

    if (userRole !== UserRole.POWER_USER && userRole !== UserRole.CONTRIBUTOR) {
      throw new HttpErrors.Forbidden('Unauthorized to delete tasks.');
    }

    await this.taskRepository.deleteById(id);
    await this.auditService.log('Task', id, 'DELETE', userId);
  }
}
