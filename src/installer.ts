import * as tc from '@actions/tool-cache';
import * as core from '@actions/core';
import * as path from 'path';
import * as semver from 'semver';
import * as sys from './system';
import fs from 'fs';
import os from 'os';
import {ReleaseAlias} from './utils';
import {Octokit} from '@octokit/rest';
//import { Octokit } from "@o";
import {ELI_GITHUB_OWNER, ELI_GITHUB_REPOSITORY} from './constants';

export interface IEliVersionFile {
  filename: string;
  // darwin, linux, windows
  os: string;
  arch: string;
  download_url: string;
}

export interface IEliVersion {
  version: string;
  stable: boolean;
  files: IEliVersionFile[];
}

export interface IEliVersionInfo {
  downloadUrl: string;
  resolvedVersion: string;
  fileName: string;
}

const authToken = core.getInput('token');
const octokit = new Octokit(authToken ? {auth: authToken} : {});

export async function getEli(versionSpec: string, arch = os.arch()) {
  const osPlat: string = os.platform();

  if (versionSpec === undefined || versionSpec === ReleaseAlias.Latest) {
    const version = await resolveLatestVersion(ReleaseAlias.Latest, arch);
    core.info(`${ReleaseAlias.Latest} version resolved as ${version}`);
    if (version) {
      versionSpec = version;
    }
  }

  const toolPath = tc.find('eli', versionSpec, arch);
  if (toolPath) {
    core.info(`Found in cache @ ${toolPath}`);
    return toolPath;
  }

  core.info(`Attempting to download ${versionSpec}-${arch}...`);
  let downloadPath = '';
  let info: IEliVersionInfo | null = null;

  // Download from https://github.com/alis-is/eli
  if (!downloadPath) {
    info = await getInfoFromDist(versionSpec, arch);
    if (!info) {
      throw new Error(
        `Unable to find eli version '${versionSpec}' for platform ${osPlat} and architecture ${arch}.`
      );
    }

    try {
      core.info('Install from dist');
      downloadPath = await installEliVersion(info, undefined, arch);
    } catch (err) {
      throw new Error(`Failed to download version ${versionSpec}: ${err}`);
    }
  }

  return downloadPath;
}

async function installEliVersion(
  info: IEliVersionInfo,
  auth: string | undefined,
  arch: string
): Promise<string> {
  core.info(`Acquiring ${info.resolvedVersion} from ${info.downloadUrl}`);

  // Windows requires that we keep the extension (.zip) for extraction
  const isWindows = os.platform() === 'win32';
  const tempDir = process.env.RUNNER_TEMP || '.';
  const fileName = isWindows ? path.join(tempDir, info.fileName) : undefined;
  const downloadPath = await tc.downloadTool(info.downloadUrl, fileName, auth);
  const eliBinDir = path.join(path.dirname(downloadPath), 'eli');
  const eliBinPath = path.join(eliBinDir, `eli${path.extname(info.fileName)}`);
  // chmod +x eliBinPath
  fs.mkdirSync(eliBinDir, {recursive: true});
  fs.renameSync(downloadPath, eliBinPath);
  fs.chmodSync(eliBinPath, '755');

  core.info(`Successfully downloaded eli to ${eliBinPath}`);

  core.info('Adding to the cache ...');
  const cachedDir = await tc.cacheDir(
    eliBinDir,
    'eli',
    makeSemver(info.resolvedVersion),
    arch
  );
  core.info(`Successfully cached eli to ${cachedDir}`);
  return cachedDir;
}

export async function getInfoFromDist(
  versionSpec: string,
  arch: string
): Promise<IEliVersionInfo | null> {
  const version: IEliVersion | undefined = await findMatch(versionSpec, arch);
  if (!version) {
    return null;
  }

  return <IEliVersionInfo>{
    downloadUrl: version.files[0].download_url,
    resolvedVersion: version.version,
    fileName: version.files[0].filename
  };
}

