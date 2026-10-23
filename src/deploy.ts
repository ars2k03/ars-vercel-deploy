import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface VercelDeployConfig {
  vercelToken: string;
  projectId: string;
  projectName: string;
  teamId?: string;
  githubUser: string;
  githubToken: string;
  githubRepoName: string;
  frontendDir: string;
}

export interface EnvVarItem {
  key: string;
  value: string;
}

export interface RemoteVercelEnv {
  id: string;
  key: string;
  value: string;
  target?: string[];
}

const VERCEL_API_BASE = 'https://api.vercel.com';
const DEPLOY_POLL_INTERVAL_MS = 5000;
const FAILED_DEPLOY_STATES = new Set(['ERROR', 'CANCELED']);
const SUCCESS_DEPLOY_STATES = new Set(['READY']);

// Defensive guard: never sync deploy tool credentials to Vercel environment
const DEPLOY_TOOL_KEYS = new Set([
  'VERCEL_TOKEN',
  'VERCEL_PROJECT_ID',
  'VERCEL_PROJECT_NAME',
  'VERCEL_TEAM_ID',
  'GITHUB_USER',
  'GITHUB_TOKEN',
  'GITHUB_REPO_NAME',
  'FRONTEND_DIR',
]);

const DIVIDER = '═══════════════════════════════════════════════════════════';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command: string, cwd: string): string {
  try {
    return execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error: any) {
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

async function vercelApi<T = any>(
  endpoint: string,
  token: string,
  teamId?: string,
  options: RequestInit = {},
): Promise<T> {
  const separator = endpoint.includes('?') ? '&' : '?';
  const teamParam = teamId ? `${separator}teamId=${encodeURIComponent(teamId)}` : '';
  const url = `${VERCEL_API_BASE}${endpoint}${teamParam}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vercel API Error [${response.status} ${response.statusText}]: ${errorText}`);
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function stripQuotes(value: string): string {
  const isQuoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  return isQuoted ? value.slice(1, -1) : value;
}

function parseEnvFile(filePath: string): EnvVarItem[] {
  if (!fs.existsSync(filePath)) return [];

  const vars: EnvVarItem[] = [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIdx = trimmed.indexOf('=');
    if (equalsIdx === -1) continue;

    const key = trimmed.slice(0, equalsIdx).trim();

    // Prevent credentials leak
    if (DEPLOY_TOOL_KEYS.has(key)) continue;

    const rawValue = stripQuotes(trimmed.slice(equalsIdx + 1).trim());
    vars.push({ key, value: rawValue });
  }

  return vars;
}

function loadEnvIntoProcess(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = stripQuotes(trimmed.slice(idx + 1).trim());
      if (!process.env[key] && val) {
        process.env[key] = val;
      }
    }
  }
}

function getCurrentBranch(cwd: string): string {
  try {
    return run('git rev-parse --abbrev-ref HEAD', cwd) || 'main';
  } catch {
    return 'main';
  }
}

function ensureAuthenticatedRemote(cwd: string, authRepoUrl: string): void {
  const currentRemote = run('git remote get-url origin', cwd);
  if (currentRemote !== authRepoUrl) {
    run(`git remote set-url origin "${authRepoUrl}"`, cwd);
  }
}

function getCodeStatus(cwd: string, branch: string): { uncommittedChanges: string; hasCodeChanged: boolean } {
  try {
    run(`git fetch origin ${branch} --quiet`, cwd);
  } catch {
    // ignore
  }

  const uncommittedChanges = run('git status --porcelain', cwd);
  const unpushedCommits = run(`git log origin/${branch}..HEAD --oneline`, cwd);

  return {
    uncommittedChanges,
    hasCodeChanged: Boolean(uncommittedChanges || unpushedCommits),
  };
}

function syncCodeToGitHub(cwd: string, branch: string, uncommittedChanges: string): void {
  if (uncommittedChanges) {
    console.log('  ➜ Detected uncommitted changes, committing...');
    run('git add .', cwd);
    const commitMsg = `deploy: auto-sync ${new Date().toISOString()}`;
    run(`git commit -m "${commitMsg}"`, cwd);
    console.log(`  ✓ Committed: ${commitMsg}`);
  }

  console.log(`  ➜ Pushing to GitHub origin/${branch}...`);
  run(`git push origin ${branch}`, cwd);
  console.log('  ✓ Code pushed to GitHub successfully (Vercel deployment auto-triggered).\n');
}

async function getProjectDetails(
  projectId: string,
  token: string,
  teamId?: string,
): Promise<{ id: string; name: string }> {
  const project = await vercelApi<{ id: string; name: string }>(
    `/v9/projects/${projectId}`,
    token,
    teamId,
  );
  return { id: project.id, name: project.name };
}

async function getRemoteEnvVars(
  projectId: string,
  token: string,
  teamId?: string,
): Promise<Map<string, { id: string; value: string }>> {
  const data = await vercelApi<{ envs?: RemoteVercelEnv[] }>(
    `/v9/projects/${projectId}/env`,
    token,
    teamId,
  );

  const envs = data.envs || [];
  const map = new Map<string, { id: string; value: string }>();

  for (const env of envs) {
    // Target production variables
    if (env.target?.includes('production')) {
      map.set(env.key, { id: env.id, value: env.value });
    }
  }

  return map;
}

