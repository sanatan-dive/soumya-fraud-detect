# Railway Deployment Guide — Fraud Detection System

Complete step-by-step guide to deploy the full-stack fraud detection system on Railway.app.

## Overview

This project consists of:

- **Frontend**: React + TypeScript + Vite (static build)
- **Backend**: Node.js + Express API
- **MongoDB**: Database for transactions and alerts
- **Kafka**: Event streaming (Railway limitation: see alternatives below)

## Railway Architecture

Railway deployment strategy:

1. **MongoDB** — Railway MongoDB plugin/service
2. **Backend** — Railway service (Node.js)
3. **Frontend** — Railway static site OR separate CDN (Vercel/Netlify recommended)
4. **Kafka Alternative** — Use Railway Redis for simple pub/sub OR skip streaming for MVP

⚠️ **Important**: Railway doesn't natively support Kafka/Zookeeper. Options:

- **Option A**: Use external Kafka (Upstash, Confluent Cloud, CloudKarafka)
- **Option B**: Replace Kafka with Railway Redis for simple queue
- **Option C**: Remove Kafka dependency and use direct API calls (simplest for demo)

This guide covers **Option C** (simplest) + **Option A** (production-ready).

---

## Prerequisites

- Railway account (free tier available): https://railway.app
- GitHub account (for deployment)
- Railway CLI (optional but recommended)
- Git repository pushed to GitHub

### Install Railway CLI (Optional)

```bash
npm install -g @railway/cli
railway login
```

---

## Part 1: Prepare Code for Railway

### 1.1 Backend Modifications

Create a Railway-ready backend config:

#### Create `backend/.railwayignore` (optional)

```
node_modules
.env
*.log
```

#### Update `backend/package.json` (if needed)

Ensure `start` script exists:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

#### Backend Environment Variables (Railway will provide)

- `MONGODB_URI` — From Railway MongoDB plugin
- `PORT` — Railway auto-assigns
- `KAFKA_BROKERS` — From external Kafka service OR remove if using Option C

### 1.2 Frontend Modifications

#### Update `src/config.ts` for Railway backend

```typescript
// Use Railway backend URL in production
export const API_URL =
  import.meta.env.VITE_API_URL || "https://your-backend.railway.app";
```

#### Add build output directory config

Railway expects `dist/` for Vite builds (already default).

---

## Part 2: Deploy Backend to Railway

### Method A: Using Railway Dashboard (Recommended for Beginners)

#### Step 1: Create New Project

1. Go to https://railway.app/dashboard
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub
5. Select your `fraud-detection` repository
6. Railway will detect your project

#### Step 2: Add MongoDB Service

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"Add MongoDB"**
3. Railway provisions a MongoDB instance
4. Copy the `MONGO_URL` connection string (or it auto-injects as `MONGODB_URI`)

#### Step 3: Configure Backend Service

1. Click on the backend service (or create one pointing to `./backend`)
2. Go to **Settings** → **Root Directory** → Set to `backend`
3. Go to **Variables** tab and add:

   ```
   MONGODB_URI=${{MongoDB.MONGO_URL}}
   PORT=${{PORT}}
   NODE_ENV=production
   ```

   **If using external Kafka (Option A):**

   ```
   KAFKA_BROKERS=your-kafka-broker-url:9092
   ```

   **If removing Kafka (Option C):**

   - You'll need to modify `backend/server.js` to skip Kafka producer/consumer setup
   - See "Kafka Removal Guide" section below

4. Go to **Settings** → **Build Command** (leave default or set):

   ```
   npm install
   ```

5. Go to **Settings** → **Start Command**:

   ```
   npm start
   ```

6. Click **"Deploy"**

#### Step 4: Get Backend URL

1. Once deployed, go to **Settings** → **Domains**
2. Click **"Generate Domain"**
3. Railway assigns a URL like `https://fraud-detection-backend-production.up.railway.app`
4. **Copy this URL** — you'll need it for the frontend

#### Step 5: Test Backend

Visit your backend URL + `/api/health`:

```
https://your-backend.railway.app/api/health
```

Should return JSON with system info.

---

### Method B: Using Railway CLI (Advanced)

```bash
# Navigate to project root
cd /path/to/fraud-detection

# Login to Railway
railway login

# Link to project (or create new)
railway link

# Deploy backend
cd backend
railway up

# Set environment variables
railway variables set MONGODB_URI="mongodb://user:pass@host:port/db"
railway variables set NODE_ENV=production

# View logs
railway logs
```

---

## Part 3: Deploy Frontend to Railway

### Option 1: Railway Static Site (Simple)

#### Step 1: Add Frontend Service

1. In Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select your repo again (Railway allows multiple services per repo)
3. Set **Root Directory** to `/` (project root)

#### Step 2: Configure Build

