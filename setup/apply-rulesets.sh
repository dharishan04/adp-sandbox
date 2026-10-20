#!/usr/bin/env bash
# Applies the three rulesets with your own gh login. Usage: setup/apply-rulesets.sh <owner/repo> <reviewer app id>
set -euo pipefail
repo=$1; rid=$2
for f in main epic spec-tags; do
  sed "s/\"REVIEWER_APP_ID\"/$rid/" "$(dirname "$0")/ruleset-$f.json" | gh api -X POST "repos/$repo/rulesets" --input - -q '.name + " → id " + (.id|tostring)'
done
