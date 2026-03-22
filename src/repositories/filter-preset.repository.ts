import {inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {FilterPreset, FilterPresetRelations} from '../models';

export class FilterPresetRepository extends DefaultCrudRepository<
  FilterPreset,
  typeof FilterPreset.prototype.id,
  FilterPresetRelations
> {
  constructor(
    @inject('datasources.db') dataSource: DbDataSource,
  ) {
    super(FilterPreset, dataSource);
  }
}
