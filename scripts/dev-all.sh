#!/usr/bin/env bash
set -euo pipefail

CHECK_ONLY=0
SKIP_INSTALL=0
SKIP_DOCKER=0

for arg in "$@"; do
  case "$arg" in
    --check-only) CHECK_ONLY=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-docker) SKIP_DOCKER=1 ;;
  esac
  shift || true
done

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LOGS_DIR="$ROOT_DIR/logs"
mkdir -p "$LOGS_DIR"

info() { echo "[INFO] $*"; }
warn() { echo "[WARN] $*"; }
err() { echo "[ERROR] $*"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

docker_start_hint() {
  local os
  os=$(uname -s)
  if [[ "$os" == "Darwin" ]]; then
    echo "open -a Docker"
    return
  fi
  if command_exists systemctl; then
    echo "sudo systemctl start docker"
  else
    echo "sudo service docker start"
  fi
}

ensure_brew() {
  if command_exists brew; then return 0; fi
  if [[ "$SKIP_INSTALL" -eq 1 || "$CHECK_ONLY" -eq 1 ]]; then
    err "Homebrew not found. Please install Homebrew first."
    exit 1
  fi
  warn "Homebrew not found. Installing Homebrew..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)"
}

install_with_brew() {
  ensure_brew
  brew install "$1"
}

install_with_apt() {
  sudo apt-get update -y
  sudo apt-get install -y "$@"
}

install_with_dnf() {
  sudo dnf install -y "$@"
}

install_with_yum() {
  sudo yum install -y "$@"
}

install_package() {
  local pkg="$1"
  local os=$(uname -s)
  if [[ "$os" == "Darwin" ]]; then
    install_with_brew "$pkg"
    return
  fi
  if command_exists apt-get; then
    install_with_apt "$pkg"
  elif command_exists dnf; then
    install_with_dnf "$pkg"
  elif command_exists yum; then
    install_with_yum "$pkg"
  else
    err "No supported package manager found (apt/dnf/yum)."
    exit 1
  fi
}

ensure_node() {
  if command_exists node && command_exists npm; then
    info "Node: $(node -v)"
    info "npm: $(npm -v)"
    return
  fi
  if [[ "$SKIP_INSTALL" -eq 1 || "$CHECK_ONLY" -eq 1 ]]; then
    err "Node/npm not found. Please install Node.js LTS."
    exit 1
  fi
  info "Installing Node.js..."
  install_package nodejs
  if ! command_exists node || ! command_exists npm; then
    err "Node install failed or PATH not updated. Restart terminal."
    exit 1
  fi
}

ensure_docker() {
  if [[ "$SKIP_DOCKER" -eq 1 ]]; then return; fi
  if ! command_exists docker; then
    if [[ "$SKIP_INSTALL" -eq 1 || "$CHECK_ONLY" -eq 1 ]]; then
      err "Docker not found. Please install Docker Desktop."
      exit 1
    fi
    info "Installing Docker..."
    install_package docker
  fi
  if ! docker info >/dev/null 2>&1; then
    warn "Docker daemon not running. Please start Docker Desktop/daemon and re-run."
    echo "Quick start: $(docker_start_hint)"
    exit 1
  fi
}

ensure_container() {
  local name="$1"; shift
  local run_args=("$@")
  if docker ps -a --format "{{.Names}}" | grep -q "^${name}$"; then
    local running
    running=$(docker inspect -f '{{.State.Running}}' "$name")
    if [[ "$running" != "true" ]]; then
      info "Starting container $name..."
      docker start "$name" >/dev/null
    else
      info "Container $name already running."
    fi
  else
    info "Creating container $name..."
    docker run "${run_args[@]}" >/dev/null
  fi
}

ensure_node

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  info "Environment check complete."
  exit 0
fi

ensure_docker
if [[ "$SKIP_DOCKER" -eq 0 ]]; then
  ensure_container "regpulse-postgres" --name regpulse-postgres -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=regpulse -p 5432:5432 -d pgvector/pgvector:pg16
  ensure_container "regpulse-redis" --name regpulse-redis -p 6379:6379 -d redis:7
fi

if [[ "$SKIP_INSTALL" -eq 0 && ! -d "$ROOT_DIR/node_modules" ]]; then
  info "Installing npm dependencies..."
  (cd "$ROOT_DIR" && npm install)
fi

info "Starting API and worker..."
(cd "$ROOT_DIR" && npm run dev:api > "$LOGS_DIR/api.log" 2> "$LOGS_DIR/api.err" & echo $! > "$LOGS_DIR/api.pid")
(cd "$ROOT_DIR" && npm run dev:worker > "$LOGS_DIR/worker.log" 2> "$LOGS_DIR/worker.err" & echo $! > "$LOGS_DIR/worker.pid")

cleanup() {
  if [[ -f "$LOGS_DIR/api.pid" ]]; then kill "$(cat "$LOGS_DIR/api.pid")" 2>/dev/null || true; fi
  if [[ -f "$LOGS_DIR/worker.pid" ]]; then kill "$(cat "$LOGS_DIR/worker.pid")" 2>/dev/null || true; fi
}
trap cleanup EXIT

info "Starting web dev server..."
(cd "$ROOT_DIR" && npm run dev)
