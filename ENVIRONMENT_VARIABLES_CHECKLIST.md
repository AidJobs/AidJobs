# Environment Variables Checklist

## Backend (Render) - Required Variables

### Admin Authentication
- [ ] `ADMIN_PASSWORD` - Admin login password (uppercase, exact password)
- [ ] `COOKIE_SECRET` - Random secret for session cookies (32+ characters)
  - OR `SESSION_SECRET` - Alternative to COOKIE_SECRET

### Database
- [ ] `SUPABASE_DB_URL` - PostgreSQL database connection URL
  - OR `DATABASE_URL` - Alternative database URL

### Meilisearch
- [ ] `MEILISEARCH_URL` - Meilisearch server URL
- [ ] `MEILISEARCH_KEY` - Meilisearch API key
  - OR (legacy):
  - [ ] `MEILI_HOST` - Meilisearch host
  - [ ] `MEILI_MASTER_KEY` - Meilisearch master key

### Application
- [ ] `AIDJOBS_ENV` - Environment (e.g., `production`, `dev`)
- [ ] `AIDJOBS_ENABLE_SEARCH` - Enable search (default: `true`)

### CORS (if needed)
- [ ] `CORS_ORIGINS` - Comma-separated list of allowed origins (optional)

## Frontend (Vercel) - Required Variables

### API Configuration
- [ ] `NEXT_PUBLIC_API_URL` - Backend API URL (e.g., `https://your-backend.onrender.com`)

### Application
- [ ] `NEXT_PUBLIC_AIDJOBS_ENV` - Environment (optional, default: `production`)

## Environment Variable Reference

### Backend Variables

#### `ADMIN_PASSWORD`
- **Required**: Yes
- **Description**: Admin login password
- **Format**: String (no spaces, case-sensitive)
- **Example**: `MySecurePassword123!`
- **Security**: Never commit to git, use strong password

#### `COOKIE_SECRET` or `SESSION_SECRET`
- **Required**: Yes
- **Description**: Secret for signing session cookies
- **Format**: Random hex string (32+ characters)
- **Example**: `a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456`
- **Generation**: `python -c "import secrets; print(secrets.token_hex(32))"`

#### `SUPABASE_DB_URL` or `DATABASE_URL`
- **Required**: Yes
- **Description**: PostgreSQL database connection URL
- **Format**: `postgresql://user:password@host:port/database`
- **Example**: `postgresql://user:pass@db.example.com:5432/aidjobs`

#### `MEILISEARCH_URL`
- **Required**: Yes (if search is enabled)
- **Description**: Meilisearch server URL
- **Format**: URL
- **Example**: `https://meilisearch.example.com`

#### `MEILISEARCH_KEY`
- **Required**: Yes (if search is enabled)
- **Description**: Meilisearch API key
- **Format**: String
- **Example**: `your-meilisearch-api-key`

#### `AIDJOBS_ENV`
- **Required**: Yes
- **Description**: Application environment
- **Format**: `production` or `dev`
- **Example**: `production`

#### `AIDJOBS_ENABLE_SEARCH`
- **Required**: No (default: `true`)
- **Description**: Enable search functionality
- **Format**: `true` or `false`
- **Example**: `true`

### Frontend Variables

#### `NEXT_PUBLIC_API_URL`
- **Required**: Yes
- **Description**: Backend API URL
- **Format**: URL
- **Example**: `https://your-backend.onrender.com`
- **Note**: Must start with `NEXT_PUBLIC_` to be accessible in browser

#### `NEXT_PUBLIC_AIDJOBS_ENV`
- **Required**: No (default: `production`)
- **Description**: Application environment
- **Format**: `production` or `dev`
- **Example**: `production`

## Setup Instructions

### Backend (Render)

1. **Go to Render Dashboard**
   - Navigate to your backend service
   - Click "Environment" tab

2. **Add Required Variables**
   - Click "Add Environment Variable"
   - Add each variable from the checklist above
   - Make sure variable names are correct (case-sensitive)
   - Make sure values are correct (no extra spaces)