1. Go to **Settings** → **Build Command**:

   ```
   npm install && npm run build
   ```

2. **Start Command**:

   ```
   npx vite preview --host 0.0.0.0 --port $PORT
   ```

   OR install serve:

   ```
   npx serve -s dist -l $PORT
   ```

3. **Variables**:

   ```
   VITE_API_URL=https://your-backend.railway.app
   NODE_ENV=production
   ```

4. Deploy and generate domain

### Option 2: Vercel/Netlify (Recommended for Frontend)

Railway is better for backends; use Vercel/Netlify for optimized frontend hosting.

#### Vercel Deployment

```bash
npm install -g vercel
cd /path/to/fraud-detection
vercel

# Set environment variable in Vercel dashboard:
VITE_API_URL=https://your-backend.railway.app
```

#### Netlify Deployment

```bash
npm install -g netlify-cli
cd /path/to/fraud-detection
netlify deploy --prod

# Build command: npm run build
# Publish directory: dist
# Environment: VITE_API_URL=https://your-backend.railway.app
```

---

## Part 4: Kafka Options for Railway

### Option A: External Kafka Service (Production)

#### Upstash Kafka (Serverless, Free Tier)

1. Sign up at https://upstash.com
2. Create a new Kafka cluster
3. Get connection details (broker URL, credentials)
4. Set Railway variables:
   ```
   KAFKA_BROKERS=your-cluster.upstash.io:9092
   KAFKA_USERNAME=your-username
   KAFKA_PASSWORD=your-password
   ```
5. Update `backend/server.js` to use SASL authentication:
   ```javascript
   const kafka = new Kafka({
     clientId: "fraud-detection-system",
     brokers: [process.env.KAFKA_BROKERS],
     sasl: {
       mechanism: "scram-sha-256",
       username: process.env.KAFKA_USERNAME,
       password: process.env.KAFKA_PASSWORD,
     },
     ssl: true,
   });
   ```

#### CloudKarafka (Managed Kafka)

1. Sign up at https://cloudkarafka.com (free tier available)
2. Similar setup to Upstash

### Option B: Replace Kafka with Redis

Use Railway Redis plugin for simple pub/sub:

1. Add Redis plugin in Railway dashboard
2. Install `ioredis` in backend:
   ```bash
   npm install ioredis
   ```
3. Modify `backend/server.js` to use Redis pub/sub instead of Kafka

### Option C: Remove Kafka (Simplest for Demo)

If you don't need real-time streaming, remove Kafka dependency:

#### Modify `backend/server.js`

Find and comment out/remove:

```javascript
// Remove or comment these sections:
// 1. Kafka imports
// const { Kafka } = require('kafkajs');

// 2. Kafka initialization
// const kafka = new Kafka({ ... });
// const producer = kafka.producer();
// const consumer = kafka.consumer({ groupId: 'fraud-detection-group' });

// 3. Kafka connection code
// await producer.connect();
// await consumer.connect();
// await consumer.subscribe({ topic: 'transactions', fromBeginning: false });
// consumer.run({ ... });
```

**Change `/api/transactions` endpoint** to directly process instead of producing to Kafka:

```javascript
app.post('/api/transactions', async (req, res) => {
  try {
    const txn = req.body;

    // Process transaction directly (code from consumer)
    const transactionId = txn.id || txn.transactionId;
    let score = 0;
    const indicators = [];

    // ... (fraud detection logic here - copy from consumer.run block)

    // Save to MongoDB
    await Transaction.create({ ... });

    // Create alert if needed
    if (score >= 0.4) {
      await Alert.create({ ... });
    }

    res.json({ success: true, transactionId, score });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

Remove `kafkajs` from `backend/package.json` dependencies.

---

## Part 5: Environment Variables Summary

### Backend Service (Railway)

```bash
# Required
MONGODB_URI=${{MongoDB.MONGO_URL}}  # Auto-injected by Railway
PORT=${{PORT}}                       # Auto-injected by Railway
NODE_ENV=production

