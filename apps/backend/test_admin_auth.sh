#!/bin/bash

# Test admin authentication system
# Usage: ADMIN_PASSWORD=yourpass COOKIE_SECRET=yoursecret bash test_admin_auth.sh

set -e

BASE_URL="http://localhost:8000"
COOKIE_FILE="/tmp/admin_auth_test_cookies.txt"

echo "=== Admin Authentication Test Suite ==="
echo

# Test 1: Session endpoint without auth
echo "Test 1: GET /api/admin/session (unauthenticated)"
curl -s "$BASE_URL/api/admin/session" | python3 -m json.tool
echo

# Test 2: Login with wrong password
echo "Test 2: POST /api/admin/login (wrong password)"
curl -s -X POST "$BASE_URL/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"wrongpassword"}' | python3 -m json.tool
echo

# Test 3: Login with correct password
echo "Test 3: POST /api/admin/login (correct password)"
if [ -z "$ADMIN_PASSWORD" ]; then
  echo "ERROR: ADMIN_PASSWORD not set"
  exit 1
fi

curl -s -X POST "$BASE_URL/api/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$ADMIN_PASSWORD\"}" \
  -c "$COOKIE_FILE" | python3 -m json.tool
echo

# Test 4: Session endpoint with auth cookie
echo "Test 4: GET /api/admin/session (with cookie)"
curl -s "$BASE_URL/api/admin/session" -b "$COOKIE_FILE" | python3 -m json.tool
echo

# Test 5: Protected route with auth cookie
echo "Test 5: GET /admin/crawl/status (with cookie)"
curl -s "$BASE_URL/admin/crawl/status" -b "$COOKIE_FILE" | python3 -m json.tool
echo

# Test 6: Logout
echo "Test 6: POST /api/admin/logout"
curl -s -X POST "$BASE_URL/api/admin/logout" -b "$COOKIE_FILE" -c "$COOKIE_FILE" | python3 -m json.tool
echo

# Test 7: Session after logout
echo "Test 7: GET /api/admin/session (after logout)"
curl -s "$BASE_URL/api/admin/session" -b "$COOKIE_FILE" | python3 -m json.tool
echo

# Test 8: Dev bypass header
echo "Test 8: GET /admin/crawl/status (with X-Dev-Bypass: 1)"
curl -s "$BASE_URL/admin/crawl/status" -H "X-Dev-Bypass: 1" | python3 -m json.tool
echo

# Cleanup
rm -f "$COOKIE_FILE"

echo "=== Tests Complete ==="
