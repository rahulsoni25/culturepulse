#!/bin/bash
# ============================================================
# CulturePulse — Git + Vercel Deploy Script
# Run this on YOUR machine inside the culturepulse-deploy folder
# ============================================================

# STEP 1 — Initialize git repo
git init
git add .
git commit -m "feat: initial CulturePulse dashboard"

# STEP 2 — Create GitHub repo and push
# (replace YOUR_USERNAME with your GitHub username)
gh repo create culturepulse --public --source=. --remote=origin --push

# If you don't have GitHub CLI, do this instead:
# 1. Go to github.com/new
# 2. Create repo named "culturepulse"
# 3. Then run:
#    git remote add origin https://github.com/YOUR_USERNAME/culturepulse.git
#    git branch -M main
#    git push -u origin main

# STEP 3 — Install Vercel CLI (skip if already installed)
npm install -g vercel

# STEP 4 — Login to Vercel
vercel login

# STEP 5 — Deploy to Vercel (linked to GitHub repo)
vercel --prod

# After first deploy, future updates are just:
# git add . && git commit -m "update" && git push
# Vercel auto-deploys on every push to main
