#!/usr/bin/env node

import { runInit } from './init.js';
import { runDeploy } from './deploy.js';

const command = process.argv[2];

if (command === 'init') {
  runInit().catch((err: any) => {
    console.error('\n❌ Init Failed:', err.message);
    process.exit(1);
  });
} else if (command === '--help' || command === '-h') {
  console.log(`
🚀 @ars2k03/vercel-deploy CLI

Usage:
  npx @ars2k03/vercel-deploy init     Initialize .gitignore, .env.vercel, and .env template
  npx @ars2k03/vercel-deploy          Deploy your frontend to Vercel with 1-click
  npx @ars2k03/vercel-deploy --help   Show this help message
`);
} else {
  runDeploy().catch((err: any) => {
    console.error('\n❌ Deployment Script Error:', err.message);
    process.exit(1);
  });
}
