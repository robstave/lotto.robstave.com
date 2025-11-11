# Deployment Guide

## CloudFront Cache Issue

If the deployed site doesn't reflect your latest changes, it's likely due to CloudFront caching.

### Automatic Solution
The deployment workflow now automatically invalidates CloudFront cache after each deployment.

### Manual CloudFront Cache Invalidation

If you need to manually clear the cache:

```bash
# Using AWS CLI
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

Or via AWS Console:
1. Go to CloudFront console
2. Select your distribution
3. Go to "Invalidations" tab
4. Click "Create Invalidation"
5. Enter `/*` as the path
6. Click "Create Invalidation"

### Browser Cache

Users may also need to hard refresh their browser:
- **Windows/Linux**: `Ctrl + Shift + R` or `Ctrl + F5`
- **Mac**: `Cmd + Shift + R`

## Deployment Process

1. Push changes to `main` branch
2. GitHub Actions automatically:
   - Syncs files to S3
   - Sets appropriate cache headers
   - Invalidates CloudFront cache
3. Changes should be live within 1-2 minutes

## Required GitHub Secrets

Ensure these secrets are configured in your repository:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET`
- `CLOUDFRONT_DISTRIBUTION_ID` *(new - required for cache invalidation)*

## Cache Control Settings

- **HTML/JS/CSS files**: 5 minutes (`max-age=300, must-revalidate`)
- **Other assets** (images, etc.): 1 hour (`max-age=3600`)

This ensures quick updates for code while caching static assets longer.
