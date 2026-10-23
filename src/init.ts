import fs from 'node:fs';
import path from 'node:path';

const VERCEL_DEPLOY_KEYS = [
  { key: 'VERCEL_TOKEN', comment: 'Vercel Dashboard -> Account Settings -> Tokens', defaultValue: '' },
  { key: 'VERCEL_PROJECT_ID', comment: 'Vercel Project Settings -> General -> Project ID (prj_...)', defaultValue: '' },
  { key: 'VERCEL_PROJECT_NAME', comment: 'Vercel Project Name (e.g. my-frontend)', defaultValue: '' },
  { key: 'VERCEL_TEAM_ID', comment: 'Vercel Team ID if under a Team (team_...), leave empty if personal account', defaultValue: '' },
  { key: 'GITHUB_USER', comment: 'Your GitHub username or organization', defaultValue: '' },
  { key: 'GITHUB_TOKEN', comment: 'GitHub Personal Access Token (repo scope)', defaultValue: '' },
  { key: 'GITHUB_REPO_NAME', comment: 'GitHub repository name', defaultValue: '' },
];

const GITIGNORE_ENTRIES = ['.env', '.env.vercel', '.env.local', '.env.*.local'];

export async function runInit(targetDir = process.cwd()): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('⚙️  Initializing Vercel Deployment Configuration');
  console.log('═══════════════════════════════════════════════════════════\n');

  const envPath = path.join(targetDir, '.env');
  const vercelEnvPath = path.join(targetDir, '.env.vercel');
  const gitignorePath = path.join(targetDir, '.gitignore');
  const pkgPath = path.join(targetDir, 'package.json');

  // 1. .gitignore handling (protect both .env and .env.vercel)
  let gitignoreContent = '';
  if (fs.existsSync(gitignorePath)) {
    gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  }

  const missingGitignore = GITIGNORE_ENTRIES.filter((entry) => {
    const regex = new RegExp(`^${entry.replace('.', '\\.')}\\b`, 'm');
    return !regex.test(gitignoreContent);
  });

  if (missingGitignore.length > 0) {
    const appendText = (gitignoreContent.endsWith('\n') || gitignoreContent === '' ? '' : '\n') +
      '\n# Secrets and deployment env\n' +
      missingGitignore.join('\n') +
      '\n';
    fs.appendFileSync(gitignorePath, appendText, 'utf-8');
    console.log(`✓ Updated .gitignore (added: ${missingGitignore.join(', ')})`);
  } else {
    console.log('✓ .gitignore already has environment files protected');
  }

  // 2. SMART AUTO-CLONE: If .env.vercel does not exist, clone existing .env into .env.vercel FIRST
  if (!fs.existsSync(vercelEnvPath)) {
    if (fs.existsSync(envPath)) {
      const existingEnvContent = fs.readFileSync(envPath, 'utf-8');
      const header =
        '# ─── Production Environment Variables (Synced to Vercel) ───\n' +
        '# Auto-cloned from your existing .env file.\n' +
        '# Update any production-specific values (e.g. NEXT_PUBLIC_API_URL) below.\n\n';
      fs.writeFileSync(vercelEnvPath, header + existingEnvContent, 'utf-8');
      console.log('✓ Auto-created .env.vercel by cloning your existing .env variables (Zero manual copy-paste!)');
    } else {
      const defaultVercelEnv =
        '# ─── Production Environment Variables (Synced to Vercel) ───\n' +
        'NODE_ENV=production\n' +
        '# NEXT_PUBLIC_API_URL=https://api.yourdomain.com\n';
      fs.writeFileSync(vercelEnvPath, defaultVercelEnv, 'utf-8');
      console.log('✓ Created clean .env.vercel template for production variables');
    }
  } else {
    console.log('✓ .env.vercel already exists');
  }

  // 3. .env handling: Append deployment tool credentials to .env
  let envContent = '';
  const existingEnvKeys = new Set<string>();

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        existingEnvKeys.add(trimmed.slice(0, idx).trim());
      }
    }
  }

  const missingDeployKeys = VERCEL_DEPLOY_KEYS.filter((item) => !existingEnvKeys.has(item.key));

  if (missingDeployKeys.length > 0) {
    let appendEnv = envContent.endsWith('\n') || envContent === '' ? '' : '\n';
    appendEnv += '\n# ─── Vercel Deployment Tool Credentials ────────────────────\n';
    for (const { key, comment, defaultValue } of missingDeployKeys) {
      appendEnv += `# ${comment}\n${key}=${defaultValue ?? ''}\n`;
    }
    fs.appendFileSync(envPath, appendEnv, 'utf-8');
    console.log(`✓ Added ${missingDeployKeys.length} deployment tool keys to .env`);
  } else {
    console.log('✓ .env already has all deployment tool keys');
  }

  // 4. package.json script handling (Always set "deploy": "npx @ars2k03/vercel-deploy")
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      pkg.scripts = pkg.scripts || {};
      pkg.scripts.deploy = 'npx @ars2k03/vercel-deploy';
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
      console.log('✓ Configured "deploy": "npx @ars2k03/vercel-deploy" in package.json scripts');
    } catch {
      // ignore
    }
  }

  console.log('\n🎉 Initialization complete!');
  console.log('👉 Next steps:');
  console.log('   1. Fill your Vercel deployment credentials at the bottom of .env');
  console.log('   2. Verify your production variables in .env.vercel');
  console.log('   3. Run: npm run deploy\n');
}
