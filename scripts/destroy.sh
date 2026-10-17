#!/usr/bin/env bash
set -euo pipefail

read -r -p "Enter Azure subscription ID: " subscription_id

az group delete \
  --subscription "$subscription_id" \
  --name "rg-smh-aks-uk-dev"