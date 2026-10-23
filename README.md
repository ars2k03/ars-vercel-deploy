<div align="center">

# 🚀 @ars2k03/vercel-deploy

**Smart, Zero-Config 1-Click Cloud Deployment for Vercel**  
*Automate Git synchronization, production environment variable diffing, and real-time deployment monitoring with a single command.*

[![npm version](https://img.shields.io/npm/v/@ars2k03/vercel-deploy.svg?color=0070f3&style=flat-square)](https://www.npmjs.com/package/@ars2k03/vercel-deploy)
[![GitHub Repository](https://img.shields.io/badge/GitHub-ars--vercel--deploy-181717?style=flat-square&logo=github)](https://github.com/ars2k03/ars-vercel-deploy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178C6.svg?style=flat-square)](https://www.typescriptlang.org)

**Repository:** [https://github.com/ars2k03/ars-vercel-deploy](https://github.com/ars2k03/ars-vercel-deploy)

</div>

---

## 💡 Why `@ars2k03/vercel-deploy`?

Deploying Next.js, React, or modern frontend applications to Vercel usually involves repetitive friction:
- Manually staging, committing, and pushing code to GitHub every time you make a change.
- Navigating the Vercel dashboard to copy-paste environment variables one by one.
- Accidentally leaking personal tokens or deployment keys into production environments.
- Triggering redundant, slow rebuilds when nothing actually changed.

**`@ars2k03/vercel-deploy` solves all of this.** It turns your entire Vercel deployment pipeline into a single, intelligent command: `npm run deploy`.

---

## ⚡ Quick Start (No Install Needed!)

### Step 1: Initialize in your project

Open a terminal in your frontend project root and run:

```bash
npx @ars2k03/vercel-deploy init
```

> **✨ What `init` automatically does in 1 second:**  
> 1. **Smart Auto-Clones** your existing `.env` variables into `.env.vercel` (zero manual copy-pasting!).
> 2. Appends deployment credential placeholders at the bottom of your `.env`.
> 3. Protects `.env`, `.env.vercel`, and `.env.local` in `.gitignore`.
> 4. Automatically configures `"deploy": "npx @ars2k03/vercel-deploy"` in your `package.json` scripts.

---

### Step 2: Configure Credentials

#### 1. In your local `.env` (Deployment Credentials)
Scroll to the bottom of your `.env` file and fill in your deployment keys:

```env
# ─── Vercel Deployment Tool Credentials ────────────────────
# Vercel Dashboard -> Account Settings -> Tokens
VERCEL_TOKEN=vcp_yourVercelApiToken

# Vercel Project Settings -> General -> Project ID (prj_...)
VERCEL_PROJECT_ID=prj_yourProjectId

# Vercel Project Name (e.g. my-frontend)
VERCEL_PROJECT_NAME=my-frontend

# Vercel Team ID if under a Team (team_...), leave empty if personal account
VERCEL_TEAM_ID=team_yourTeamId

# GitHub Credentials
GITHUB_USER=yourGithubUsername
GITHUB_TOKEN=ghp_yourGithubPersonalAccessToken
GITHUB_REPO_NAME=your-repo-name
```

#### 2. In your `.env.vercel` (Production App Variables)
Your existing app variables are already auto-cloned here! Simply update any values that differ in production (like your backend API URL):

```env
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

---

### Step 3: Deploy!

```bash
npm run deploy
```

That's it! Your code will sync to GitHub, production variables will update on Vercel, and you'll see a live build progress tracker directly in your terminal.

---

## 🧠 Clean Architecture: Two Files, Zero Confusion

| File | Purpose | Synced to Vercel? |
| :--- | :--- | :---: |
| **`.env`** | Local development variables + **Deployment tool credentials** (`VERCEL_TOKEN`, `GITHUB_TOKEN`, etc.) | ❌ **Never** (stays strictly on your machine) |
| **`.env.vercel`** | **100% Pure Production Application Variables** (`NEXT_PUBLIC_API_URL`, etc.) | ✅ **Yes** (synced directly to Vercel project) |

> 🔒 **Security Guarantee:** Your `GITHUB_TOKEN` and `VERCEL_TOKEN` are strictly kept in your local `.env` and will **never** be uploaded to Vercel's application environment.

---

## ✨ Core Features

### 1. 🔄 Smart Auto Git Sync
Automatically inspects your local repository status:
- Detects uncommitted changes and unpushed commits on your active branch.
- Stages, commits, and pushes directly to GitHub using your secure authenticated token remote.
- Seamlessly triggers Vercel's native deployment workflow.

### 2. ⚡ Intelligent Change Detection (Zero Wasted Builds)
Before running a deploy, `@ars2k03/vercel-deploy` checks both code changes and Vercel remote environment variables:
- **No changes found?** Exits immediately with a green status and your live URL. No redundant builds!
- **Only environment variables changed?** Syncs the new variables and triggers a direct Vercel redeploy via API without requiring empty Git commits.
- **Code changed?** Pushes to GitHub and tracks the new build in real-time.

### 3. 🔑 Automatic Environment Variable Diff & Sync
- Reads your `.env.vercel` file.
- Fetches all active variables from Vercel's project API.
- Compares them and automatically applies updates and deletes obsolete/stale keys.
- Sets targets to `production`, `preview`, and `development`.

### 4. 📊 Live Real-Time Terminal Progress
No need to open the browser:
- Streams deployment state directly into your terminal: `[BUILDING]`, `[DEPLOYING]`, `[READY]`.
- Prints your live deployment URL and canonical project URL upon completion.
- Catches build errors instantly with direct links to the Vercel build log.

---

## 🛠️ CLI Options

```bash
# Initialize project setup and files
npx @ars2k03/vercel-deploy init

# Run smart 1-click deploy
npx @ars2k03/vercel-deploy

# Or after running init:
npm run deploy

# Show help
npx @ars2k03/vercel-deploy --help
```

---

## 📄 License

MIT © [ars2k03](https://github.com/ars2k03)
