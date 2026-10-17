import * as migration_20261005_034225_initial from './20261005_034225_initial';
import * as migration_20261017_185426_supertext_settings from './20261017_185426_supertext_settings';

export const migrations = [
  {
    up: migration_20261005_034225_initial.up,
    down: migration_20261005_034225_initial.down,
    name: '20261005_034225_initial',
  },
  {
    up: migration_20261017_185426_supertext_settings.up,
    down: migration_20261017_185426_supertext_settings.down,
    name: '20261017_185426_supertext_settings'
  },
];
