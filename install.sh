#!/usr/bin/env bash
set -euo pipefail

REPO="GNITOAHC/collab-editor"
BINARY="collab-editor"

# Detect OS and architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)  OS="linux" ;;
  Darwin) OS="darwin" ;;
  *)
    echo "Unsupported OS: $OS"
    echo "Supported: Linux (x86_64, aarch64), macOS (Apple Silicon)"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64)   ARCH="x86_64" ;;
  aarch64|arm64)  ARCH="aarch64" ;;
  *)
    echo "Unsupported architecture: $ARCH"
    echo "Supported: x86_64, aarch64"
    exit 1
    ;;
esac

# Only macOS Apple Silicon is released — refuse Intel macOS early.
if [ "$OS" = "darwin" ] && [ "$ARCH" != "aarch64" ]; then
  echo "macOS release is only built for Apple Silicon (aarch64)."
  echo "Detected: darwin-${ARCH}"
  exit 1
fi

ASSET="${BINARY}-${OS}-${ARCH}.tar.gz"

# Prompt for install directory.
# When invoked via `curl ... | bash`, stdin is the script itself, so we must
# read from the controlling terminal — otherwise `read` consumes the next line
# of the script as the user's answer.
DEFAULT_DIR="$HOME/.local/bin"
if [ -t 0 ]; then
  read -rp "Install directory [${DEFAULT_DIR}]: " INSTALL_DIR
elif [ -r /dev/tty ]; then
  read -rp "Install directory [${DEFAULT_DIR}]: " INSTALL_DIR < /dev/tty
else
  echo "No interactive terminal; using default install directory."
  INSTALL_DIR=""
fi
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_DIR}"

mkdir -p "$INSTALL_DIR"

# Fetch latest release download URL
echo "Fetching latest release..."
DOWNLOAD_URL="$(
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep -o "\"browser_download_url\": *\"[^\"]*${ASSET}\"" \
    | grep -o 'https://[^"]*'
)"

if [ -z "$DOWNLOAD_URL" ]; then
  echo "Could not find release asset: ${ASSET}"
  exit 1
fi

echo "Downloading ${ASSET}..."
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "$DOWNLOAD_URL" -o "${TMP_DIR}/${ASSET}"
tar -xzf "${TMP_DIR}/${ASSET}" -C "$TMP_DIR"
mv "${TMP_DIR}/${BINARY}-${OS}-${ARCH}" "${INSTALL_DIR}/${BINARY}"
chmod +x "${INSTALL_DIR}/${BINARY}"

echo "Installed ${BINARY} to ${INSTALL_DIR}/${BINARY}"

# Warn if install dir is not on PATH
case ":$PATH:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    echo ""
    echo "Note: ${INSTALL_DIR} is not in your PATH."
    echo "Add this to your shell profile:"
    echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
    ;;
esac
