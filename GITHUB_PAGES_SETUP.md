# GitHub Pages Deployment Setup

This project has been configured for deployment to GitHub Pages. Follow these steps to launch it:

## Prerequisites
- GitHub account with a repository
- Node.js installed locally

## Setup Steps

### 1. Update the Repository Name in Configuration
The `vite.config.ts` is configured with a base path of `/pixel-budget-quest/`. If your repository has a different name, update it:

```typescript
const base = isGithubPages ? '/your-repo-name/' : '/';
```

Or if deploying from a user/org page (e.g., `username.github.io`), set it to:
```typescript
const base = isGithubPages ? '/' : '/';
```

### 2. Enable GitHub Pages in Repository Settings
1. Go to your repository settings on GitHub
2. Navigate to **Pages** (in the left sidebar)
3. Under "Build and deployment":
   - **Source**: Select "GitHub Actions"
   - This allows the workflow to deploy automatically

### 3. Deploy
The project is configured with a GitHub Actions workflow that will:
- Automatically trigger on push to the `main` branch
- Build the project with `npm run build`
- Deploy the `dist` folder to GitHub Pages

Just push your changes to `main`:
```bash
git add .
git commit -m "Setup GitHub Pages deployment"
git push origin main
```

### 4. Monitor Deployment
- Go to your repository on GitHub
- Click on the **Actions** tab
- Watch the "Deploy to GitHub Pages" workflow run
- Once complete, your site will be live at:
  - `https://username.github.io/pixel-budget-quest/` (project page)
  - `https://username.github.io/` (user/org page if configured)

## Local Testing
Build and preview locally before pushing:
```bash
GITHUB_PAGES=true npm run build
npm run preview
```

## Troubleshooting

### Routes Not Working
The app uses client-side routing with TanStack Router. GitHub Pages will serve the app correctly.

### Assets Not Loading
If assets fail to load, check that:
1. The `base` path in `vite.config.ts` matches your deployment path
2. The repository name in the config matches your actual repository name

### Build Fails
1. Check the Actions tab for detailed error logs
2. Ensure all dependencies are installed: `npm install`
3. Verify the build works locally: `GITHUB_PAGES=true npm run build`

## Additional Notes
- The app is configured as a Client-Side Rendered (CSR) application for GitHub Pages
- Server-side rendering features from TanStack Start are not used in this deployment
- For an SSR version, consider using Vercel, Netlify, or Cloudflare Pages instead
