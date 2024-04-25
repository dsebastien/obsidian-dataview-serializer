import { readFileSync, writeFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;
const appFolder = './apps/plugin/src/assets';
const targetFolder = './dist/apps/plugin';
const manifestFile = 'manifest.json';
const versionsFile = 'versions.json';

// read minAppVersion from manifest.json and bump version to target version
console.log('Generating manifest');
let manifest = JSON.parse(readFileSync(`${appFolder}/${manifestFile}`, 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync(
  `${appFolder}/${manifestFile}`,
  JSON.stringify(manifest, null, '\t')
);
// Replace write by a copy
writeFileSync(
  `${targetFolder}/${manifestFile}`,
  JSON.stringify(manifest, null, '\t')
);

// update versions.json with target version and minAppVersion from manifest.json
console.log('Updating versions file');
let versions = JSON.parse(readFileSync(`${appFolder}/${versionsFile}`, 'utf8'));
versions[targetVersion] = minAppVersion;

writeFileSync(
  `${appFolder}/${versionsFile}`,
  JSON.stringify(versions, null, '\t')
);
// Replace write by a copy
writeFileSync(
  `${targetFolder}/${versionsFile}`,
  JSON.stringify(versions, null, '\t')
);
