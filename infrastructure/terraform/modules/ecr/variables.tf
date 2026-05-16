variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "services" {
  description = "List of service names to create ECR repos for"
  type        = list(string)
}

variable "tags" {
  type    = map(string)
  default = {}
}
