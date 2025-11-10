#!/usr/bin/env bash
# usage: ./bootstrap.sh [command]
export SCHEDULY_PROJECT_DRIVER="${SCHEDULY_PROJECT_DRIVER:-local}"
export SCHEDULY_API_BASE_URL="${SCHEDULY_API_BASE_URL:-}"
exec "$@"
