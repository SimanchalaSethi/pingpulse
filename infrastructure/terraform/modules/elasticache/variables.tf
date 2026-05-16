variable "project_name" { type = string }
variable "environment"  { type = string }
variable "vpc_id"       { type = string }
variable "subnet_ids"   { type = list(string) }

variable "allowed_security_group_ids" {
  type    = list(string)
  default = []
}

variable "node_type" {
  type    = string
  default = "cache.t3.micro"
}

variable "num_nodes" {
  type    = number
  default = 1
}

variable "tags" {
  type    = map(string)
  default = {}
}
