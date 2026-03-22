# Deploying to an AWS Linux VPS

This guide covers deploying the News Budget app to an AWS EC2 instance (or any Linux VPS) running Node.js directly, as an alternative to Vercel.

## Prerequisites

- An AWS EC2 instance (Ubuntu 22.04+ or Amazon Linux 2023 recommended)
- A domain name pointed at the instance's public IP
- SSH access to the instance
- A PostgreSQL database (Neon, RDS, or self-hosted on the VPS)

## 1. Provision the EC2 Instance

**Recommended specs:**
- Instance type: `t3.small` (2 vCPU, 2 GB RAM) minimum for light usage
- Storage: 20 GB gp3
- Security group: open ports 22 (SSH), 80 (HTTP), 443 (HTTPS)

## 2. Install System Dependencies

```bash
# Ubuntu 22.04+
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx certbot python3-certbot-nginx

# Install Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v   # v20.x
npm -v
```

## 3. Clone and Build the App

```bash
# Create app directory
sudo mkdir -p /opt/newsbudget
sudo chown $USER:$USER /opt/newsbudget

# Clone
cd /opt/newsbudget
git clone https://github.com/your-org/budget-app.git .

# Install dependencies
npm ci --production=false   # need devDependencies for build

# Create .env
cp .env.example .env
nano .env
```

Fill in `.env`:

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require&connection_limit=10&pool_timeout=15"
NEXTAUTH_URL="https://your-domain.com"
NEXTAUTH_SECRET="$(openssl rand -hex 32)"

# Azure AD SSO (optional — omit AZURE_AD_CLIENT_ID to disable)
AZURE_AD_CLIENT_ID=""
AZURE_AD_CLIENT_SECRET=""
AZURE_AD_TENANT_ID=""
AZURE_AD_ALLOWED_GROUP_ID=""
```

```bash
# Generate Prisma client and push schema
npx prisma generate
npx prisma db push

# Seed (optional — only for initial setup or demo)
npx prisma db seed

# Build
npm run build
```

## 4. Set Up a Process Manager (PM2)

```bash
sudo npm install -g pm2

# Start the app
cd /opt/newsbudget
pm2 start npm --name "newsbudget" -- start

# Save the process list so it auto-starts on reboot
pm2 save
pm2 startup
# Run the command PM2 prints (starts PM2 on boot)
```

Useful PM2 commands:

```bash
pm2 status              # Check running processes
pm2 logs newsbudget     # View app logs
pm2 restart newsbudget  # Restart after a deploy
pm2 monit               # Real-time monitoring dashboard
```

## 5. Configure Nginx as Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/newsbudget
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/newsbudget /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 6. SSL with Let's Encrypt

```bash
sudo certbot --nginx -d your-domain.com
```

Certbot auto-configures Nginx for HTTPS and sets up auto-renewal.

Verify auto-renewal:

```bash
sudo certbot renew --dry-run
```

## 7. Deploying Updates

Create a simple deploy script:

```bash
nano /opt/newsbudget/deploy.sh
```

```bash
#!/bin/bash
set -e

cd /opt/newsbudget

echo "Pulling latest code..."
git pull origin master

echo "Installing dependencies..."
npm ci --production=false

echo "Running Prisma generate + db push..."
npx prisma generate
npx prisma db push

echo "Building..."
npm run build

echo "Restarting app..."
pm2 restart newsbudget

echo "Deploy complete."
```

```bash
chmod +x /opt/newsbudget/deploy.sh
```

To deploy: `ssh user@your-server '/opt/newsbudget/deploy.sh'`

## 8. Environment Variable Management

Unlike Vercel, there's no managed env var system. Options:

- **`.env` file** on the server (simplest — already configured above)
- **AWS Systems Manager Parameter Store** — pull secrets at startup
- **AWS Secrets Manager** — for automated rotation

Whichever you choose, ensure `.env` is not checked into git (already in `.gitignore`).

## 9. Database Options

### Option A: Neon (external, managed)

Use the same Neon PostgreSQL database as you would on Vercel. Set `DATABASE_URL` to the Neon connection string. No changes needed.

### Option B: Amazon RDS

1. Create an RDS PostgreSQL instance in the same VPC
2. Use the RDS endpoint in `DATABASE_URL`
3. Ensure the EC2 security group can reach the RDS security group on port 5432

### Option C: PostgreSQL on the VPS itself

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createuser --interactive   # create a user
sudo -u postgres createdb newsbudget        # create the database
```

Set `DATABASE_URL="postgresql://user:password@localhost:5432/newsbudget"`.

Note: Self-hosted Postgres requires you to manage backups, updates, and availability.

## 10. Azure AD SSO — Redirect URI

When deploying to a VPS instead of Vercel, update the Azure AD redirect URI:

1. Go to **Azure Portal** → **App registrations** → your app → **Authentication**
2. Add: `https://your-domain.com/api/auth/callback/azure-ad`
3. Remove any Vercel-specific URLs if no longer needed

See [docs/azure-sso-setup.md](./azure-sso-setup.md) for full Azure AD configuration.

## 11. Monitoring and Logs

```bash
# Application logs
pm2 logs newsbudget

# Nginx access/error logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# System resources
htop
```

For production monitoring, consider:
- **PM2 Plus** — hosted dashboard for PM2 processes
- **CloudWatch** — if using AWS, install the CloudWatch agent for CPU/memory/disk metrics
- **UptimeRobot** or similar — external uptime monitoring with alerts

## 12. Security Hardening

```bash
# Firewall — allow only SSH, HTTP, HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Disable password SSH login (use key-based auth only)
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
sudo systemctl restart sshd

# Automatic security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## Differences from Vercel Deployment

| Concern | Vercel | VPS |
|---------|--------|-----|
| Process management | Automatic | PM2 (manual setup) |
| SSL | Automatic | Let's Encrypt + Nginx |
| Scaling | Auto-scales | Manual (vertical scaling or load balancer) |
| Env vars | Vercel dashboard / CLI | `.env` file or AWS SSM/Secrets Manager |
| Zero-downtime deploys | Automatic | Requires PM2 cluster mode or rolling restart |
| CDN / Edge caching | Built-in | Add CloudFront or Cloudflare if needed |
| Logs | Vercel dashboard | PM2 logs + Nginx logs |
| Cost | Per-request pricing | Fixed monthly (instance + bandwidth) |