3. **Generate Secrets**
   - For `COOKIE_SECRET`, generate a random secret:
     ```bash
     python -c "import secrets; print(secrets.token_hex(32))"
     ```

4. **Restart Service**
   - After adding variables, restart the service
   - Wait for deployment to complete

### Frontend (Vercel)

1. **Go to Vercel Dashboard**
   - Navigate to your project
   - Click "Settings" → "Environment Variables"

2. **Add Required Variables**
   - Click "Add New"
   - Add `NEXT_PUBLIC_API_URL` with your backend URL
   - Set for: Production, Preview, Development

3. **Redeploy**
   - After adding variables, redeploy the application
   - Or wait for next deployment

## Verification

### Backend Verification

1. **Check Environment Variables**
   - Go to Render dashboard → Your service → Environment
   - Verify all required variables are set
   - Verify variable names are correct (case-sensitive)
   - Verify values are correct (no extra spaces)

2. **Check Logs**
   - Go to Render dashboard → Your service → Logs
   - Look for configuration errors
   - Look for missing environment variable errors

3. **Test API**
   - Test health endpoint: `https://your-backend.onrender.com/api/healthz`
   - Should return 200 OK
   - Test capabilities: `https://your-backend.onrender.com/api/capabilities`
   - Should return capabilities object

### Frontend Verification

1. **Check Environment Variables**
   - Go to Vercel dashboard → Your project → Settings → Environment Variables
   - Verify `NEXT_PUBLIC_API_URL` is set
   - Verify it's set for correct environments

2. **Check Build Logs**
   - Go to Vercel dashboard → Your project → Deployments
   - Check latest deployment logs
   - Look for build errors

3. **Test Frontend**
   - Visit your frontend URL
   - Check browser console for errors
   - Check network tab for API calls

## Common Issues

### Issue: Environment variable not found
**Solution**: 
- Check variable name is correct (case-sensitive)
- Check variable is set in correct environment (Production/Preview/Development)
- Restart service after adding variable

### Issue: Variable value is incorrect
**Solution**:
- Check for extra spaces in value
- Check for hidden characters
- Copy-paste value to avoid typos

### Issue: Variable not accessible in code
**Solution**:
- Frontend variables must start with `NEXT_PUBLIC_`
- Backend variables are accessible via `os.getenv()`
- Restart service after adding variable

### Issue: Secret is too short
**Solution**:
- `COOKIE_SECRET` should be at least 32 characters
- Generate new secret: `python -c "import secrets; print(secrets.token_hex(32))"`

## Security Best Practices

1. **Never commit secrets to git**
   - Use `.env` files for local development (add to `.gitignore`)
   - Use environment variables for production
   - Never commit `.env` files

2. **Use strong passwords**
   - At least 16 characters
   - Mix of uppercase, lowercase, numbers, symbols
   - Don't use dictionary words

3. **Use random secrets**
   - Generate random secrets for `COOKIE_SECRET`
   - Use cryptographically secure random generators
   - Don't reuse secrets across services

4. **Rotate secrets periodically**
   - Rotate `COOKIE_SECRET` every 3-6 months
   - Rotate `ADMIN_PASSWORD` if compromised
   - Update all services when rotating secrets

5. **Limit access**
   - Only give access to trusted team members
   - Use different passwords for different environments
   - Don't share secrets in logs or error messages

## Quick Reference

### Backend (Render)
```bash
ADMIN_PASSWORD=your-password
COOKIE_SECRET=your-random-secret
SUPABASE_DB_URL=postgresql://user:pass@host:port/db
MEILISEARCH_URL=https://meilisearch.example.com
MEILISEARCH_KEY=your-api-key
AIDJOBS_ENV=production
```

### Frontend (Vercel)
```bash
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
NEXT_PUBLIC_AIDJOBS_ENV=production
```

## Next Steps

After setting up environment variables:
1. ✅ Verify all variables are set correctly
2. ✅ Test backend API endpoints
3. ✅ Test frontend application
4. ✅ Test admin login
5. ✅ Test API source creation
6. ✅ Continue with Phase 2 implementation

