import {
  authenticate,
} from '@loopback/authentication';
import {
  authorize,
} from '@loopback/authorization';
import {inject} from '@loopback/core';
import {
  repository,
  Filter,
} from '@loopback/repository';
import {
  post,
  param,
  get,
  put,
  del,
  requestBody,
  response,
} from '@loopback/rest';
import {Task} from '../models';
import {TaskRepository, TaskAssignmentRepository} from '../repositories';
import {AuditService, ReminderService} from '../services';
import {securityId, UserProfile, SecurityBindings} from '@loopback/security';
import {PERMISSIONS} from '../config/permissions';

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
    const userId = this.user[securityId];
    
    // Create task
    const task = await this.taskRepository.create({
      ...taskFields,
      createdBy: parseInt(userId),
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

    await this.auditService.log('Task', task.id!, 'CREATE', parseInt(userId), {
      title: task.title,
    });

    // Schedule reminder
    await this.reminderService.scheduleReminder(task.id!, new Date(task.dueDate));

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
  async find(
    @param.filter(Task) filter?: Filter<Task>,
  ): Promise<Task[]> {
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

  @authorize({allowedRoles: PERMISSIONS.UPDATE_TASK})
  @put('/tasks/{id}')
  @response(204, {description: 'Task PUT success'})
  async replaceById(
    @param.path.number('id') id: number,
    @requestBody() task: Task,
  ): Promise<void> {
    const userId = this.user[securityId];
    await this.taskRepository.replaceById(id, task);
    await this.auditService.log('Task', id, 'UPDATE', parseInt(userId), task);
  }

  @authorize({allowedRoles: PERMISSIONS.DELETE_TASK})
  @del('/tasks/{id}')
  @response(204, {description: 'Task DELETE success'})
  async deleteById(
    @param.path.number('id') id: number,
  ): Promise<void> {
    const userId = this.user[securityId];
    await this.taskRepository.deleteById(id);
    await this.auditService.log('Task', id, 'DELETE', parseInt(userId));
  }
}