# Optional (if using Kafka)
KAFKA_BROKERS=your-kafka-url:9092
KAFKA_USERNAME=your-username         # If using SASL
KAFKA_PASSWORD=your-password         # If using SASL
```

### Frontend Service (Railway/Vercel/Netlify)

```bash
VITE_API_URL=https://your-backend.railway.app
NODE_ENV=production
```

---

## Part 6: Post-Deployment Steps

### 6.1 Update CORS in Backend

Edit `backend/server.js`:

```javascript
app.use(
  cors({
    origin: [
      "https://your-frontend.vercel.app",
      "https://your-frontend.railway.app",
      "http://localhost:5173", // Keep for local dev
    ],
    credentials: true,
  })
);
```

Redeploy backend after this change.

### 6.2 Test Full Stack

1. Visit frontend URL
2. Click "Start Stream"
3. Verify transactions appear
4. Check backend logs in Railway:
   ```bash
   railway logs --service backend
   ```

### 6.3 Monitor Services

Railway Dashboard → Project → Metrics shows:

- CPU usage
- Memory usage
- Request volume
- Build/deploy logs

---

## Part 7: Deployment Checklist

- [ ] Backend deployed to Railway
- [ ] MongoDB plugin added and connected
- [ ] Backend environment variables set
- [ ] Backend health endpoint responding
- [ ] Frontend built and deployed
- [ ] Frontend environment variable `VITE_API_URL` set
- [ ] CORS configured on backend
- [ ] Kafka setup complete (or removed)
- [ ] Test transaction flow end-to-end
- [ ] Check Railway logs for errors

---

## Part 8: Troubleshooting

### Backend won't start

- **Check logs**: Railway Dashboard → Service → Deployments → View Logs
- **Common issues**:
  - Missing `MONGODB_URI` — Add MongoDB plugin
  - Port binding error — Railway auto-assigns `PORT`, ensure backend uses `process.env.PORT`
  - Kafka connection timeout — Use external Kafka or remove dependency

### Frontend can't reach backend

- **CORS error**: Update backend CORS origins
- **Wrong API URL**: Check `VITE_API_URL` in frontend environment variables
- **Backend not deployed**: Verify backend service is running

### MongoDB connection failed

- **Railway MongoDB**: Use the connection string from Variables tab (format: `mongodb://user:pass@host:port/db`)
- **Network issue**: Railway MongoDB is internal; backend must be in same project

### Build failures

- **Frontend**: Ensure all dependencies in `package.json`, check TypeScript errors
- **Backend**: Verify Node version compatibility (Railway uses Node 18+ by default)

### High costs / resource usage

- **Free tier limits**: Railway free tier ~500 hours/month
- **Optimize**:
  - Use smaller instance sizes
  - Enable auto-sleep for dev environments
  - Monitor memory leaks in logs

---

## Part 9: Cost Estimates (as of 2025)

### Railway Pricing

- **Free Tier**: $5 credit/month (~500 execution hours)
- **Backend**: ~$3-5/month (small instance)
- **MongoDB**: ~$5-10/month (shared)
- **Total**: ~$8-15/month for hobby project

### External Services (if using)

- **Upstash Kafka**: Free tier (10k messages/day)
- **Vercel**: Free for frontend hosting
- **CloudKarafka**: Free tier (5 topics, limited throughput)

**Recommendation**: Start with free tiers, upgrade as needed.

---

## Part 10: Production Readiness Improvements

Before going live:

1. **Security**

   - Remove hardcoded password from cleanup endpoint
   - Add JWT authentication
   - Use environment secrets for sensitive data
   - Enable HTTPS only

2. **Monitoring**

   - Add logging service (Railway Logs, Datadog, Sentry)
   - Set up health checks and alerts
   - Monitor error rates

3. **Performance**

   - Add Redis caching layer
   - Implement database indexes
   - Enable CDN for frontend assets

4. **Scalability**
   - Use horizontal scaling on Railway
   - Add read replicas for MongoDB
   - Implement rate limiting

---

## Quick Deploy Commands (Summary)

```bash
# 1. Push code to GitHub
git add .
git commit -m "Prepare for Railway deployment"
git push origin main

# 2. Deploy backend via Railway CLI
cd backend
railway login
railway init
railway up

# 3. Add MongoDB
railway add --database mongodb

# 4. Set variables
railway variables set NODE_ENV=production

# 5. Deploy frontend to Vercel
cd ..
vercel --prod

# 6. Test
curl https://your-backend.railway.app/api/health
```

---

## Alternative: Docker Deployment on Railway

Railway also supports Dockerfile deployment:

### Create `railway.toml` in project root:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "backend/Dockerfile"

[deploy]
startCommand = "npm start"
```

This uses your existing `backend/Dockerfile`.

---

## Support & Resources

- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **This Project**: See `summary.md` for architecture details

---

**Deployment prepared by**: Fraud Detection System Team  
**Last updated**: 09 Nov 2025  
**Railway CLI Version**: Latest

---

## Appendix: Alternative Deployment Platforms

If Railway doesn't meet your needs:

### Render.com

- Similar to Railway, better Kafka support via Docker
- Free tier available
- Native PostgreSQL/MongoDB

### Fly.io

- Global edge deployment
- Better for low-latency needs
- Dockerfile-based

### DigitalOcean App Platform

- More control, similar pricing
- Managed databases included

### AWS/GCP/Azure

- Production-grade, higher complexity
- Use Elastic Beanstalk (AWS), Cloud Run (GCP), or App Service (Azure)
- Recommended for enterprise

---

**Happy Deploying! 🚀**
