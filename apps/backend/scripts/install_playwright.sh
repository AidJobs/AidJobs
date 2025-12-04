#!/bin/bash
# Install Playwright browser binaries
# This script should be run after pip install -r requirements.txt

echo "Installing Playwright browser binaries..."
playwright install chromium
echo "Playwright installation complete!"

