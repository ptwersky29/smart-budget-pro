# Deep Health Check - Smart Budget Pro

Comprehensive system health check that validates backend, frontend, infrastructure, and integration configuration for deployment readiness.

## Quick Start

### Run Complete Health Check
```bash
python deep_health_check.py
```

This runs all health checks and generates a detailed JSON report.

### Run Individual Checks
```bash
# Backend only
python backend_health_check.py

# Frontend only
python frontend_health_check.py

# Infrastructure & deployment
python infrastructure_health_check.py

# Integration & API compatibility
python integration_health_check.py
```

## What Gets Checked

### 🔧 Backend Health Check (`backend_health_check.py`)
Validates backend configuration and readiness:

1. **Environment Configuration**
   - ✓ Required environment variables (DATABASE_URL, JWT_SECRET, FRONTEND_URL)
   - ✓ Optional integration APIs (OpenRouter, Stripe, TrueLayer)
   - ✓ .env file presence and readability
   - ✓ JWT secret strength (≥32 chars recommended)
   - ✓ Database URL format

2. **File Structure**
   - ✓ Required files: `server.py`, `db.py`, `auth.py`, `requirements.txt`
   - ✓ Required directories: `tests/`

3. **Dependencies**
   - ✓ `requirements.txt` validity
   - ✓ Critical packages installed: fastapi, uvicorn, sqlalchemy, pydantic, asyncpg, bcrypt
   - ✓ Core module imports: db, auth, server, budget_system, jewish

4. **Database Connectivity**
   - ✓ PostgreSQL connection (if DATABASE_URL set)
   - ✓ Database schema verification (tables)
   - ℹ️ Connection pooling status

### 📱 Frontend Health Check (`frontend_health_check.py`)
Validates React app configuration:

1. **Package Configuration**
   - ✓ `package.json` validity
   - ✓ Required npm scripts: start, build, test
   - ✓ Critical dependencies: react, react-dom, react-router-dom, axios, tailwindcss
   - ✓ React version
   - ✓ `node_modules` installation status

