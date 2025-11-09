# AWS Lambda in this repo

This folder holds Lambda-related code, but it is NOT deployed by the S3 website workflow.

- Frontend deploy: `.github/workflows/deploy.yml` syncs only `frontend/` to S3.
- Lambda code: lives under `aws/lambda/` and can be deployed manually now; CI/CD can be added later.

## Structure

- `aws/lambda/functions/` — individual Lambda functions (one folder per function)
- `aws/lambda/shared/` — shared helper modules reused by functions
- `aws/lambda/template.yaml` — optional AWS SAM template to define infrastructure (Lambda + permissions). You can ignore this if you deploy manually.

## Manual deployment (now)

You can zip the function folder and upload it in the AWS Console (or via AWS CLI). For example, to package the `storePick` function:

1. Change into the function directory:
   - `cd aws/lambda/functions/storePick`
2. Install dependencies (if any):
   - `npm ci` (or `npm install`)
3. Create a zip of the handler and node_modules:
   - `Compress-Archive -Path index.mjs, package.json, node_modules -DestinationPath storePick.zip` (PowerShell)
4. Upload the ZIP to the Lambda function in the AWS Console.

## Future CI/CD (later)

You can add a separate GitHub Actions workflow under `.github/workflows/lambda-deploy.yml` that:

- Triggers on `workflow_dispatch` (manual run) or on changes to `aws/lambda/**`
- Uses `aws-actions/configure-aws-credentials`
- Zips and updates each function via `aws lambda update-function-code`

A starter workflow is provided (commented) when you’re ready.
