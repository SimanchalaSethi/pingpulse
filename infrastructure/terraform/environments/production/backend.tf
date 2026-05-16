terraform {
  # Remote state — create the S3 bucket + DynamoDB table once before first apply:
  #   aws s3api create-bucket --bucket pingpulse-terraform-state --region ap-southeast-2 \
  #     --create-bucket-configuration LocationConstraint=ap-southeast-2
  #   aws s3api put-bucket-versioning --bucket pingpulse-terraform-state \
  #     --versioning-configuration Status=Enabled
  #   aws dynamodb create-table --table-name pingpulse-terraform-locks \
  #     --attribute-definitions AttributeName=LockID,AttributeType=S \
  #     --key-schema AttributeName=LockID,KeyType=HASH \
  #     --billing-mode PAY_PER_REQUEST --region ap-southeast-2
  backend "s3" {
    bucket         = "pingpulse-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "ap-southeast-2"
    dynamodb_table = "pingpulse-terraform-locks"
    encrypt        = true
  }
}
