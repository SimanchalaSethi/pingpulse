variable "project_name"  { type = string }
variable "environment"   { type = string }
variable "service_name"  { type = string }
variable "database_name" { type = string }
variable "vpc_id"        { type = string }
variable "subnet_ids"    { type = list(string) }

variable "allowed_security_group_ids" {
  type    = list(string)
  default = []
}

variable "instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "skip_final_snapshot" {
  type    = bool
  default = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
