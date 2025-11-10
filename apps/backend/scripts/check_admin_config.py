"""
Diagnostic script to check admin authentication configuration.
Helps debug admin password and session configuration issues.
"""
import os
import sys

def check_admin_config():
    """Check admin authentication configuration"""
    print("="*60)
    print("Admin Authentication Configuration Check")
    print("="*60)
    print()
    
    issues = []
    warnings = []
    
    # Check ADMIN_PASSWORD
    print("1. Checking ADMIN_PASSWORD...")
    admin_password = os.getenv("ADMIN_PASSWORD")
    if admin_password:
        print(f"   [PASS] ADMIN_PASSWORD is set")
        print(f"   [INFO] Length: {len(admin_password)} characters")
        if len(admin_password) < 8:
            warnings.append("ADMIN_PASSWORD is too short (recommend at least 16 characters)")
        if admin_password.strip() != admin_password:
            warnings.append("ADMIN_PASSWORD has leading/trailing whitespace")
    else:
        # Check for lowercase version
        admin_password_lower = os.getenv("admin_password")
        if admin_password_lower:
            issues.append("ADMIN_PASSWORD not found, but 'admin_password' (lowercase) exists. Rename to ADMIN_PASSWORD (uppercase)")
        else:
            issues.append("ADMIN_PASSWORD is not set")
    print()
    
    # Check COOKIE_SECRET or SESSION_SECRET
    print("2. Checking COOKIE_SECRET/SESSION_SECRET...")
    cookie_secret = os.getenv("COOKIE_SECRET")
    session_secret = os.getenv("SESSION_SECRET")
    if cookie_secret:
        print(f"   [PASS] COOKIE_SECRET is set")
        print(f"   [INFO] Length: {len(cookie_secret)} characters")
        if len(cookie_secret) < 32:
            warnings.append("COOKIE_SECRET is too short (recommend at least 32 characters)")
    elif session_secret:
        print(f"   [PASS] SESSION_SECRET is set (using as fallback)")
        print(f"   [INFO] Length: {len(session_secret)} characters")
        if len(session_secret) < 32:
            warnings.append("SESSION_SECRET is too short (recommend at least 32 characters)")
    else:
        issues.append("COOKIE_SECRET or SESSION_SECRET is not set (required for session cookies)")
    print()
    
    # Check AIDJOBS_ENV
    print("3. Checking AIDJOBS_ENV...")
    aidjobs_env = os.getenv("AIDJOBS_ENV", "").lower()
    if aidjobs_env:
        print(f"   [PASS] AIDJOBS_ENV is set: {aidjobs_env}")
        if aidjobs_env == "dev":
            warnings.append("Running in dev mode - authentication may be bypassed")
    else:
        print(f"   [WARN] AIDJOBS_ENV is not set (default: production)")
    print()
    
    # Check database connection
    print("4. Checking database configuration...")
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if db_url:
        print(f"   [PASS] Database URL is set")
        # Mask password in URL
        if "@" in db_url and ":" in db_url.split("@")[0]:
            masked_url = db_url.split("@")[0].split(":")[0] + ":***@" + "@".join(db_url.split("@")[1:])
            print(f"   [INFO] URL: {masked_url}")
    else:
        warnings.append("Database URL is not set (may be required for some features)")
    print()
    
    # Summary
    print("="*60)
    print("Summary")
    print("="*60)
    
    if issues:
        print("\n[FAIL] Issues found:")
        for issue in issues:
            print(f"   - {issue}")
    
    if warnings:
        print("\n[WARN] Warnings:")
        for warning in warnings:
            print(f"   - {warning}")
    
    if not issues and not warnings:
        print("\n[SUCCESS] All checks passed! Admin authentication should work.")
    elif not issues:
        print("\n[WARN] Configuration has warnings but should work.")
    else:
        print("\n[FAIL] Configuration has issues. Please fix them before testing.")
    
    print()
    print("="*60)
    print("Next Steps")
    print("="*60)
    
    if issues:
        print("\n1. Fix the issues listed above")
        print("2. Restart your backend service")
        print("3. Test admin login at /admin/login")
    else:
        print("\n1. Test admin login at /admin/login")
        print("2. If login fails, check Render logs for errors")
        print("3. Verify password is correct (no extra spaces)")
    
    print()
    
    return len(issues) == 0


if __name__ == "__main__":
    try:
        success = check_admin_config()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n[ERROR] Error running check: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

