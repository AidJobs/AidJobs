# How to Generate INTERNAL_API_KEY

The `INTERNAL_API_KEY` is a **secret key you create yourself** to protect the internal API endpoints. It's not provided by the system - you must generate it.

## Quick Generation Methods

### Option 1: Python (Recommended)
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Example output:**
```
ZhS1CkdacZL_KrOd8Sa2my2jNVT6Jj6O0T0P-6Io0Ws
```

### Option 2: OpenSSL
```bash
openssl rand -hex 32
```

**Example output:**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

### Option 3: Online Generator
Use a secure random string generator (e.g., https://randomkeygen.com/) and choose a "CodeIgniter Encryption Keys" or similar.

## Setting the Key

### Local Development

1. Copy the generated key
2. Add to your `.env` file:
   ```bash
   INTERNAL_API_KEY=ZhS1CkdacZL_KrOd8Sa2my2jNVT6Jj6O0T0P-6Io0Ws
   ```

### Render (Production)

1. Go to your Render dashboard
2. Select your backend service
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Add:
   - **Key**: `INTERNAL_API_KEY`
   - **Value**: (paste your generated key)
6. Click **Save Changes**
7. Render will automatically redeploy

### Using the API

Once set, use the key in API requests:

```bash
curl -H "X-Internal-Api-Key: ZhS1CkdacZL_KrOd8Sa2my2jNVT6Jj6O0T0P-6Io0Ws" \
  https://your-backend.onrender.com/_internal/jobs
```

## Security Best Practices

1. **Use a strong random key** (at least 32 characters)
2. **Never commit the key to Git** (it's in `.env` which should be in `.gitignore`)
3. **Use different keys** for development and production
4. **Rotate the key** if it's ever exposed
5. **Store securely** - use environment variables, not hardcoded values

## Troubleshooting

### "Internal API not configured"
- The `INTERNAL_API_KEY` environment variable is not set
- Set it in your environment or Render dashboard

### "Invalid or missing internal API key"
- The key in your request header doesn't match the environment variable
- Check for typos or extra spaces
- Ensure you're using the header name: `X-Internal-Api-Key`

### Key Not Working After Setting
- Restart your application (Render redeploys automatically)
- Verify the key is set correctly: `echo $INTERNAL_API_KEY` (local) or check Render dashboard

