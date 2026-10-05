import * as migration_20261005_034225_initial from './20261005_034225_initial';

export const migrations = [
  {
    up: migration_20261005_034225_initial.up,
    down: migration_20261005_034225_initial.down,
    name: '20261005_034225_initial'
  },
];
