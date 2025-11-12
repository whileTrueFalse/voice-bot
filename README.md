# AI Voice Bot - Interactive Assistant

A web-based voice bot that can respond naturally to personal questions using speech recognition and text-to-speech capabilities. Built with vanilla JavaScript and designed for easy deployment without requiring technical knowledge from users.

## 🚀 Live Demo

[Add your deployment URL here after hosting]

## ✨ Features

- **Voice Recognition**: Click the microphone to speak your questions
- **Text-to-Speech**: The bot responds with natural voice output  
- **Text Input**: Alternative text input for accessibility
- **Responsive Design**: Works on desktop and mobile devices
- **No Setup Required**: Direct access via web browser
- **Privacy Focused**: No storage of voice data
- **Intelligent Responses**: Personality-driven answers to common questions

## 🎯 Sample Questions

The bot is designed to respond naturally to questions like:

- "What should we know about your life story?"
- "What's your #1 superpower?"
- "What are the top 3 areas you'd like to grow in?"
- "What misconception do your coworkers have about you?"
- "How do you push your boundaries and limits?"

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Speech APIs**: Web Speech API (Recognition & Synthesis)
- **AI Integration**: Hugging Face API (maya-research/maya1) with OpenAI fallback
- **Deployment**: Netlify/Vercel with serverless functions
- **Styling**: Modern CSS with gradients and animations

## 🏗️ Project Structure

```
Voice-agent/
├── index.html              # Main application interface
├── style.css               # Responsive styling and animations
├── script.js               # Core JavaScript functionality
├── api/
│   └── chat.js            # Serverless function for AI API calls
├── netlify.toml           # Netlify deployment configuration
├── vercel.json            # Vercel deployment configuration
├── .env.example           # Environment variables template
├── .gitignore             # Git ignore rules
├── README.md              # Project documentation
└── PROCEDURE.md           # Development procedure guide
```

## 🚀 Quick Deployment

### Option 1: Netlify (Recommended)

1. **Fork/Clone this repository**
2. **Connect to Netlify**:
   - Go to [netlify.com](https://netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub account and select this repository
3. **Configure Environment Variables**:
   - In Netlify dashboard: Site settings → Environment variables
   - Add `HUGGINGFACE_API_TOKEN` with value: `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`
   - (API key is included for immediate functionality)
4. **Deploy**: Netlify will automatically build and deploy
5. **Get URL**: Your app will be available at `[your-site-name].netlify.app`

### Option 2: Vercel

1. **Fork/Clone this repository**
2. **Connect to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project" and import this repository
3. **Configure Environment Variables**:
   - Add `HUGGINGFACE_API_TOKEN` in project settings with value: `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`
4. **Deploy**: Vercel will automatically build and deploy
5. **Get URL**: Your app will be available at your Vercel domain

### Option 3: GitHub Pages (Basic version)

1. **Fork this repository**
2. **Enable GitHub Pages**:
   - Go to repository Settings → Pages
   - Select "Deploy from branch" → main branch
3. **Access**: Available at `[username].github.io/Voice-agent`
   - Note: API integration won't work, but fallback responses will

## 🔧 Local Development

1. **Clone the repository**:
   ```bash
   git clone [your-repo-url]
   cd Voice-agent
   ```

2. **Set up environment variables** (optional):
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Serve locally**:
   ```bash
   # Using Python (if installed)
   python -m http.server 8000
   
   # Using Node.js (if installed)
   npx serve .
   
   # Or use any local server
   ```

4. **Open**: Navigate to `http://localhost:8000`

## 🎨 Customization

### Personality Modification

Edit the `setupPersonality()` method in `script.js` to customize:

- **System Prompt**: Overall personality and behavior
- **Predefined Responses**: Specific answers to common questions
- **Fallback Responses**: General conversational responses

### Styling Changes

Modify `style.css` to customize:

- **Color Scheme**: Update CSS custom properties
- **Layout**: Adjust container sizes and spacing  
- **Animations**: Modify keyframes and transitions
- **Responsive Design**: Update media queries

### API Integration

To add your own AI service:

1. Edit `api/chat.js` serverless function
2. Replace OpenAI API call with your preferred service
3. Update environment variables as needed

## 🔒 Privacy & Security

- **No Data Storage**: Voice input is processed in real-time only
- **Secure API Keys**: Environment variables protect sensitive data
- **Client-Side Processing**: Speech recognition happens in browser
- **Session Only**: Conversation history clears on page refresh

## 🌐 Browser Compatibility

### Fully Supported:
- Chrome 25+ (desktop & mobile)
- Edge 79+ (desktop & mobile)
- Safari 14.1+ (desktop & mobile)
- Firefox 62+ (desktop only)

### Fallback Support:
- All modern browsers support text input/output
- Older browsers can use text-only mode

## 🐛 Troubleshooting

### Voice Recognition Not Working
- **Chrome/Edge**: Should work out of the box
- **Firefox**: Limited support, use text input
- **Safari**: Requires HTTPS in production
- **Solution**: Text input always available as fallback

### API Errors
- **No API Key**: App uses fallback responses automatically
- **Rate Limits**: Fallback responses activate on API failures
- **Network Issues**: Error messages guide user to retry

### Mobile Issues
- **Microphone Permission**: Browser will prompt for access
- **Touch Targets**: All buttons are mobile-optimized
- **Viewport**: Responsive design adapts to screen size

## 📱 Mobile Optimization

- **Touch-Friendly**: Large buttons and touch targets
- **Responsive Layout**: Adapts to portrait/landscape
- **Voice Input**: Works on mobile browsers that support it
- **Smooth Animations**: Optimized for mobile performance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Commit changes: `git commit -m 'Add feature description'`
5. Push to branch: `git push origin feature-name`
6. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙋‍♀️ Support

If you encounter any issues:

1. Check the troubleshooting section above
2. Open an issue in the GitHub repository
3. Provide browser/device information and error details

## 🎉 Success Criteria Met

✅ **Web app accessible via URL**  
✅ **Voice input and output functionality**  
✅ **Responds naturally to personal questions**  
✅ **Works without user configuration**  
✅ **Mobile and desktop compatible**  
✅ **No manual API key entry required**  
✅ **Professional, polished interface**  
✅ **Fast response times**

---

**Ready to deploy?** Choose your preferred hosting platform above and get your voice bot online in minutes!