#!/bin/bash
# Nonla Desk — one-command installer for macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/devnonla/nonla-desk/main/scripts/install.sh | bash

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

APP_NAME="Nonla Desk"
REPO="devnonla/nonla-desk"
INSTALL_DIR="/Applications"

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}     Nonla Desk — macOS Installer      ${NC}"
echo -e "${BLUE}=======================================${NC}"
echo ""

# ─── OS Check ─────────────────────────────────────────────────────────────────
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo -e "${RED}Error: Nonla Desk is only available for macOS.${NC}"
  exit 1
fi

# ─── Fetch Latest Release ────────────────────────────────────────────────────
echo -e "${BOLD}Fetching latest release...${NC}"

RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")
VERSION=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

if [ -z "$VERSION" ]; then
  echo -e "${RED}Error: Could not determine latest version.${NC}"
  echo -e "${DIM}Check https://github.com/${REPO}/releases${NC}"
  exit 1
fi

echo -e "  Latest version: ${CYAN}${VERSION}${NC}"

# ─── Find DMG Asset ──────────────────────────────────────────────────────────
DMG_URL=$(echo "$RELEASE_JSON" | grep '"browser_download_url"' | grep '\.dmg"' | head -1 | sed 's/.*"\(https[^"]*\.dmg\)".*/\1/')

if [ -z "$DMG_URL" ]; then
  echo -e "${RED}Error: No .dmg file found in release ${VERSION}.${NC}"
  echo -e "${DIM}Download manually: https://github.com/${REPO}/releases/latest${NC}"
  exit 1
fi

DMG_NAME=$(basename "$DMG_URL")
TMP_DIR=$(mktemp -d)
DMG_PATH="${TMP_DIR}/${DMG_NAME}"

# ─── Download ────────────────────────────────────────────────────────────────
echo -e "${BOLD}Downloading ${DMG_NAME}...${NC}"
curl -fSL --progress-bar -o "$DMG_PATH" "$DMG_URL"
echo -e "${GREEN}Download complete.${NC}"

# ─── Install ─────────────────────────────────────────────────────────────────
echo -e "${BOLD}Installing ${APP_NAME}...${NC}"

# Mount the DMG
MOUNT_POINT=$(hdiutil attach "$DMG_PATH" -nobrowse 2>/dev/null | tail -1 | awk -F'\t' '{print $NF}')

if [ -z "$MOUNT_POINT" ]; then
  echo -e "${RED}Error: Failed to mount DMG.${NC}"
  rm -rf "$TMP_DIR"
  exit 1
fi

# Find the .app bundle
APP_PATH=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -type d | head -1)

if [ -z "$APP_PATH" ]; then
  echo -e "${RED}Error: No .app found in DMG.${NC}"
  hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null
  rm -rf "$TMP_DIR"
  exit 1
fi

APP_BASENAME=$(basename "$APP_PATH")

# Remove old version if exists
if [ -d "${INSTALL_DIR}/${APP_BASENAME}" ]; then
  echo -e "${DIM}  Removing previous installation...${NC}"
  rm -rf "${INSTALL_DIR}/${APP_BASENAME}"
fi

# Copy to /Applications
cp -R "$APP_PATH" "$INSTALL_DIR/"

# ─── Cleanup ─────────────────────────────────────────────────────────────────
hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null
rm -rf "$TMP_DIR"

# ─── Clear Quarantine ────────────────────────────────────────────────────────
xattr -cr "${INSTALL_DIR}/${APP_BASENAME}" 2>/dev/null || true

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}=======================================${NC}"
echo -e "${GREEN}  ✅ ${APP_NAME} ${VERSION} installed!  ${NC}"
echo -e "${GREEN}=======================================${NC}"
echo ""
echo -e "  Location: ${CYAN}${INSTALL_DIR}/${APP_BASENAME}${NC}"
echo -e "  Launch:   ${DIM}open -a \"${APP_NAME}\"${NC}"
echo ""
echo -e "${GREEN}Done! 🎉${NC}"
