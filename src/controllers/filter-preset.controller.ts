import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {post, param, get, del, requestBody, response} from '@loopback/rest';
import {FilterPreset} from '../models';
import {FilterPresetRepository} from '../repositories';
import {securityId, UserProfile, SecurityBindings} from '@loopback/security';

@authenticate('jwt')
export class FilterPresetController {
  constructor(
    @repository(FilterPresetRepository)
    public filterPresetRepository: FilterPresetRepository,
    @inject(SecurityBindings.USER)
    public user: UserProfile,
  ) {}

  @post('/filter-presets')
  @response(200, {
    description: 'FilterPreset model instance',
    content: {'application/json': {schema: {'x-ts-type': FilterPreset}}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['name', 'filter'],
            properties: {
              name: {type: 'string'},
              filter: {type: 'object'},
            },
          },
        },
      },
    })
    preset: Omit<FilterPreset, 'id' | 'userId'>,
  ): Promise<FilterPreset> {
    const userId = parseInt(this.user[securityId]);
    return this.filterPresetRepository.create({
      ...preset,
      userId,
    });
  }

  @get('/filter-presets')
  @response(200, {
    description: 'Array of FilterPreset model instances for the current user',
    content: {
      'application/json': {
        schema: {type: 'array', items: {'x-ts-type': FilterPreset}},
      },
    },
  })
  async find(): Promise<FilterPreset[]> {
    const userId = parseInt(this.user[securityId]);
    return this.filterPresetRepository.find({
      where: {userId},
    });
  }

  @del('/filter-presets/{id}')
  @response(204, {
    description: 'FilterPreset DELETE success',
  })
  async deleteById(@param.path.number('id') id: number): Promise<void> {
    const userId = parseInt(this.user[securityId]);
    await this.filterPresetRepository.deleteAll({
      id,
      userId,
    });
  }
}
