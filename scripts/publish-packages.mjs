import { execFileSync } from 'node:child_process';
import { checkRelease } from './check-release.mjs';

// This script is deliberately restricted to the tag-triggered OIDC workflow.
if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF_TYPE !== 'tag' || !process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
  throw new Error('Run publishing through the tag-triggered GitHub Actions workflow.');
}

const version = await checkRelease();
for (const name of ['core', 'assets', 'react']) {
  const spec = `@mcgui/${name}@${version}`;
  let published;
  try {
    published = JSON.parse(execFileSync('npm', ['view', spec, 'version', '--json', '--prefer-online'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (error) {
    // Only a genuinely absent version is publishable. Auth/network errors stop the job.
    let response;
    try { response = JSON.parse(String(error.stdout)); } catch { throw error; }
    if (!['E404', 'ETARGET'].includes(response.error?.code)) throw error;
  }
  if (published === version) {
    console.log(`${spec} already exists; skipping. Published versions are immutable.`);
    continue;
  }
  if (published !== undefined) throw new Error(`Unexpected registry response for ${spec}`);
  execFileSync('npm', ['publish', '--workspace', `@mcgui/${name}`, '--access', 'public', '--provenance'], { stdio: 'inherit' });
}
