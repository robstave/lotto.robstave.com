# lotto.robstave.com

Tiny static site that generates California SuperLotto Plus numbers with a bit of flair (sparkles, bouncing balls, and a very serious cat).

Preview (S3 object URL):
- https://s3.us-west-1.amazonaws.com/lotto.robstave.com/index.html

---

## Quick start (local)
- No build required. Open `index.html` directly in your browser.
- Optional: run a simple static server while editing to avoid caching quirks.

---

## Quick deploy to S3
Prereqs:
- AWS CLI installed and configured with an IAM user that can write to `s3://lotto.robstave.com`
- Bucket created; public-read/website or CloudFront configured

PowerShell (Windows):
```powershell
# From repository root
aws s3 sync . s3://lotto.robstave.com --delete --exclude ".git/*" --exclude ".github/*"
```

Bash (macOS/Linux):
```bash
aws s3 sync . s3://lotto.robstave.com --delete --exclude ".git/*" --exclude ".github/*"
```

Notes:
- `--delete` removes files in the bucket that no longer exist locally.
- If hosting directly from S3 (no CloudFront), ensure the bucket policy allows public reads for objects or adjust Public Access Blocks accordingly.

---

## GitHub Actions deploy (optional)
Create repository secrets (GitHub → Settings → Secrets and variables → Actions):
- `AWS_ACCESS_KEY_ID` — from an IAM user
- `AWS_SECRET_ACCESS_KEY` — from the same IAM user
- `AWS_REGION` — e.g. `us-west-1`
- `S3_BUCKET` — `lotto.robstave.com`

Example workflow (`.github/workflows/deploy.yml`):
```yaml
name: Deploy to S3
on:
  push:
    branches: [ main ]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
      - name: Sync to S3
        run: |
          aws s3 sync . s3://${{ secrets.S3_BUCKET }} --delete --exclude ".git/*" --exclude ".github/*"
```
Tip: Consider GitHub OIDC with a role in AWS for short-lived credentials instead of long-lived access keys.

---

## Minimal IAM policy for deploy user
Attach something like this to the IAM user/role used by CI or local deploys (adjust bucket name/region as needed):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::lotto.robstave.com"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:PutObjectAcl"],
      "Resource": "arn:aws:s3:::lotto.robstave.com/*"
    }
  ]
}
```

---

## Mystic circle diagram
The main demo (`index.html`) renders a star‑polygon chord diagram beneath the generated numbers.
