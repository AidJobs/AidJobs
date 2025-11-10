"""
Generate a random COOKIE_SECRET for admin session cookies.
Run this script to generate a secure random secret.
"""
import secrets

def generate_cookie_secret():
    """Generate a random COOKIE_SECRET"""
    secret = secrets.token_hex(32)
    print("="*60)
    print("COOKIE_SECRET Generator")
    print("="*60)
    print()
    print("Generated COOKIE_SECRET:")
    print(secret)
    print()
    print("="*60)
    print("Instructions")
    print("="*60)
    print()
    print("1. Copy the COOKIE_SECRET above")
    print("2. Go to Render Dashboard -> Your Backend Service -> Environment")
    print("3. Add environment variable:")
    print("   Name: COOKIE_SECRET")
    print(f"   Value: {secret}")
    print("4. Save and restart your backend service")
    print("5. Test admin login")
    print()
    print("="*60)
    return secret

if __name__ == "__main__":
    generate_cookie_secret()