2. **Build Configuration**
   - ✓ Tailwind CSS setup
   - ✓ PostCSS configuration
   - ✓ jsconfig.json and path aliases (@/*)
   - ✓ Vercel & Components configuration

3. **Project Structure**
   - ✓ Required directories: src/, src/components, src/pages, src/hooks, src/contexts, public/
   - ✓ Critical files: src/index.js, src/App.js, public/index.html
   - ✓ Component files count
   - ✓ Test file coverage

### 🚀 Infrastructure Check (`infrastructure_health_check.py`)
Validates deployment configuration:

1. **Render Deployment**
   - ✓ `render.yaml` validity
   - ✓ Service configuration
   - ✓ Environment variables
   - ✓ Health check endpoint

2. **Procfile**
   - ✓ Procfile presence and validity
   - ✓ Uvicorn/FastAPI start command

3. **Environment Variables**
   - ✓ Critical vars: DATABASE_URL, JWT_SECRET, FRONTEND_URL
   - ✓ Deployment vars: NODE_ENV, DEBUG, LOG_LEVEL
   - ✓ Integration APIs: OpenRouter, Stripe, TrueLayer, Google OAuth
   - ✓ Production environment setup

4. **CORS & Security**
   - ✓ CORS middleware configuration
   - ✓ Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
   - ✓ HTTPS redirect
   - ✓ CSRF protection

5. **API Endpoints**
   - ✓ Health check endpoint
   - ✓ Critical business endpoints

### 🔗 Integration Check (`integration_health_check.py`)
Validates frontend↔backend compatibility:

1. **Frontend API Client**
   - ✓ Axios/HTTP client configuration
   - ✓ Base URL configuration
   - ✓ Request interceptors (auth, error handling)

2. **Frontend Environment**
   - ✓ .env files present
   - ✓ Build system supports env vars
   - ✓ REACT_APP_BACKEND_URL configuration

3. **Backend API Configuration**
   - ✓ CORS allowed origins
   - ✓ API prefix (/api)
   - ✓ Error handling for JSON responses
   - ✓ Content-Type headers

4. **Endpoint Compatibility**
   - ✓ Backend endpoints defined
   - ✓ Frontend endpoints used
   - ✓ Compatibility matching

## Output Format

### Console Output
```
🏥 DEEP HEALTH CHECK - SMART BUDGET PRO
====================================================================================================

🔧 BACKEND HEALTH CHECK
1. ENVIRONMENT CONFIGURATION
   Required Vars: ✓ (3/3 present)
   .env File: ✓ File has 13 configuration lines
   
📱 FRONTEND HEALTH CHECK
1. PACKAGE CONFIGURATION
   package.json: ✓ Valid JSON
   node_modules: ⚠ Not found - run npm install
   
🚀 INFRASTRUCTURE & DEPLOYMENT CHECK
1. RENDER DEPLOYMENT CONFIGURATION
   render.yaml: ✓ Valid configuration

====================================================================================================
📋 FINAL SUMMARY
Overall Status: READY ✅
Duration: 3.56 seconds
```

### JSON Report
Generated as `health_check_report.json`:
```json
{
  "metadata": {
    "timestamp": "2026-06-08T15:55:01.036928",
    "duration_seconds": 3.56,
    "root_path": "..."
  },
  "backend": { ... },
  "frontend": { ... },
  "infrastructure": { ... },
  "integration": { ... },
  "summary": { ... }
}
```

## Status Indicators

- ✅ **READY** — All critical checks passed, system is deployment-ready
- ⚠️ **NEEDS ATTENTION** — Some warnings found, review recommended
- ❌ **FAILED** — Critical issues found, must fix before deployment

## Common Issues & Fixes

### ⚠️ "node_modules: Not found"
**Fix:** Run `npm install` in the frontend directory
```bash
cd frontend
npm install
```

### ❌ "DATABASE_URL: Invalid format"
**Expected:** `postgresql://user:pass@host:port/db` or `postgres://...`
**Fix:** Update DATABASE_URL in `.env` file with correct PostgreSQL connection string

### ❌ "No REACT_APP_BACKEND_URL env var"
**Fix:** Create `.env` file in frontend directory with:
```env
REACT_APP_BACKEND_URL=http://localhost:5000
```

### ⚠️ "CORS: 0 origins configured"
**Fix:** Verify CORS configuration in `backend/server.py` includes frontend URL

### ❌ "Critical Vars: Missing DATABASE_URL"
**Fix:** Add to `backend/.env`:
```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

## Environment Setup

### Required Environment Variables
```bash
# Backend (.env)
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key-here
FRONTEND_URL=http://localhost:3000

# Frontend (.env)
REACT_APP_BACKEND_URL=http://localhost:5000
```

### Optional Environment Variables
```bash
# AI & Analytics
OPENROUTER_API_KEY=...

# Payments
STRIPE_SECRET_KEY=...
STRIPE_PUBLISHABLE_KEY=...

# Banking
TRUELAYER_CLIENT_ID=...
TRUELAYER_CLIENT_SECRET=...

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## Pre-Deployment Checklist

Based on health check results:

- [ ] All required environment variables set
- [ ] Database connectivity working
- [ ] Frontend node_modules installed
- [ ] Build scripts verified (npm build works)
- [ ] CORS configured for frontend URL
- [ ] JWT_SECRET strength ≥32 chars
- [ ] API endpoints responding
- [ ] No critical dependency conflicts
- [ ] .env files configured for production
- [ ] render.yaml valid (if deploying to Render)

## Running Tests

The health check also validates test setup:

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

## Support

For detailed health check results, review the generated `health_check_report.json` file which contains:
- Detailed pass/fail status for each check
- Specific error messages
- Configuration details
- Recommendations

## Advanced Usage

### Custom Output Path
```bash
python deep_health_check.py --output /path/to/report.json
```

### Custom Project Path
```bash
python deep_health_check.py --path /path/to/smart-budget-pro
```

### Full Command
```bash
python deep_health_check.py --path . --output my_health_report.json
```

---

**Last Updated:** 2026-06-08
**Version:** 1.0.0
**Status:** ✅ Production Ready
