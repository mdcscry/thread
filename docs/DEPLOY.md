# THREAD Deployment to Render.com

## Quick Deploy

1. **Push to GitHub** (if not already)
   ```bash
   cd ~/Documents/outerfit
   git add .
   git commit -m "Add Render deployment config"
   git push origin main
   ```

2. **Create Render Blueprint**
   - Go to https://dashboard.render.com/blueprints
   - Click "New Blueprint Instance"
   - Connect your GitHub repo
   - Select the `render.yaml` file
   - Click "Apply"

3. **Deploy**
   - Render will create the web service and disk automatically
   - Wait for build to complete (~5-10 minutes)

## Manual Setup (Alternative)

If you prefer manual configuration:

1. **Create Web Service**
   - Go to https://dashboard.render.com/new/flex
   - Connect GitHub repo
   - Build Command: `npm install && npm run build`
   - Start Command: `node server/index.js --production`
   - Plan: Free or $7 Starter

2. **Add Persistent Disk**
   - Go to service → "Disks"
   - Create disk: 1GB, mount at `/data`
   - Note: Disks require $7 Starter plan on Free tier

3. **Add Environment Variables**
   - Copy all vars from `.env.render` to Render dashboard
   - Generate a secure JWT_SECRET

## Important Notes

- **Ollama**: The app requires Ollama for AI features. Either:
  - Host Ollama separately and set `OLLAMA_BASE_URL`
  - Use without AI (limited functionality)

- **Free Tier**: Auto-sleeps after 15 min of inactivity. 
  - Disable sleep: Upgrade to $7/month Starter plan
  - Or use `https://thread-*.onrender.com` within 15 min to wake

- **Disk Persistence**: Database and images are stored at `/data`
  - Disk persists across deploys
  - To reset: delete and recreate disk

## Local Development with PM2

For local development (keeps server running, auto-restarts on crash):

```bash
# Install PM2
npm install -g pm2

# Start server with PM2
cd ~/Documents/outerfit
pm2 start "node server/index.js" --name thread

# Auto-restart on crash
pm2 set thread autorestart: true

# Auto-start on Mac boot (run once)
sudo env PATH=$PATH:/usr/local/Cellar/node/25.6.1/bin \
  /usr/local/lib/node_modules/pm2/bin/pm2 startup launchd \
  -u matthewcryer --hp /Users/matthewcryer

# Save process list
pm2 save
```

**PM2 Commands:**
- `pm2 status` — check if running
- `pm2 logs thread` — view logs
- `pm2 restart thread` — manual restart

## Troubleshooting

- **Build fails**: Check Node version compatibility
- **App won't start**: Verify DATABASE_PATH and IMAGE_STORAGE_PATH
- **Images not loading**: Ensure disk is mounted at `/data`

## First Run

After deployment completes:
1. Visit your Render URL
2. Set up initial user account
3. Upload some clothing images to get started
