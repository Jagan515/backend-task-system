import {Entity, model, property} from '@loopback/repository';

@model({
  settings: {
    postgresql: {table: 'filter_presets'},
  },
})
export class FilterPreset extends Entity {
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
  name: string;

  @property({
    type: 'object',
    required: true,
  })
  filter: object;

  @property({
    type: 'number',
    required: true,
  })
  userId: number;

  @property({
    type: 'date',
    defaultFn: 'now',
  })
  createdAt?: string;

  constructor(data?: Partial<FilterPreset>) {
    super(data);
  }
}

export interface FilterPresetRelations {
  // describe navigational properties here
}

export type FilterPresetWithRelations = FilterPreset & FilterPresetRelations;
