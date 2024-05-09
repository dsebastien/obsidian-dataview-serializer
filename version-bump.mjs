import { readFileSync, writeFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;
const pluginMetadataFolder = './';
const manifestFile = 'manifest.json';
const versionsFile = 'versions.json';

// read minAppVersion from manifest.json and bump version to target version
console.log('Generating manifest');
let manifest = JSON.parse(
  readFileSync(`${pluginMetadataFolder}/${manifestFile}`, 'utf8')
);
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync(
  `${pluginMetadataFolder}/${manifestFile}`,
  JSON.stringify(manifest, null, '\t')
);

// update versions.json with target version and minAppVersion from manifest.json
console.log('Updating versions file');
let versions = JSON.parse(
  readFileSync(`${pluginMetadataFolder}/${versionsFile}`, 'utf8')
);
versions[targetVersion] = minAppVersion;

writeFileSync(
  `${pluginMetadataFolder}/${versionsFile}`,
  JSON.stringify(versions, null, '\t')
);
