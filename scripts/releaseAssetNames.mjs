export function releaseAssetNameForPath(packId, relPath) {
  return `${packId}__${relPath.split('/').join('__')}`.replace(/[^A-Za-z0-9._-]/gu, '.');
}