function hasEnvDiff(
  localEnvVars: EnvVarItem[],
  remoteEnvMap: Map<string, { id: string; value: string }>,
): boolean {
  if (localEnvVars.length !== remoteEnvMap.size) return true;

  for (const { key, value } of localEnvVars) {
    const remote = remoteEnvMap.get(key);
    if (!remote || remote.value !== value) {
      return true;
    }
  }

  return false;
}

async function syncEnvVarsToVercel(
  projectId: string,
  token: string,
  teamId: string | undefined,
  localEnvVars: EnvVarItem[],
  remoteEnvMap: Map<string, { id: string; value: string }>,
): Promise<void> {
  // Delete existing production env vars to cleanly replace
  for (const [key, { id }] of remoteEnvMap.entries()) {
    await vercelApi(`/v9/projects/${projectId}/env/${id}`, token, teamId, {
      method: 'DELETE',
    });
  }

  // Create new environment variables for production, preview, development
  for (const { key, value } of localEnvVars) {
    await vercelApi(`/v10/projects/${projectId}/env`, token, teamId, {
      method: 'POST',
      body: JSON.stringify({
        key,
        value,
        target: ['production', 'preview', 'development'],
        type: 'plain',
      }),
    });
  }
}

async function triggerRedeploy(
  projectId: string,
  projectName: string,
  token: string,
  teamId: string | undefined,
  githubUser: string,
  githubRepoName: string,
  branch: string,
): Promise<void> {
  await vercelApi(`/v13/deployments`, token, teamId, {
    method: 'POST',
    body: JSON.stringify({
      name: projectName,
      project: projectId,
      target: 'production',
      gitSource: {
        type: 'github',
        org: githubUser,
        repo: githubRepoName,
        ref: branch,
      },
    }),
  });
}

async function monitorDeployment(
  projectId: string,
  projectName: string,
  token: string,
  teamId: string | undefined,
): Promise<void> {
  await sleep(4000);

  const deploysData = await vercelApi<{ deployments?: Array<{ uid: string }> }>(
    `/v6/deployments?projectId=${projectId}&limit=1`,
    token,
    teamId,
  );
  const latestDeploy = deploysData.deployments?.[0];

  const teamSlug = teamId || 'user';
  if (!latestDeploy) {
    console.log(`  ⚠️ Deployment triggered. Monitor at: https://vercel.com/${teamSlug}/${projectName}`);
    return;
  }

  const deployId = latestDeploy.uid;
  console.log(`  ✓ Tracking Deployment ID: ${deployId}`);

  const startTime = Date.now();
  let lastState = '';

  while (true) {
    const info = await vercelApi<{ readyState?: string; status?: string; url?: string }>(
      `/v13/deployments/${deployId}`,
      token,
      teamId,
    );
    const state = info.readyState || info.status || 'UNKNOWN';

    if (state !== lastState) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  ➜ Status: [${state}] (${elapsed}s elapsed)`);
      lastState = state;
    }

    if (SUCCESS_DEPLOY_STATES.has(state)) {
      const liveUrl = info.url ? `https://${info.url}` : `https://${projectName}.vercel.app`;
      console.log(`\n🎉 ${DIVIDER}`);
      console.log('✅ FRONTEND DEPLOYED SUCCESSFULLY TO VERCEL!');
      console.log(`🌐 Live URL     : ${liveUrl}`);
      console.log(`🌐 Canonical URL: https://${projectName}.vercel.app`);
      console.log(`${DIVIDER}\n`);
      return;
    }

    if (FAILED_DEPLOY_STATES.has(state)) {
      console.error(`\n❌ ${DIVIDER}`);
      console.error(`💥 Deployment ended with status: ${state}`);
      console.error(`Check build logs on Vercel: https://vercel.com/${teamSlug}/${projectName}/${deployId}`);
      console.error(`${DIVIDER}\n`);
      process.exit(1);
    }

    await sleep(DEPLOY_POLL_INTERVAL_MS);
  }
}

