# Deployment Guide

Deploy your Biome Level Editor to the web so your players can access it anywhere!

## Why Deploy?

- **Share with Team**: Let designers create levels without installing anything
- **Player Tools**: Allow players to create custom maps
- **Zero Server Costs**: Static hosting is free or extremely cheap
- **Global Access**: Available anywhere with internet

## Deployment Options

### 1. GitHub Pages (Recommended - FREE)

Perfect for open-source projects and team collaboration.

**Steps:**

1. Create a GitHub repository
2. Push your LevelEditor folder to the repo:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/level-editor.git
   git push -u origin master
   ```

3. Go to your repo on GitHub
4. Click **Settings** → **Pages**
5. Under "Source", select **master branch**
6. Click **Save**
7. Your editor will be live at: `https://yourusername.github.io/level-editor/`

**Pros:** Free, version control, easy updates
**Cons:** Public by default (private repos need paid plan)

---

### 2. Netlify (FREE)

Great for quick deployment with continuous deployment.

**Steps:**

1. Create a free account at [netlify.com](https://www.netlify.com)
2. Drag and drop your `LevelEditor` folder onto their dashboard
3. Your site is live instantly!
4. Optional: Connect to Git for automatic deployments

**Custom Domain:**
- Add your own domain in Site Settings
- Netlify provides free SSL certificates

**Pros:** Fastest deployment, drag-and-drop, free SSL
**Cons:** Need account

---

### 3. Vercel (FREE)

Similar to Netlify, optimized for frontend projects.

**Steps:**

1. Create account at [vercel.com](https://vercel.com)
2. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```
3. Navigate to your LevelEditor folder:
   ```bash
   cd LevelEditor
   vercel
   ```
4. Follow prompts - your site goes live!

**Pros:** Fast, free SSL, CLI deployment
**Cons:** Need Node.js installed

---

### 4. Cloudflare Pages (FREE)

Enterprise-grade CDN with free hosting.

**Steps:**

1. Create account at [pages.cloudflare.com](https://pages.cloudflare.com)
2. Connect your GitHub repo OR upload directly
3. Configure:
   - Build command: Leave empty (no build needed!)
   - Output directory: `/`
4. Deploy!

**Pros:** Global CDN, DDoS protection, unlimited bandwidth
**Cons:** Slightly more setup

---

### 5. Your Own Server

If you have a web server (Apache, Nginx, IIS):

**Steps:**

1. Upload the entire `LevelEditor` folder to your web root
2. Access via: `https://yourdomain.com/LevelEditor/`

**Apache (.htaccess):**
```apache
# Enable CORS if needed
<IfModule mod_headers.c>
    Header set Access-Control-Allow-Origin "*"
</IfModule>
```

**Nginx (nginx.conf):**
```nginx
location /LevelEditor/ {
    add_header Access-Control-Allow-Origin *;
}
```

**Pros:** Full control, private hosting
**Cons:** Need server management knowledge

---

## Configuration for Deployment

### Update Config Path (if needed)

If your config isn't loading, check the path in `js/app.js`:

```javascript
// Change this line if needed:
const loaded = await configManager.loadConfig('config/biomes.json');
```

### Enable CORS (if loading from different domain)

Add this to your server headers if you get CORS errors:
```
Access-Control-Allow-Origin: *
```

## Custom Domain Setup

### GitHub Pages
1. Add `CNAME` file to root with your domain
2. Configure DNS: CNAME record pointing to `yourusername.github.io`

### Netlify/Vercel/Cloudflare
1. Go to domain settings in dashboard
2. Add your custom domain
3. Update DNS as instructed

## Security Considerations

### Public vs Private

**Public hosting is fine for:**
- Community tools
- Player-created content
- Open-source projects

**Use private hosting for:**
- Internal company tools
- Proprietary game data
- Pre-release content

### Protecting Configs

If your biome data is sensitive:

1. **Password Protection**: Add basic auth via hosting provider
2. **IP Whitelist**: Restrict access to team IPs
3. **Private Repo**: Use GitHub private repo with authentication

## Performance Tips

### CDN Optimization

Most hosts provide CDN automatically, but ensure:
- Enable HTTP/2 or HTTP/3
- Enable Gzip/Brotli compression
- Set long cache times for static assets

### Loading Speed

Already optimized! The app is:
- Under 100KB total
- No external dependencies
- Pure JavaScript (no framework bloat)

## Updating Your Deployment

### GitHub Pages
```bash
git add .
git commit -m "Update editor"
git push
```

### Netlify/Vercel
Just push to Git - auto-deploys!

### Manual Hosting
Re-upload changed files via FTP/SSH

## Monitoring & Analytics

### Add Google Analytics (optional)

Add before `</head>` in `index.html`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

## Cost Comparison

| Service | Free Tier | Bandwidth | SSL | Custom Domain |
|---------|-----------|-----------|-----|---------------|
| GitHub Pages | ✅ | 100GB/month | ✅ | ✅ |
| Netlify | ✅ | 100GB/month | ✅ | ✅ |
| Vercel | ✅ | 100GB/month | ✅ | ✅ |
| Cloudflare | ✅ | Unlimited | ✅ | ✅ |

**All options are FREE for typical usage!**

## Troubleshooting

### Config Not Loading
- Check file path is correct
- Ensure JSON is valid
- Check browser console (F12)

### CORS Errors
- Enable CORS headers on server
- Use same domain for hosting

### Slow Loading
- Enable compression on server
- Use CDN-enabled hosting
- Check browser caching

## Production Checklist

Before deploying to production:

- [ ] Test in all major browsers
- [ ] Verify config loads correctly
- [ ] Test save/load functionality
- [ ] Check mobile responsiveness
- [ ] Set up SSL/HTTPS
- [ ] Configure custom domain (if applicable)
- [ ] Add analytics (optional)
- [ ] Test with team members
- [ ] Create user documentation
- [ ] Set up backup strategy

## Support

For hosting-specific issues:
- GitHub Pages: [GitHub Docs](https://docs.github.com/pages)
- Netlify: [Netlify Support](https://answers.netlify.com/)
- Vercel: [Vercel Docs](https://vercel.com/docs)
- Cloudflare: [Cloudflare Docs](https://developers.cloudflare.com/pages)

---

**Your level editor will be live and accessible worldwide in minutes!** 🚀
