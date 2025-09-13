## quick deploy

aws s3 sync . s3://lotto.robstave.com/ \
 --delete

https://s3.us-west-1.amazonaws.com/lotto.robstave.com/index.html

## github actions deploy

create secrets in your GitHub repo

In GitHub → Settings → Secrets and variables → Actions:

AWS_ACCESS_KEY_ID — from an IAM user
AWS_SECRET_ACCESS_KEY — from the same IAM user
AWS_REGION — e.g. us-west-2
S3_BUCKET — lotto.robstave.com

IAM policy for the deploy user (attach to that IAM user):

{
"Version": "2012-10-17",
"Statement": [
{ "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::lotto.robstave.com" },
{ "Effect": "Allow", "Action": ["s3:PutObject","s3:DeleteObject","s3:PutObjectAcl"], "Resource": "arn:aws:s3:::lotto.robstave.com/\*" }
]
}

## mystic circle diagram

Open `mystic.html` in a browser to view a star-polygon chord diagram of randomly chosen numbers.