export async function runDeploy(rootDir = process.cwd()): Promise<void> {
  // 1. Load deployment credentials from .env
  const localEnvPath = path.join(rootDir, '.env');
  if (fs.existsSync(localEnvPath)) {
    loadEnvIntoProcess(localEnvPath);
  }

  // 2. Production variables come strictly from .env.vercel
  const rootVercelEnv = path.join(rootDir, '.env.vercel');
  const targetVercelEnvPath = fs.existsSync(rootVercelEnv)
    ? rootVercelEnv
    : path.join(rootDir, process.env.FRONTEND_DIR || '.', '.env.vercel');

  if (!fs.existsSync(targetVercelEnvPath)) {
    console.error(`\n❌ Error: .env.vercel file not found!`);
    console.error('All production application environment variables must be defined in .env.vercel.');
    console.error('Run "npx @ars2k03/vercel-deploy init" to create it.\n');
    process.exit(1);
  }

  const config: VercelDeployConfig = {
    vercelToken: process.env.VERCEL_TOKEN || '',
    projectId: process.env.VERCEL_PROJECT_ID || '',
    projectName: process.env.VERCEL_PROJECT_NAME || '',
    teamId: process.env.VERCEL_TEAM_ID || undefined,
    githubUser: process.env.GITHUB_USER || '',
    githubToken: process.env.GITHUB_TOKEN || '',
    githubRepoName: process.env.GITHUB_REPO_NAME || '',
    frontendDir: path.resolve(rootDir, process.env.FRONTEND_DIR || '.'),
  };

  const missing = [];
  if (!config.vercelToken) missing.push('VERCEL_TOKEN');
  if (!config.projectId) missing.push('VERCEL_PROJECT_ID');
  if (!config.projectName) missing.push('VERCEL_PROJECT_NAME');
  if (!config.githubUser) missing.push('GITHUB_USER');
  if (!config.githubToken) missing.push('GITHUB_TOKEN');
  if (!config.githubRepoName) missing.push('GITHUB_REPO_NAME');

  if (missing.length > 0) {
    console.error(`\n❌ Missing deployment credentials in .env: ${missing.join(', ')}`);
    console.error('Please configure your deployment keys in .env before deploying.\n');
    process.exit(1);
  }

  const githubAuthRepo = `https://${config.githubUser}:${config.githubToken}@github.com/${config.githubUser}/${config.githubRepoName}.git`;

  console.log(DIVIDER);
  console.log('🚀 Universal Smart 1-Click Vercel Cloud Deploy');
  console.log(`${DIVIDER}\n`);

  console.log('🌐 Connecting to Vercel API...');
  const { name: resolvedName } = await getProjectDetails(config.projectId, config.vercelToken, config.teamId);
  const projectName = config.projectName || resolvedName;
  console.log(`  ✓ Target Project: ${projectName} (${config.projectId})`);
  console.log(`  ✓ Canonical URL : https://${projectName}.vercel.app\n`);

  const branch = getCurrentBranch(config.frontendDir);
  console.log('🔍 Checking code status...');
  ensureAuthenticatedRemote(config.frontendDir, githubAuthRepo);
  const { uncommittedChanges, hasCodeChanged } = getCodeStatus(config.frontendDir, branch);

  console.log(`🔍 Checking production environment variables (${path.basename(targetVercelEnvPath)})...`);
  const productionEnvVars = parseEnvFile(targetVercelEnvPath);
  const remoteEnvMap = await getRemoteEnvVars(config.projectId, config.vercelToken, config.teamId);
  const hasEnvChanged = hasEnvDiff(productionEnvVars, remoteEnvMap);

  if (!hasCodeChanged && !hasEnvChanged) {
    const headCommit = run('git log -1 --format="%h - %s"', config.frontendDir);
    console.log('\n🟢 Everything is up to date! Nothing to deploy:');
    console.log(`   • Project : ${projectName}`);
    console.log(`   • Code    : Up to date (Branch: ${branch}, Commit: ${headCommit})`);
    console.log(`   • Env     : ${productionEnvVars.length} production variables match Vercel identically`);
    console.log(`   • Live URL: https://${projectName}.vercel.app`);
    console.log('\n✨ Skipping redundant deployment.\n');
    return;
  }

  console.log('\n⚡ Changes detected:');
  if (hasCodeChanged) console.log('   • Code changes detected (new commit / uncommitted files)');
  if (hasEnvChanged) console.log('   • Production environment variable changes detected');
  console.log('');

  // 1. Sync environment variables if changed
  if (hasEnvChanged) {
    console.log(`🔑 Step 1: Updating production environment variables on Vercel from ${path.basename(targetVercelEnvPath)}...`);
    await syncEnvVarsToVercel(config.projectId, config.vercelToken, config.teamId, productionEnvVars, remoteEnvMap);
    console.log(`  ✓ Synced ${productionEnvVars.length} production variables to Vercel.`);
    console.log('  ✓ Stale/removed keys automatically cleaned up.\n');
  } else {
    console.log('🔑 Step 1: Production environment variables on Vercel are already up to date.\n');
  }

  // 2. Sync code or trigger deployment
  if (hasCodeChanged) {
    console.log('📦 Step 2: Syncing code to GitHub...');
    syncCodeToGitHub(config.frontendDir, branch, uncommittedChanges);
  } else {
    console.log('📦 Step 2: Code is already up to date on GitHub. Triggering Vercel deployment for updated env...\n');
    await triggerRedeploy(
      config.projectId,
      projectName,
      config.vercelToken,
      config.teamId,
      config.githubUser,
      config.githubRepoName,
      branch,
    );
  }

  // 3. Monitor deployment in real-time
  console.log('👀 Step 3: Monitoring Vercel deployment in real-time...');
  await monitorDeployment(config.projectId, projectName, config.vercelToken, config.teamId);
}
