import * as core from '@actions/core';
import * as io from '@actions/io';
import * as tc from '@actions/tool-cache';
import fs, {chmod} from 'fs';
import cp from 'child_process';
import osm from 'os';
import path from 'path';
import * as main from '../src/main';
import * as im from '../src/installer';
import {commonOrdered} from './data/available-releases.json';
import {getArch} from '../src/system';

const win32Join = path.win32.join;
const posixJoin = path.posix.join;

describe('setup-eli', () => {
  let inputs = {} as any;
  let os = {} as any;

  let inSpy: jest.SpyInstance;
  let getBooleanInputSpy: jest.SpyInstance;
  let exportVarSpy: jest.SpyInstance;
  let findSpy: jest.SpyInstance;
  let cnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let platSpy: jest.SpyInstance;
  let archSpy: jest.SpyInstance;
  let joinSpy: jest.SpyInstance;
  let dlSpy: jest.SpyInstance;
  let cacheSpy: jest.SpyInstance;
  let dbgSpy: jest.SpyInstance;
  let whichSpy: jest.SpyInstance;
  let existsSpy: jest.SpyInstance;
  let readFileSpy: jest.SpyInstance;
  let renameFileSpy: jest.SpyInstance;
  let chmodSpy: jest.SpyInstance;
  let mkdirSpy: jest.SpyInstance;
  let execSpy: jest.SpyInstance;
  let getAvailableVersionsSpy: jest.SpyInstance;

  beforeAll(async () => {
    process.env['GITHUB_ENV'] = ''; // Stub out Environment file functionality so we can verify it writes to standard out (toolkit is backwards compatible)
  }, 100000);

  beforeEach(() => {
    process.env['GITHUB_PATH'] = ''; // Stub out ENV file functionality so we can verify it writes to standard out

    // @actions/core
    inputs = {};
    inSpy = jest.spyOn(core, 'getInput');
    inSpy.mockImplementation(name => inputs[name]);
    getBooleanInputSpy = jest.spyOn(core, 'getBooleanInput');
    getBooleanInputSpy.mockImplementation(name => inputs[name]);
    exportVarSpy = jest.spyOn(core, 'exportVariable');

    // node
    os = {};
    platSpy = jest.spyOn(osm, 'platform');
    platSpy.mockImplementation(() => os['platform']);
    archSpy = jest.spyOn(osm, 'arch');
    archSpy.mockImplementation(() => os['arch']);
    execSpy = jest.spyOn(cp, 'execSync');

    // switch path join behaviour based on set os.platform
    joinSpy = jest.spyOn(path, 'join');
    joinSpy.mockImplementation((...paths: string[]): string => {
      if (os['platform'] == 'win32') {
        return win32Join(...paths);
      }

      return posixJoin(...paths);
    });

    // @actions/tool-cache
    findSpy = jest.spyOn(tc, 'find');
    dlSpy = jest.spyOn(tc, 'downloadTool');
    cacheSpy = jest.spyOn(tc, 'cacheDir');
    //getSpy = jest.spyOn(im, 'getVersionsDist');
    getAvailableVersionsSpy = jest.spyOn(im, 'getAvailableVersions');

    // io
    whichSpy = jest.spyOn(io, 'which');
    existsSpy = jest.spyOn(fs, 'existsSync');
    readFileSpy = jest.spyOn(fs, 'readFileSync');
    renameFileSpy = jest.spyOn(fs, 'renameSync');
    mkdirSpy = jest.spyOn(fs, 'mkdirSync');
    chmodSpy = jest.spyOn(fs, 'chmodSync');
    chmodSpy.mockImplementation(() => {});

    // writes
    cnSpy = jest.spyOn(process.stdout, 'write');
    logSpy = jest.spyOn(core, 'info');
    dbgSpy = jest.spyOn(core, 'debug');
    cnSpy.mockImplementation(line => {
      // uncomment to debug
      // process.stderr.write('write:' + line + '\n');
    });
    logSpy.mockImplementation(line => {
      // uncomment to debug
      // process.stderr.write('log:' + line + '\n');
    });
    dbgSpy.mockImplementation(msg => {
      // uncomment to see debug output
      // process.stderr.write(msg + '\n');
    });
  });

  afterEach(() => {
    //jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  }, 100000);

  it('can extract the major.minor.patch version from a given eli version string', async () => {
    const eliVersionOutput =
      'Lua 5.4.4  Copyright (C) 1994-2022 Lua.org, PUC-Rio\neli 0.29.1  Copyright (C) 2019-2023 alis.is';
    expect(main.parseEliVersion(eliVersionOutput)).toBe('0.29.1');
  });

  it('finds latest patch version for minor version spec', async () => {
    os.platform = 'linux';
    os.arch = 'x64';

    getAvailableVersionsSpy.mockResolvedValue(commonOrdered);

    const match: im.IEliVersion | undefined = await im.findMatch('0.29');
    expect(match).toBeDefined();
    const version: string = match ? match.version : '';
    expect(version).toBe('0.29.2');
    const fileName = match ? match.files[0].filename : '';
    expect(fileName).toBe('eli-linux-x86_64');
  });

  it('finds latest patch version for caret version spec', async () => {
    os.platform = 'linux';
    os.arch = 'x64';
    getAvailableVersionsSpy.mockResolvedValue(commonOrdered);
    // spec: ^0.29.0 => 0.29.2
    const match: im.IEliVersion | undefined = await im.findMatch('^0.29.0');
    expect(match).toBeDefined();
    const version: string = match ? match.version : '';
    expect(version).toBe('0.29.2');
    const fileName = match ? match.files[0].filename : '';
    expect(fileName).toBe('eli-linux-x86_64');
  });

  it('finds latest version for major version spec', async () => {
    os.platform = 'win32';
    os.arch = 'x64';

    getAvailableVersionsSpy.mockResolvedValue(commonOrdered);
    // spec: 0 => 0.29.2 (latest)
    const match: im.IEliVersion | undefined = await im.findMatch('0');
    expect(match).toBeDefined();
    const version: string = match ? match.version : '';
    expect(version).toBe('0.29.2');
    const fileName = match ? match.files[0].filename : '';
    expect(fileName).toBe('eli-windows-x86_64.exe');
  });

  it('evaluates with input', async () => {
    inputs['eli-version'] = '0.29.0';

    const toolPath = path.normalize('/cache/eli/0.29.0/x64');
    findSpy.mockImplementation(() => toolPath);
    execSpy.mockImplementation(() => '0.29.0');
    await main.run();

    expect(logSpy).toHaveBeenCalledWith(`Setup eli version spec 0.29.0`);
  });

  it('finds a version of eli already in the cache', async () => {
    inputs['eli-version'] = '0.29.0';

    const toolPath = path.normalize('/cache/eli/0.29.0/x86_64');
    findSpy.mockImplementation(() => toolPath);
    execSpy.mockImplementation(() => '0.29.0');
    await main.run();

    expect(logSpy).toHaveBeenCalledWith(`Found in cache @ ${toolPath}`);
  });

  it('finds a version in the cache and adds it to the path', async () => {
    inputs['eli-version'] = '0.29.2';
    const toolPath = path.normalize('/cache/eli/0.29.2/x64');
    findSpy.mockImplementation(() => toolPath);
    execSpy.mockImplementation(() => '0.29.2');
    await main.run();

    expect(cnSpy).toHaveBeenCalledWith(`::add-path::${toolPath}${osm.EOL}`);
  });

  it('handles unhandled error and reports error', async () => {
    const errMsg = 'unhandled error message';
    inputs['eli-version'] = '0.29.0';

    findSpy.mockImplementation(() => {
      throw new Error(errMsg);
    });
    await main.run();
    expect(cnSpy).toHaveBeenCalledWith('::error::' + errMsg + osm.EOL);
  });

  it('downloads a version not in the cache', async () => {
    os.platform = 'linux';
    os.arch = 'x64';

    inputs['eli-version'] = '0.29.0';
    findSpy.mockImplementation(() => '');
    dlSpy.mockImplementation(() => '/some/temp/path');
    const toolPath = path.normalize('/cache/eli/0.29.0/x64');
    cacheSpy.mockImplementation(() => toolPath);
    renameFileSpy.mockImplementation(() => '/some/temp/eli');
    execSpy.mockImplementation(() => '0.29.0');
    mkdirSpy.mockImplementation(() => {});

    await main.run();

    expect(dlSpy).toHaveBeenCalled();
    expect(cnSpy).toHaveBeenCalledWith(`::add-path::${toolPath}${osm.EOL}`);
  });

  it('downloads a version not in the cache (windows)', async () => {
    os.platform = 'win32';
    os.arch = 'x64';

    inputs['eli-version'] = '0.29.1';
    process.env['RUNNER_TEMP'] = 'C:\\temp\\';

    findSpy.mockImplementation(() => '');
    dlSpy.mockImplementation(() => 'C:\\temp\\some\\path');
    renameFileSpy.mockImplementation(() => 'C:\\temp\\some\\eli');

    const toolPath = path.normalize('C:\\cache\\eli\\0.29.1\\x64');
    cacheSpy.mockImplementation(() => toolPath);
    execSpy.mockImplementation(() => '0.29.1');
    await main.run();

    expect(dlSpy).toHaveBeenCalledWith(
      'https://github.com/alis-is/eli/releases/download/0.29.1/eli-windows-x86_64.exe',
      'C:\\temp\\eli-windows-x86_64.exe',
      undefined
    );
    expect(cnSpy).toHaveBeenCalledWith(`::add-path::${toolPath}${osm.EOL}`);
  });

  it('does not find a version that does not exist', async () => {
    os.platform = 'linux';
    os.arch = 'x64';

    inputs['eli-version'] = '9.99.9';

    findSpy.mockImplementation(() => '');
    await main.run();

    expect(cnSpy).toHaveBeenCalledWith(
      `::error::Unable to find eli version '9.99.9' for platform linux and architecture x64.${osm.EOL}`
    );
  });

  it('download version from eli dist', async () => {
    os.platform = 'linux';
    os.arch = 'x64';

    const versionSpec = '0.29.0';

    inputs['eli-version'] = versionSpec;
    inputs['token'] = 'faketoken';

    // ... but not in the local cache
    findSpy.mockImplementation(() => '');

    dlSpy.mockImplementation(async () => '/some/temp/path');
    const toolPath = path.normalize('/cache/eli/0.29.0/x64');
    renameFileSpy.mockImplementation(() => {});
    cacheSpy.mockImplementation(async () => toolPath);
    execSpy.mockImplementation(() => '0.29.0');
    mkdirSpy.mockImplementation(() => {});
    await main.run();

    expect(logSpy).toHaveBeenCalledWith('Setup eli version spec 0.29.0');
    expect(findSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Attempting to download 0.29.0-x64...');
    expect(dlSpy).toHaveBeenCalled();

    expect(logSpy).toHaveBeenCalledWith(`Install from dist`);
    expect(logSpy).toHaveBeenCalledWith(`Added eli to the path`);
    expect(cnSpy).toHaveBeenCalledWith(`::add-path::${toolPath}${osm.EOL}`);
  });

  it('reports a failed download', async () => {
    const errMsg = 'unhandled download message';
    os.platform = 'linux';
    os.arch = 'x64';

    inputs['eli-version'] = '0.29.0';

    findSpy.mockImplementation(() => '');
    dlSpy.mockImplementation(() => {
      throw new Error(errMsg);
    });
    execSpy.mockImplementation(() => '0.29.0');
    await main.run();

    expect(cnSpy).toHaveBeenCalledWith(
      `::error::Failed to download version 0.29.0: Error: ${errMsg}${osm.EOL}`
    );
  });

  describe('eli-version-file', () => {
    const eliVersionFileContents = `0.29.1
      `;

    it('reads version from .eli-version', async () => {
      os.platform = 'linux';
      os.arch = 'x64';

      inputs['eli-version'] = undefined;
      inputs['eli-version-file'] = '.eli-version';

      existsSpy.mockImplementation(() => true);
      readFileSpy.mockImplementation(() => Buffer.from(eliVersionFileContents));
      findSpy.mockImplementation(() => '');
      dlSpy.mockImplementation(() => '/some/temp/path');
      const toolPath = path.normalize('/cache/eli/0.29.1/x64');
      cacheSpy.mockImplementation(() => toolPath);
      renameFileSpy.mockImplementation(() => '/some/temp/eli');
      execSpy.mockImplementation(() => '0.29.1');
      await main.run();

      expect(logSpy).toHaveBeenCalledWith('Setup eli version spec 0.29.1');
      expect(logSpy).toHaveBeenCalledWith(
        'Attempting to download 0.29.1-x64...'
      );
    });

    it('is overwritten by eli-version', async () => {
      os.platform = 'linux';
      os.arch = 'x64';

      inputs['eli-version'] = `0.29.0`;
      inputs['eli-version-file'] = '.eli-version';

      existsSpy.mockImplementation(() => true);
      readFileSpy.mockImplementation(() => Buffer.from(eliVersionFileContents));
      findSpy.mockImplementation(() => '');
      dlSpy.mockImplementation(() => '/some/temp/path');
      const toolPath = path.normalize('/cache/eli/0.29.0/x64');
      cacheSpy.mockImplementation(() => toolPath);
      renameFileSpy.mockImplementation(() => '/some/temp/eli');
      execSpy.mockImplementation(() => '0.29.0');
      await main.run();

      expect(logSpy).toHaveBeenCalledWith('Setup eli version spec 0.29.0');
      expect(logSpy).toHaveBeenCalledWith(
        'Attempting to download 0.29.0-x64...'
      );
    });

    it('reports a read failure', async () => {
      os.platform = 'linux';
      os.arch = 'x64';

      inputs['eli-version'] = undefined;
      inputs['eli-version-file'] = '.eli-version';

      existsSpy.mockImplementation(() => true);
      readFileSpy.mockImplementation(() => Buffer.from(eliVersionFileContents));
      findSpy.mockImplementation(() => '');
      dlSpy.mockImplementation(() => '/some/temp/path');
      const toolPath = path.normalize('/cache/eli/0.29.0/x64');
      cacheSpy.mockImplementation(() => toolPath);
      renameFileSpy.mockImplementation(() => '/some/temp/eli');
      existsSpy.mockImplementation(() => false);

      await main.run();

      expect(cnSpy).toHaveBeenCalledWith(
        `::error::The specified eli version file at: .eli-version does not exist${osm.EOL}`
      );
    });

    it('acquires specified architecture of eli', async () => {
      for (const {arch, version, osSpec} of [
        {arch: 'x64', version: '0.29.1', osSpec: 'linux'},
        {arch: 'riscv64', version: '0.29.1', osSpec: 'linux'}
      ]) {
        os.platform = osSpec;
        os.arch = arch;

        const fileExtension = os.platform === 'win32' ? '.exe' : '';
        const platform = os.platform === 'win32' ? 'windows' : os.platform;

        inputs['eli-version'] = version;
        inputs['architecture'] = arch;

        const expectedUrl = `https://github.com/alis-is/eli/releases/download/${version}/eli-${platform}-${getArch(
          arch
        )}${fileExtension}`;

        // ... but not in the local cache
        findSpy.mockImplementation(() => '');

        dlSpy.mockImplementation(async () => '/some/temp/path');
        renameFileSpy.mockImplementation(() => {});
        cacheSpy.mockImplementation(async () => '');
        execSpy.mockImplementation(() => `eli ${version}`);
        await main.run();

        expect(logSpy).toHaveBeenCalledWith(
          `Acquiring ${version} from ${expectedUrl}`
        );
      }
    }, 100000);
  });
});