export async function findMatch(
  versionSpec: string,
  arch = os.arch()
): Promise<IEliVersion | undefined> {
  const archFilter = sys.getArch(arch);
  const platFilter = sys.getPlatform();

  let result: IEliVersion | undefined;
  let match: IEliVersion | undefined;

  const candidates: IEliVersion[] | null =
    await module.exports.getAvailableVersions();
  if (!candidates) {
    throw new Error(`no eli version found`);
  }

  let eliFile: IEliVersionFile | undefined;
  for (let i = 0; i < candidates.length; i++) {
    const candidate: IEliVersion = candidates[i];
    const version = makeSemver(candidate.version);

    core.debug(`check ${version} satisfies ${versionSpec}`);
    if (semver.satisfies(version, versionSpec)) {
      eliFile = candidate.files.find(file => {
        core.debug(
          `${file.arch}===${archFilter} && ${file.os}===${platFilter}`
        );
        return file.arch === archFilter && file.os === platFilter;
      });

      if (eliFile) {
        core.debug(`matched ${candidate.version}`);
        match = candidate;
        break;
      }
    }
  }

  if (match && eliFile) {
    // clone since we're mutating the file list to be only the file that matches
    result = <IEliVersion>Object.assign({}, match);
    result.files = [eliFile];
  }

  return result;
}

export async function getAvailableVersions(): Promise<IEliVersion[] | null> {
  const response = await octokit.rest.repos.listReleases({
    owner: ELI_GITHUB_OWNER,
    repo: ELI_GITHUB_REPOSITORY
  });

  const releases = response.data
    .filter(release => {
      // filter out releases older than 0.29.0
      const version = semver.clean(release.tag_name) ?? '0.0.0';
      const limit = semver.clean('v0.29.0') ?? '0.0.0';
      return semver.gte(version, limit);
    })
    .sort((a, b) => {
      // sort by version
      const aVersion = semver.clean(a.tag_name) ?? '0.0.0';
      const bVersion = semver.clean(b.tag_name) ?? '0.0.0';
      return semver.gt(aVersion, bVersion) ? -1 : 1;
    });

  // parse releasese to IEliVersion[]
  return releases.map(release => {
    const version = release.tag_name.replace('v', '');
    const files = release.assets.map(asset => {
      const assetBaseName = path.parse(asset.name).name;

      return <IEliVersionFile>{
        filename: asset.name,
        os: assetBaseName.split('-')[1],
        arch: assetBaseName.split('-')[2],
        download_url: asset.browser_download_url
      };
    });
    return {
      version,
      stable: !release.prerelease && !release.draft,
      files
    };
  });
}

export function makeSemver(version: string): string {
  version = version.replace('v', '');
  const parts = version.split('-');

  const semVersion = semver.coerce(parts[0])?.version;
  if (!semVersion) {
    throw new Error(
      `The version: ${version} can't be changed to SemVer notation`
    );
  }

  if (!parts[1]) {
    return semVersion;
  }

  const fullVersion = semver.valid(`${semVersion}-${parts[1]}`);

  if (!fullVersion) {
    throw new Error(
      `The version: ${version} can't be changed to SemVer notation`
    );
  }
  return fullVersion;
}

async function resolveLatestVersion(versionSpec: string, arch: string) {
  const archFilter = sys.getArch(arch);
  const platFilter = sys.getPlatform();

  const candidates: IEliVersion[] | null =
    await module.exports.getAvailableVersions();
  if (!candidates) {
    throw new Error(`eli download url did not return results`);
  }

  const fixedCandidates = candidates.map(item => {
    return {
      ...item,
      version: makeSemver(item.version)
    };
  });

  const stableVersion = await resolveStableVersionInput(
    versionSpec,
    archFilter,
    platFilter,
    fixedCandidates
  );

  return stableVersion;
}

export async function resolveStableVersionInput(
  versionSpec: string,
  arch: string,
  platform: string,
  manifest: tc.IToolRelease[] | IEliVersion[]
) {
  const releases = manifest
    .map(item => {
      const index = item.files.findIndex(
        item => item.arch === arch && item.filename.includes(platform)
      );
      if (index === -1) {
        return '';
      }
      return item.version;
    })
    .filter(item => !!item && !semver.prerelease(item));
  core.debug(`versionSpec: ${versionSpec}, releases: ${releases.join(', ')}`);
  switch (versionSpec) {
    case ReleaseAlias.Latest:
      return releases[0];
    default: {
      const versions = releases.map(
        release => `${semver.major(release)}.${semver.minor(release)}`
      );
      const uniqueVersions = Array.from(new Set(versions));
      const targetVersion = releases.find(item =>
        item.startsWith(uniqueVersions[0])
      );
      return targetVersion;
    }
  }
}

export function parseEliVersionFile(versionFilePath: string): string {
  const contents = fs.readFileSync(versionFilePath).toString();
  return contents.trim();
}
