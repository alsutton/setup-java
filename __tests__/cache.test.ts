import {mkdtempSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
import {restore, save} from '../src/cache';
import * as fs from 'fs';
import * as os from 'os';
import * as core from '@actions/core';
import * as cache from '@actions/cache';
import * as glob from '@actions/glob';

describe('dependency cache', () => {
  const ORIGINAL_RUNNER_OS = process.env['RUNNER_OS'];
  const ORIGINAL_GITHUB_WORKSPACE = process.env['GITHUB_WORKSPACE'];
  const ORIGINAL_CWD = process.cwd();
  let workspace: string;
  let spyInfo: jest.SpyInstance<void, Parameters<typeof core.info>>;
  let spyWarning: jest.SpyInstance<void, Parameters<typeof core.warning>>;
  let spyDebug: jest.SpyInstance<void, Parameters<typeof core.debug>>;
  let spySaveState: jest.SpyInstance<void, Parameters<typeof core.saveState>>;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'setup-java-cache-'));
    switch (os.platform()) {
      case 'darwin':
        process.env['RUNNER_OS'] = 'macOS';
        break;
      case 'win32':
        process.env['RUNNER_OS'] = 'Windows';
        break;
      case 'linux':
        process.env['RUNNER_OS'] = 'Linux';
        break;
      default:
        throw new Error(`unknown platform: ${os.platform()}`);
    }
    process.chdir(workspace);
    // This hack is necessary because @actions/glob ignores files not in the GITHUB_WORKSPACE
    // https://git.io/Jcxig
    process.env['GITHUB_WORKSPACE'] = projectRoot(workspace);
  });

  beforeEach(() => {
    spyInfo = jest.spyOn(core, 'info');
    spyInfo.mockImplementation(() => null);

    spyWarning = jest.spyOn(core, 'warning');
    spyWarning.mockImplementation(() => null);

    spyDebug = jest.spyOn(core, 'debug');
    spyDebug.mockImplementation(() => null);

    spySaveState = jest.spyOn(core, 'saveState');
    spySaveState.mockImplementation(() => null);
  });

  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
    process.env['GITHUB_WORKSPACE'] = ORIGINAL_GITHUB_WORKSPACE;
    process.env['RUNNER_OS'] = ORIGINAL_RUNNER_OS;
    resetState();
  });

  describe('restore', () => {
    let spyCacheRestore: jest.SpyInstance<
      ReturnType<typeof cache.restoreCache>,
      Parameters<typeof cache.restoreCache>
    >;
    let spyGlobHashFiles: jest.SpyInstance<
      ReturnType<typeof glob.hashFiles>,
      Parameters<typeof glob.hashFiles>
    >;

    beforeEach(() => {
      spyCacheRestore = jest
        .spyOn(cache, 'restoreCache')
        .mockImplementation((paths: string[], primaryKey: string) =>
          Promise.resolve(undefined)
        );
      spyGlobHashFiles = jest.spyOn(glob, 'hashFiles');
      spyWarning.mockImplementation(() => null);
    });

    it('throws error if unsupported package manager specified', () => {
      return expect(restore('ant', '')).rejects.toThrow(
        'unknown package manager specified: ant'
      );
    });

    describe('for maven', () => {
      it('throws error if no pom.xml found', async () => {
        await expect(restore('maven', '')).rejects.toThrow(
          `No file in ${projectRoot(
            workspace
          )} matched to [**/pom.xml], make sure you have checked out the target repository`
        );
      });
      it('downloads cache', async () => {
        createFile(join(workspace, 'pom.xml'));

        await restore('maven', '');
        expect(spyCacheRestore).toHaveBeenCalled();
        expect(spyGlobHashFiles).toHaveBeenCalledWith('**/pom.xml');
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith('maven cache is not found');
      });
    });
    describe('for gradle', () => {
      it('throws error if no build.gradle found', async () => {
        await expect(restore('gradle', '')).rejects.toThrow(
          `No file in ${projectRoot(
            workspace
          )} matched to [**/*.gradle*,**/gradle-wrapper.properties,buildSrc/**/Versions.kt,buildSrc/**/Dependencies.kt,gradle/*.versions.toml,**/versions.properties], make sure you have checked out the target repository`
        );
      });
      it('downloads cache based on build.gradle', async () => {
        createFile(join(workspace, 'build.gradle'));

        await restore('gradle', '');
        expect(spyCacheRestore).toHaveBeenCalled();
        expect(spyGlobHashFiles).toHaveBeenCalledWith(
          '**/*.gradle*\n**/gradle-wrapper.properties\nbuildSrc/**/Versions.kt\nbuildSrc/**/Dependencies.kt\ngradle/*.versions.toml\n**/versions.properties'
        );
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith('gradle cache is not found');
      });
      it('downloads cache based on build.gradle.kts', async () => {
        createFile(join(workspace, 'build.gradle.kts'));

        await restore('gradle', '');
        expect(spyCacheRestore).toHaveBeenCalled();
        expect(spyGlobHashFiles).toHaveBeenCalledWith(
          '**/*.gradle*\n**/gradle-wrapper.properties\nbuildSrc/**/Versions.kt\nbuildSrc/**/Dependencies.kt\ngradle/*.versions.toml\n**/versions.properties'
        );
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith('gradle cache is not found');
      });
      it('downloads cache based on libs.versions.toml', async () => {
        createDirectory(join(workspace, 'gradle'));
        createFile(join(workspace, 'gradle', 'libs.versions.toml'));

        await restore('gradle', '');
        expect(spyCacheRestore).toHaveBeenCalled();
        expect(spyGlobHashFiles).toHaveBeenCalledWith(
          '**/*.gradle*\n**/gradle-wrapper.properties\nbuildSrc/**/Versions.kt\nbuildSrc/**/Dependencies.kt\ngradle/*.versions.toml\n**/versions.properties'
        );
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith('gradle cache is not found');
      });
      it('downloads cache based on buildSrc/Versions.kt', async () => {
        createDirectory(join(workspace, 'buildSrc'));
        createFile(join(workspace, 'buildSrc', 'Versions.kt'));

        await restore('gradle', '');
        expect(spyCacheRestore).toHaveBeenCalled();
        expect(spyGlobHashFiles).toHaveBeenCalledWith(
          '**/*.gradle*\n**/gradle-wrapper.properties\nbuildSrc/**/Versions.kt\nbuildSrc/**/Dependencies.kt\ngradle/*.versions.toml\n**/versions.properties'
        );
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith('gradle cache is not found');
      });
    });
    describe('for sbt', () => {
      it('throws error if no build.sbt found', async () => {
        await expect(restore('sbt', '')).rejects.toThrow(
          `No file in ${projectRoot(
            workspace
          )} matched to [**/*.sbt,**/project/build.properties,**/project/**.scala,**/project/**.sbt], make sure you have checked out the target repository`
        );
      });
      it('downloads cache', async () => {
        createFile(join(workspace, 'build.sbt'));

        await restore('sbt', '');
        expect(spyCacheRestore).toHaveBeenCalled();
        expect(spyGlobHashFiles).toHaveBeenCalledWith(
          '**/*.sbt\n**/project/build.properties\n**/project/**.scala\n**/project/**.sbt'
        );
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith('sbt cache is not found');
      });
      it('detects scala and sbt changes under **/project/ folder', async () => {
        createFile(join(workspace, 'build.sbt'));
        createDirectory(join(workspace, 'project'));
        createFile(join(workspace, 'project/DependenciesV1.scala'));

        await restore('sbt', '');
        const firstCall = spySaveState.mock.calls.toString();

        spySaveState.mockClear();
        await restore('sbt', '');
        const secondCall = spySaveState.mock.calls.toString();

        // Make sure multiple restores produce the same cache
        expect(firstCall).toBe(secondCall);

        spySaveState.mockClear();
        createFile(join(workspace, 'project/DependenciesV2.scala'));
        await restore('sbt', '');
        const thirdCall = spySaveState.mock.calls.toString();

        expect(firstCall).not.toBe(thirdCall);
      });
    });
    it('downloads cache based on versions.properties', async () => {
      createFile(join(workspace, 'versions.properties'));

      await restore('gradle', '');
      expect(spyCacheRestore).toHaveBeenCalled();
      expect(spyGlobHashFiles).toHaveBeenCalledWith(
        '**/*.gradle*\n**/gradle-wrapper.properties\nbuildSrc/**/Versions.kt\nbuildSrc/**/Dependencies.kt\ngradle/*.versions.toml\n**/versions.properties'
      );
      expect(spyWarning).not.toHaveBeenCalled();
      expect(spyInfo).toHaveBeenCalledWith('gradle cache is not found');
    });
    describe('cache-dependency-path', () => {
      it('throws error if no matching dependency file found', async () => {
        createFile(join(workspace, 'build.gradle.kts'));
        await expect(
          restore('gradle', 'sub-project/**/build.gradle.kts')
        ).rejects.toThrow(
          `No file in ${projectRoot(
            workspace
          )} matched to [sub-project/**/build.gradle.kts], make sure you have checked out the target repository`
        );
      });
      it('downloads cache based on the specified pattern', async () => {
        createFile(join(workspace, 'build.gradle.kts'));
        createDirectory(join(workspace, 'sub-project1'));
        createFile(join(workspace, 'sub-project1', 'build.gradle.kts'));
        createDirectory(join(workspace, 'sub-project2'));
        createFile(join(workspace, 'sub-project2', 'build.gradle.kts'));

        await restore('gradle', 'build.gradle.kts');
        expect(spyCacheRestore).toHaveBeenCalled();
        expect(spyGlobHashFiles).toHaveBeenCalledWith('build.gradle.kts');
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith('gradle cache is not found');

        await restore('gradle', 'sub-project1/**/*.gradle*\n');
        expect(spyCacheRestore).toHaveBeenCalled();
        expect(spyGlobHashFiles).toHaveBeenCalledWith(
          'sub-project1/**/*.gradle*'
        );
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith('gradle cache is not found');

        await restore('gradle', '*.gradle*\nsub-project2/**/*.gradle*\n');
        expect(spyCacheRestore).toHaveBeenCalled();
        expect(spyGlobHashFiles).toHaveBeenCalledWith(
          '*.gradle*\nsub-project2/**/*.gradle*'
        );
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith('gradle cache is not found');
      });
    });
  });
  describe('save', () => {
    let spyCacheSave: jest.SpyInstance<
      ReturnType<typeof cache.saveCache>,
      Parameters<typeof cache.saveCache>
    >;

    beforeEach(() => {
      spyCacheSave = jest
        .spyOn(cache, 'saveCache')
        .mockImplementation((paths: string[], key: string) =>
          Promise.resolve(0)
        );
      spyWarning.mockImplementation(() => null);
    });

    it('throws error if unsupported package manager specified', () => {
      return expect(save('ant', false)).rejects.toThrow(
        'unknown package manager specified: ant'
      );
    });

    it('save with -1 cacheId , should not fail workflow', async () => {
      spyCacheSave.mockImplementation(() => Promise.resolve(-1));
      createStateForMissingBuildFile();

      await save('maven', false);
      expect(spyCacheSave).toHaveBeenCalled();
      expect(spyWarning).not.toHaveBeenCalled();
      expect(spyInfo).toHaveBeenCalled();
      expect(spyInfo).toHaveBeenCalledWith(
        expect.stringMatching(/^Cache saved with the key:.*/)
      );
    });

    it('saves with error from toolkit, should fail workflow', async () => {
      spyCacheSave.mockImplementation(() =>
        Promise.reject(new cache.ValidationError('Validation failed'))
      );
      createStateForMissingBuildFile();

      expect.assertions(1);
      await expect(save('maven', false)).rejects.toEqual(
        new cache.ValidationError('Validation failed')
      );
    });

    describe('for maven', () => {
      it('uploads cache even if no pom.xml found', async () => {
        createStateForMissingBuildFile();
        await save('maven', false);
        expect(spyCacheSave).toHaveBeenCalled();
        expect(spyWarning).not.toHaveBeenCalled();
      });
      it('does not upload cache if no restore run before', async () => {
        createFile(join(workspace, 'pom.xml'));

        await save('maven', false);
        expect(spyCacheSave).not.toHaveBeenCalled();
        expect(spyWarning).toHaveBeenCalledWith(
          'Error retrieving key from state.'
        );
      });
      it('uploads cache', async () => {
        createFile(join(workspace, 'pom.xml'));
        createStateForSuccessfulRestore();

        await save('maven', false);
        expect(spyCacheSave).toHaveBeenCalled();
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith(
          expect.stringMatching(/^Cache saved with the key:.*/)
        );
      });
    });
    describe('for gradle', () => {
      it('uploads cache even if no build.gradle found', async () => {
        createStateForMissingBuildFile();

        await save('gradle', false);
        expect(spyCacheSave).toHaveBeenCalled();
        expect(spyWarning).not.toHaveBeenCalled();
      });
      it('does not upload cache if no restore run before', async () => {
        createFile(join(workspace, 'build.gradle'));

        await save('gradle', false);
        expect(spyCacheSave).not.toHaveBeenCalled();
        expect(spyWarning).toHaveBeenCalledWith(
          'Error retrieving key from state.'
        );
      });
      it('uploads cache based on build.gradle', async () => {
        createFile(join(workspace, 'build.gradle'));
        createStateForSuccessfulRestore();

        await save('gradle', false);
        expect(spyCacheSave).toHaveBeenCalled();
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith(
          expect.stringMatching(/^Cache saved with the key:.*/)
        );
      });
      it('uploads cache based on build.gradle.kts', async () => {
        createFile(join(workspace, 'build.gradle.kts'));
        createStateForSuccessfulRestore();

        await save('gradle', false);
        expect(spyCacheSave).toHaveBeenCalled();
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith(
          expect.stringMatching(/^Cache saved with the key:.*/)
        );
      });
      it('uploads cache based on buildSrc/Versions.kt', async () => {
        createDirectory(join(workspace, 'buildSrc'));
        createFile(join(workspace, 'buildSrc', 'Versions.kt'));
        createStateForSuccessfulRestore();

        await save('gradle');
        expect(spyCacheSave).toHaveBeenCalled();
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith(
          expect.stringMatching(/^Cache saved with the key:.*/)
        );
      });
    });
    describe('for sbt', () => {
      it('uploads cache even if no build.sbt found', async () => {
        createStateForMissingBuildFile();
        await save('sbt', false);
        expect(spyCacheSave).toHaveBeenCalled();
        expect(spyWarning).not.toHaveBeenCalled();
      });
      it('does not upload cache if no restore run before', async () => {
        createFile(join(workspace, 'build.sbt'));

        await save('sbt', false);
        expect(spyCacheSave).not.toHaveBeenCalled();
        expect(spyWarning).toHaveBeenCalledWith(
          'Error retrieving key from state.'
        );
      });
      it('uploads cache', async () => {
        createFile(join(workspace, 'build.sbt'));
        createStateForSuccessfulRestore();

        await save('sbt', false);
        expect(spyCacheSave).toHaveBeenCalled();
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith(
          expect.stringMatching(/^Cache saved with the key:.*/)
        );
      });
      it('uploads cache based on versions.properties', async () => {
        createFile(join(workspace, 'versions.properties'));
        createStateForSuccessfulRestore();

        await save('gradle', false);
        expect(spyCacheSave).toHaveBeenCalled();
        expect(spyWarning).not.toHaveBeenCalled();
        expect(spyInfo).toHaveBeenCalledWith(
          expect.stringMatching(/^Cache saved with the key:.*/)
        );
      });
    });
  });
});

function resetState() {
  jest.spyOn(core, 'getState').mockReset();
}

/**
 * Create states to emulate a restore process without build file.
 */
function createStateForMissingBuildFile() {
  jest.spyOn(core, 'getState').mockImplementation(name => {
    switch (name) {
      case 'cache-primary-key':
        return 'setup-java-cache-';
      default:
        return '';
    }
  });
}

/**
 * Create states to emulate a successful restore process.
 */
function createStateForSuccessfulRestore() {
  jest.spyOn(core, 'getState').mockImplementation(name => {
    switch (name) {
      case 'cache-primary-key':
        return 'setup-java-cache-primary-key';
      case 'cache-matched-key':
        return 'setup-java-cache-matched-key';
      default:
        return '';
    }
  });
}

function createFile(path: string) {
  core.info(`created a file at ${path}`);
  fs.writeFileSync(path, '');
}

function createDirectory(path: string) {
  core.info(`created a directory at ${path}`);
  fs.mkdirSync(path);
}

function projectRoot(workspace: string): string {
  if (os.platform() === 'darwin') {
    return `/private${workspace}`;
  } else {
    return workspace;
  }
}
