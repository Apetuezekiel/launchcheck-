import type { CheckContext, ProjectContext } from '../../../types/index.js';
import { DefaultIgnoreMatcher } from '../../fs/ignore-matcher.js';
import { DefaultProjectFs } from '../../fs/project-fs.js';

const noop = (): void => undefined;

/** Builds a minimal ProjectContext rooted at `dir`, using the real fs layer. */
export function makeProjectContext(dir: string): ProjectContext {
  const ignore = new DefaultIgnoreMatcher(dir);
  return {
    projectDir: dir,
    gitRoot: null,
    packageJson: null,
    tsconfigJson: null,
    ignore,
    fs: new DefaultProjectFs(dir, ignore),
  };
}

/** Builds a minimal static-mode CheckContext around `project`. */
export function makeStaticContext(project: ProjectContext, signal?: AbortSignal): CheckContext {
  return {
    mode: 'static',
    project,
    live: null,
    config: {
      url: null,
      projectDir: project.projectDir,
      checkers: {},
      thresholds: {},
      checkerOptions: {},
      ignore: [],
    },
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    signal: signal ?? new AbortController().signal,
    meta: {
      runId: 'test',
      startedAt: new Date(),
      launchcheckVersion: '0.0.0',
      nodeVersion: process.version,
    },
  };
}
