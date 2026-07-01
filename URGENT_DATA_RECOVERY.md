# URGENT: Data Recovery Steps

**Issue:** Data not visible after login  
**Root Cause:** Backend still connected to wrong/empty database  
**Status:** Needs manual intervention

---

## 🚨 IMMEDIATE ACTION REQUIRED

### Step 1: Check Render Deployment Status

1. Go to https://dashboard.render.com
2. Click on your `financeai-api` service
3. Check the "Events" tab - look for latest deployment
4. **Current commit on Render:** `17a2c91` (OLD - needs update)
5. **Latest commit in GitHub:** `fc95711` (has database fix)

### Step 2: Manually Trigger Render Deployment

**Option A: Force Redeploy (Fastest)**
1. In Render dashboard → `financeai-api`
2. Click "Manual Deploy" button (top right)
3. Select "Clear build cache & deploy"
4. Wait 3-5 minutes for deployment

**Option B: Check Auto-Deploy Settings**
1. In Render dashboard → `financeai-api` → Settings
2. Scroll to "Build & Deploy"
3. Check "Auto-Deploy" is set to **YES**
4. If NO, enable it and save
5. Click "Manual Deploy" to trigger immediate deployment

---

## 🔍 VERIFY DATABASE CONNECTION

### Check Neon Database Status

1. Go to https://console.neon.tech
2. Sign in with your account
3. Find your project: `ep-silent-water-ab6f94vy`
4. Check if database is:
   - ✅ **Active** - Good, data is there
   - ⏸️ **Paused** - Click "Resume" to wake it up
   - ❌ **Deleted** - Data is lost (need backup)

### Get Current Database URL

If Neon database was recreated or credentials changed:

1. In Neon console, click your database
2. Go to "Connection Details"
3. Copy the connection string (looks like):
   ```
   postgresql://user:password@host.neon.tech/dbname
   ```
4. Convert to AsyncPG format:
   ```
   postgresql+asyncpg://user:password@host.neon.tech/dbname
   ```

---

## 🔧 UPDATE DATABASE URL ON RENDER

If Neon credentials changed:

1. Render Dashboard → `financeai-api` → Environment
2. Find `DATABASE_URL` variable
3. Click "Edit"
4. Update to your Neon connection string (AsyncPG format)
5. Click "Save"
6. Service will auto-redeploy

---

## ✅ VERIFICATION CHECKLIST

After Render redeploys:

### 1. Check Backend Health
```bash
curl https://budget-pro-4jlg.onrender.com/api/health
```

**Expected:**
```json
{
  "commit": "fc95711" or newer,
  "database": "connected",
  "status": "ok"
}
```

### 2. Check Your Data
Go to: https://smart-budget-pro-ewtm.vercel.app

1. **Hard refresh:** Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. **Check dashboard:**
   - Should see transactions
   - Should see budgets
   - Should see accounts

### 3. If Still Empty

Open browser console (F12) and check for errors:

**Common Issues:**

**A) CORS Error:**
```
Access to fetch at 'https://budget-pro-4jlg.onrender.com/api/...' 
from origin 'https://smart-budget-pro-ewtm.vercel.app' has been 
blocked by CORS policy
```

**Fix:** Backend `FRONTEND_URL` env var needs updating

**B) 401 Unauthorized:**
```
GET https://budget-pro-4jlg.onrender.com/api/dashboard/overview 401
```

**Fix:** Log out and log back in (token may be invalid)

**C) 500 Server Error:**
```
GET https://budget-pro-4jlg.onrender.com/api/dashboard/overview 500
```

**Fix:** Backend database connection failed - check Render logs

---

## 🗄️ DATABASE BACKUP (If Data Lost)

If Neon database was deleted and data is gone:

### Check for Backups:

1. **Neon Automatic Backups:**
   - Neon console → Your project → "Backups" tab
   - Look for point-in-time restore options

2. **Local Database File:**
   - Check if you have `financeai.db` or similar in your local project
   - This would have local development data

3. **Render Database Backup:**
   - If you had Render-managed PostgreSQL before
   - Render dashboard → Database service → "Backups"

### Worst Case - Start Fresh:

If no backups exist:
1. Create new transactions through the app
2. Import from bank statements (CSV)
3. Rebuild budgets and categories

---

## 📊 CURRENT CONFIGURATION

### What Should Be Set:

**Render Environment Variables:**
- `DATABASE_URL` = `postgresql+asyncpg://...@neon.tech/neondb`
- `FRONTEND_URL` = `https://smart-budget-pro-ewtm.vercel.app`
- `JWT_SECRET` = (auto-generated)
- `ADMIN_EMAIL` = `ptwersky29@gmail.com`
- `ADMIN_PASSWORD` = `146Osbaldeston!`

**GitHub Latest Commit:**
- Commit: `fc95711`
- Includes database configuration fix
- Includes improved BETA badge

**Neon Database:**
- Host: `ep-silent-water-ab6f94vy-pooler.eu-west-2.aws.neon.tech`
- Database: `neondb`
- User: `neondb_owner`

---

## 🆘 IF NOTHING WORKS

### Contact Support:

1. **Render Support:**
   - Check deployment logs
   - Verify environment variables
   - Check database connectivity

2. **Neon Support:**
   - Verify database is active
   - Check connection limits
   - Restore from backup if needed

### Temporary Workaround:

Use local development:
1. Install backend dependencies: `cd backend && pip install -r requirements.txt`
2. Run backend locally: `uvicorn server:app --reload`
3. Update frontend `.env`: `REACT_APP_BACKEND_URL=http://localhost:8000`
4. Run frontend: `cd frontend && npm start`

This will let you access data if it exists locally.

---

## 📝 SUMMARY

**What to do RIGHT NOW:**

1. ✅ Go to Render dashboard
2. ✅ Click "Manual Deploy" on `financeai-api`
3. ✅ Wait 5 minutes for deployment
4. ✅ Go to Neon console and verify database is active
5. ✅ Refresh your app (hard refresh)
6. ✅ Check if data appears

**Expected timeline:** 5-10 minutes

---

**Created:** July 1, 2026  
**Priority:** CRITICAL  
**Action Required:** Manual Render deployment + Neon database verification
