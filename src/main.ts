import * as core from '@actions/core';
import * as io from '@actions/io';
import * as installer from './installer';
import cp from 'child_process';
import fs from 'fs';
import os from 'os';

export async function run() {
  try {
    //
    // versionSpec is optional.  If supplied, install / use from the tool cache
    // If not supplied then problem matchers will still be setup.  Useful for self-hosted.
    //
    const versionSpec = resolveVersionInput();

    core.info(`Setup eli version spec ${versionSpec}`);
    let arch = core.getInput('architecture');
    if (!arch) {
      arch = os.arch();
    }

    const installDir = await installer.getEli(versionSpec, arch);

    core.addPath(installDir);
    core.info(`Added eli to the path`);

    const eliPath = await io.which('eli');
    const eliVersion = (cp.execSync(`${eliPath} -v`) || versionSpec).toString();

    // output the version actually being used
    core.info(eliVersion);
    core.setOutput('eli-version', parseEliVersion(eliVersion));

    core.info(`Successfully set up eli version ${eliVersion}`);

    core.endGroup();
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

export function parseEliVersion(versionString: string): string {
  const regex = /eli (\d+\.\d+\.\d+)/;
  const match = versionString.match(regex);
  if (match) return match[1];
  throw new Error('Eli version not found');
}

function resolveVersionInput(): string {
  let version = core.getInput('eli-version');
  const versionFilePath = core.getInput('eli-version-file');

  if (version && versionFilePath) {
    core.warning(
      'Both eli-version and eli-version-file inputs are specified, only eli-version will be used'
    );
  }

  if (version) {
    return version;
  }

  if (versionFilePath) {
    if (!fs.existsSync(versionFilePath)) {
      throw new Error(
        `The specified eli version file at: ${versionFilePath} does not exist`
      );
    }
    version = installer.parseEliVersionFile(versionFilePath);
  }

  return version || 'latest';
}
