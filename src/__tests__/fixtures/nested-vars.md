# Document with Nested Variables

## Simple Variables

{{name}}
{{age}}

## Nested Variables

{{user.name}}
{{user.email}}
{{user.address.city}}

## Deep Nesting

{{config.database.host}}
{{config.database.port}}

## Mixed Content

Hello {{user.name}}, your order {{order.id}} is ready.
