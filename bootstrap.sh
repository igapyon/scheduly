#!/usr/bin/env bash
# usage: ./bootstrap.sh [command]
export SCHEDULY_API_BASE_URL="${SCHEDULY_API_BASE_URL:-}"
exec "$@"
