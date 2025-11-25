# Render Deployment Configuration

## Service Configuration
- **Type**: Web Service
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Node Version**: 18.x or higher

## Environment Variables (Set in Render Dashboard)

### Required for Production:
```
NODE_ENV=production
PORT=10000

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=samarthganorkar@gmail.com
EMAIL_PASS=your_gmail_app_password_here
EMAIL_FROM=samarthganorkar@gmail.com

# Admin Configuration
ADMIN_PASSWORD=VoiceAgent2024!
JWT_SECRET=VoiceAgent_JWT_Secret_2024_Secure_Random_Key_For_Production_Use

# API Keys
OPENAI_API_KEY=sk-proj-N7fuioS0Vs6WwCvKZ9FOPKQobrGs942nLhWd3JtpFhKbWt0nwcstVNR6x5Ks9pE4Q0
GEMINI_API_KEY=AIzaSyCkECRHzYCyehv0nwcstVNR6x5Ks9pE4Q0

# Optional
GROQ_API_KEY=your_groq_key_here
BYPASS_WAITLIST=false
```

## Deployment Steps

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Add waitlist system for production"
   git push origin master
   ```

2. **Render will automatically**:
   - Detect the changes
   - Build with `npm install`
   - Start with `npm start`
   - Deploy to your domain

3. **Set Environment Variables**:
   - Go to Render Dashboard
   - Navigate to your service
   - Go to "Environment" tab
   - Add all the variables listed above

## URLs After Deployment

- **Main App**: `https://your-app.onrender.com/`
- **Waitlist**: `https://your-app.onrender.com/waitlist.html`
- **Admin Panel**: `https://your-app.onrender.com/admin.html`
- **Health Check**: `https://your-app.onrender.com/health`

## Gmail App Password Setup

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Step Verification (if not already)
3. Go to "App passwords" section
4. Generate password for "Mail"
5. Use in Render environment variables

## Testing

After deployment:
1. Test waitlist signup
2. Check email notifications
3. Test admin panel login
4. Approve a test user
5. Verify main app access works

## File Structure
```
/
├── waitlist.html          # Public signup form
├── admin.html            # Admin management panel  
├── index.html            # Main app (requires access)
├── server.js             # Backend with waitlist APIs
├── script.js             # Frontend with access control
├── style.css             # Styling including waitlist
└── waitlist_data.json    # Auto-created data storage
```

## Auto-Deployment

Every `git push origin master` will trigger:
1. Automatic build on Render
2. Zero-downtime deployment
3. New features immediately live
4. Environment variables preserved

Your waitlist system is now production-ready! 🚀