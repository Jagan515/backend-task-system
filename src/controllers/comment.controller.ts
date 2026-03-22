import {
  authenticate,
} from '@loopback/authentication';
import {
  authorize,
} from '@loopback/authorization';
import {inject} from '@loopback/core';
import {
  repository,
} from '@loopback/repository';
import {
  post,
  param,
  get,
  requestBody,
  response,
} from '@loopback/rest';
import {Comment} from '../models';
import {CommentRepository} from '../repositories';
import {securityId, UserProfile, SecurityBindings} from '@loopback/security';
import {AuditService} from '../services';
import {PERMISSIONS} from '../config/permissions';

@authenticate('jwt')
export class CommentController {
  constructor(
    @repository(CommentRepository)
    public commentRepository: CommentRepository,
    @inject('services.AuditService')
    public auditService: AuditService,
    @inject(SecurityBindings.USER)
    public user: UserProfile,
  ) {}

  @authorize({allowedRoles: PERMISSIONS.CREATE_COMMENT})
  @post('/tasks/{id}/comments')
  @response(200, {
    description: 'Comment model instance',
    content: {'application/json': {schema: {'x-ts-type': Comment}}},
  })
  async create(
    @param.path.number('id') taskId: number,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['content'],
            properties: {
              content: {type: 'string'},
            },
          },
        },
      },
    })
    commentData: Pick<Comment, 'content'>,
  ): Promise<Comment> {
    const userId = this.user[securityId];
    const comment = await this.commentRepository.create({
      ...commentData,
      taskId,
      userId: parseInt(userId),
    });

    await this.auditService.log('Comment', comment.id!, 'CREATE', userId, {
      taskId,
      content: comment.content,
    });

    return comment;
  }

  @get('/tasks/{id}/comments')
  @response(200, {
    description: 'Array of Comment model instances',
    content: {
      'application/json': {
        schema: {type: 'array', items: {'x-ts-type': Comment}},
      },
    },
  })
  async findByTaskId(
    @param.path.number('id') taskId: number,
  ): Promise<Comment[]> {
    return this.commentRepository.find({where: {taskId}});
  }
}
