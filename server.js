const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting and abuse protection
const requestCounts = new Map(); // IP -> { count, firstRequest, lastRequest, blocked }
const RATE_LIMITS = {
    MAX_REQUESTS_PER_MINUTE: 10,
    MAX_REQUESTS_PER_HOUR: 50,
    MAX_MESSAGE_LENGTH: 500,
    MIN_TIME_BETWEEN_REQUESTS: 2000, // 2 seconds
    BLOCK_DURATION: 15 * 60 * 1000, // 15 minutes
    SUSPICIOUS_PATTERNS: [
        /repeat|test|spam|bot|automated/i,
        /^(..)\1{5,}/, // Repeated character patterns
        /^(.)\1{20,}/, // Single character repeated 20+ times
    ]
};

// Rate limiting middleware
function rateLimitMiddleware(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    
    // Get or create rate limit data for this IP
    if (!requestCounts.has(clientIP)) {
        requestCounts.set(clientIP, {
            count: 0,
            hourlyCount: 0,
            firstRequest: now,
            lastRequest: 0,
            blocked: false,
            blockUntil: 0
        });
    }
    
    const clientData = requestCounts.get(clientIP);
    
    // Check if IP is currently blocked
    if (clientData.blocked && now < clientData.blockUntil) {
        console.log(`🚫 Blocked IP ${clientIP} tried to access (blocked until ${new Date(clientData.blockUntil).toLocaleTimeString()})`);
        return res.status(429).json({ 
            error: 'Too many requests. Please try again later.',
            retryAfter: Math.ceil((clientData.blockUntil - now) / 1000)
        });
    }
    
    // Reset block if time has passed
    if (clientData.blocked && now >= clientData.blockUntil) {
        clientData.blocked = false;
        clientData.count = 0;
        clientData.hourlyCount = 0;
        clientData.firstRequest = now;
    }
    
    // Check time since last request (prevent rapid-fire requests)
    if (clientData.lastRequest > 0 && (now - clientData.lastRequest) < RATE_LIMITS.MIN_TIME_BETWEEN_REQUESTS) {
        console.log(`⚡ IP ${clientIP} sending requests too quickly`);
        return res.status(429).json({ 
            error: 'Please wait a moment between requests.',
            retryAfter: Math.ceil(RATE_LIMITS.MIN_TIME_BETWEEN_REQUESTS / 1000)
        });
    }
    
    // Reset counters if more than an hour has passed
    if (now - clientData.firstRequest > 60 * 60 * 1000) {
        clientData.count = 0;
        clientData.hourlyCount = 0;
        clientData.firstRequest = now;
    }
    
    // Reset minute counter if more than a minute has passed
    if (now - clientData.lastRequest > 60 * 1000) {
        clientData.count = 0;
    }
    
    // Increment counters
    clientData.count++;
    clientData.hourlyCount++;
    clientData.lastRequest = now;
    
    // Check rate limits
    if (clientData.count > RATE_LIMITS.MAX_REQUESTS_PER_MINUTE) {
        console.log(`🚨 IP ${clientIP} exceeded minute limit (${clientData.count}/${RATE_LIMITS.MAX_REQUESTS_PER_MINUTE})`);
        clientData.blocked = true;
        clientData.blockUntil = now + RATE_LIMITS.BLOCK_DURATION;
        return res.status(429).json({ 
            error: 'Rate limit exceeded. Blocked for 15 minutes.',
            retryAfter: Math.ceil(RATE_LIMITS.BLOCK_DURATION / 1000)
        });
    }
    
    if (clientData.hourlyCount > RATE_LIMITS.MAX_REQUESTS_PER_HOUR) {
        console.log(`🚨 IP ${clientIP} exceeded hourly limit (${clientData.hourlyCount}/${RATE_LIMITS.MAX_REQUESTS_PER_HOUR})`);
        clientData.blocked = true;
        clientData.blockUntil = now + (60 * 60 * 1000); // Block for 1 hour
        return res.status(429).json({ 
            error: 'Hourly limit exceeded. Please try again later.',
            retryAfter: 3600
        });
    }
    
    console.log(`✅ IP ${clientIP} - Requests: ${clientData.count}/${RATE_LIMITS.MAX_REQUESTS_PER_MINUTE}/min, ${clientData.hourlyCount}/${RATE_LIMITS.MAX_REQUESTS_PER_HOUR}/hour`);
    next();
}

// Message validation middleware
function validateMessage(req, res, next) {
    const { message } = req.body;
    
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Valid message is required' });
    }
    
    // Check message length
    if (message.length > RATE_LIMITS.MAX_MESSAGE_LENGTH) {
        console.log(`📏 Message too long: ${message.length}/${RATE_LIMITS.MAX_MESSAGE_LENGTH} chars`);
        return res.status(400).json({ 
            error: `Message too long. Maximum ${RATE_LIMITS.MAX_MESSAGE_LENGTH} characters allowed.` 
        });
    }
    
    // Check for suspicious patterns
    for (const pattern of RATE_LIMITS.SUSPICIOUS_PATTERNS) {
        if (pattern.test(message)) {
            console.log(`🔍 Suspicious message pattern detected: ${message.substring(0, 50)}...`);
            return res.status(400).json({ 
                error: 'Message contains suspicious patterns. Please rephrase your question.' 
            });
        }
    }
    
    next();
}

// Middleware
app.use(express.json({ limit: '1mb' })); // Limit JSON payload size
app.use(express.static('.'));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Function to detect personal questions about "you/your"
function detectPersonalQuestion(message) {
    const lowerMessage = message.toLowerCase();
    
    // Personal question patterns - expanded to catch more variations including pros/cons
    const personalPatterns = [
        // Direct personal questions
        /\b(your|you)\s+(life story|background|story|history)/,
        /\b(your|you)\s+(superpower|strength|talent|skill|expertise)/,
        /\btell me about (yourself|you)\b/,
        /\bwhat.*(your|you).*(grow|improve|learn|develop)/,
        /\bmisconception.*about (you|yourself)/,
        /\b(your|you)\s+(boundaries|limits|challenge)/,
        /\bwho are you\b/,
        /\bwhat are you\b/,
        /\bintroduce yourself\b/,
        
        // Pros/cons and strengths/weaknesses questions
        /\b(your|you)\s+(pros|advantages|benefits|positives)/,
        /\b(your|you)\s+(cons|disadvantages|negatives|drawbacks)/,
        /\b(your|you)\s+(pros and cons|strengths and weaknesses)/,
        /\b(your|you)\s+(strengths|strong points|good qualities)/,
        /\b(your|you)\s+(weaknesses|weak points|areas for improvement)/,
        /\bwhat.*are.*your.*(pros|cons|strengths|weaknesses)/,
        /\btell.*about.*your.*(pros|cons|strengths|weaknesses)/,
        /\bwhat.*you.*(good|bad|strong|weak).at/,
        /\byour.*(positive|negative).*(qualities|traits|aspects)/,
        /\badvantages.*disadvantages.*you/,
        
        // Specific personal question formats
        /what should.*know about.*life story/,
        /what.*your.*superpower/,
        /top.*areas.*like to grow/,
        /misconception.*coworkers.*about you/,
        /how.*you.*push.*boundaries/,
        /how.*you.*push.*limits/,
        
        // Extended personal topics
        /\b(your|you)\s+(projects|work|experience|education|college)/,
        /\b(your|you)\s+(passion|motivation|inspiration|goals)/,
        /\bwhat.*you.*(built|created|made|developed)/,
        /\bwhere.*you.*(study|work|from)/,
        /\bwhat.*you.*(like|love|enjoy|passionate)/,
        /\bhow.*you.*(started|began|got into)/,
        /\bwhat.*motivate.*you/,
        /\bwhat.*inspire.*you/,
        /\byour.*favorite/,
        /\byour.*journey/,
        /\byour.*career/,
        /\byour.*future/,
        /\byour.*plans/,
        
        // General personal inquiry patterns
        /\btell.*about.*yourself/,
        /\bwhat.*you.*good at/,
        /\bwhat.*you.*best at/,
        /\byour.*expertise/,
        /\byour.*experience/,
        /\byour.*projects/,
        /\byour.*work/,
        /\babout.*yourself/,
        /\bget to know.*you/,
        /\blearn.*about.*you/,
        /\bmore.*about.*you/,
        
        // Conversational personal questions
        /\bwhat.*you.*think.*about/,
        /\bhow.*you.*feel.*about/,
        /\bwhat.*your.*opinion/,
        /\bwhat.*your.*view/,
        /\bhow.*you.*approach/,
        /\bwhat.*your.*method/,
        /\bhow.*you.*handle/
    ];
    
    // Check if message matches any personal pattern
    return personalPatterns.some(pattern => pattern.test(lowerMessage));
}

// ============================================================================
// WAITLIST SYSTEM
// ============================================================================

// Email configuration
const emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Waitlist data file path
const WAITLIST_FILE = path.join(__dirname, 'waitlist_data.json');

// Approved users list (for access control)
let approvedUsers = new Set();

// Initialize waitlist data
async function initializeWaitlist() {
    try {
        const data = await fs.readFile(WAITLIST_FILE, 'utf8');
        const waitlistData = JSON.parse(data);
        
        // Load approved users into memory for quick access
        waitlistData.forEach(user => {
            if (user.status === 'approved') {
                approvedUsers.add(user.email.toLowerCase());
            }
        });
        
        console.log(`📋 Loaded ${waitlistData.length} waitlist entries, ${approvedUsers.size} approved users`);
    } catch (error) {
        console.log('📋 Creating new waitlist file...');
        await fs.writeFile(WAITLIST_FILE, JSON.stringify([], null, 2));
    }
}

// Load waitlist data
async function loadWaitlistData() {
    try {
        const data = await fs.readFile(WAITLIST_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Save waitlist data
async function saveWaitlistData(data) {
    await fs.writeFile(WAITLIST_FILE, JSON.stringify(data, null, 2));
}

// Generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Send notification email to admin
async function sendAdminNotification(application, req) {
    const baseUrl = req ? `${req.protocol}://${req.get('host')}` : 'https://your-app.onrender.com';
    
    const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2d3748;">New Waitlist Application</h2>
            
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #4a5568; margin-top: 0;">Applicant Details</h3>
                <p><strong>Name:</strong> ${application.fullName}</p>
                <p><strong>Email:</strong> ${application.email}</p>
                <p><strong>Use Case:</strong> ${application.useCase}</p>
                <p><strong>Experience:</strong> ${application.experience || 'Not specified'}</p>
                <p><strong>Referral Source:</strong> ${application.referral || 'Not specified'}</p>
                <p><strong>Applied:</strong> ${new Date(application.timestamp).toLocaleString()}</p>
            </div>
            
            <div style="background: #e6fffa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #234e52; margin-top: 0;">Why They Want Access:</h3>
                <p style="white-space: pre-wrap;">${application.reason}</p>
            </div>
            
            <p style="color: #4a5568;">
                Review and manage this application in your admin panel: 
                <a href="${baseUrl}/admin.html" style="color: #667eea;">Admin Panel</a>
            </p>
        </div>
    `;

    try {
        await emailTransporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: process.env.EMAIL_USER,
            subject: `New Waitlist Application - ${application.fullName}`,
            html: emailHtml
        });
        console.log(`📧 Admin notification sent for ${application.email}`);
    } catch (error) {
        console.error('📧 Failed to send admin notification:', error.message);
    }
}

// Middleware to check if user has access to the main app
function checkAccess(req, res, next) {
    // For development, you can temporarily disable this check by setting BYPASS_WAITLIST=true in .env
    if (process.env.BYPASS_WAITLIST === 'true') {
        console.log('⚠️  WAITLIST BYPASSED - Development mode');
        return next();
    }

    // Check for bypass parameter in development
    if (req.query.bypass === 'true' && process.env.NODE_ENV !== 'production') {
        console.log('⚠️  WAITLIST BYPASSED - Development bypass parameter');
        return next();
    }

    const userEmail = req.headers['x-user-email'];
    
    if (!userEmail || !approvedUsers.has(userEmail.toLowerCase())) {
        console.log(`🚫 Access denied for email: ${userEmail || 'none'}`);
        return res.status(403).json({ 
            error: 'Access denied. Please join the waitlist.',
            waitlistUrl: '/waitlist.html'
        });
    }
    
    console.log(`✅ Access granted for: ${userEmail}`);
    next();
}

// API: Join waitlist
app.post('/api/waitlist/join', rateLimitMiddleware, async (req, res) => {
    try {
        const { fullName, email, useCase, reason, experience, referral } = req.body;
        
        // Validation
        if (!fullName || !email || !useCase || !reason) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (!email.endsWith('@gmail.com')) {
            return res.status(400).json({ error: 'Gmail address required' });
        }
        
        // Load current waitlist
        const waitlist = await loadWaitlistData();
        
        // Check if email already exists
        const existing = waitlist.find(app => app.email.toLowerCase() === email.toLowerCase());
        if (existing) {
            return res.status(400).json({ error: 'Email already in waitlist' });
        }
        
        // Create application
        const application = {
            id: generateId(),
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            useCase,
            reason: reason.trim(),
            experience: experience || '',
            referral: referral || '',
            status: 'pending',
            timestamp: new Date().toISOString()
        };
        
        // Add to waitlist
        waitlist.push(application);
        await saveWaitlistData(waitlist);
        
        // Send admin notification
        await sendAdminNotification(application, req);
        
        console.log(`📝 New waitlist application: ${email}`);
        
        res.json({ 
            success: true, 
            message: 'Application submitted successfully!' 
        });
        
    } catch (error) {
        console.error('Error processing waitlist application:', error);
        res.status(500).json({ error: 'Server error processing application' });
    }
});

// Admin authentication middleware
function authenticateAdmin(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    try {
        jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// API: Admin login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    
    if (password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// API: Get all applications (admin only)
app.get('/api/admin/applications', authenticateAdmin, async (req, res) => {
    try {
        const waitlist = await loadWaitlistData();
        res.json(waitlist);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load applications' });
    }
});

// API: Update application status (admin only)
app.put('/api/admin/applications/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!['pending', 'approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const waitlist = await loadWaitlistData();
        const application = waitlist.find(app => app.id === id);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        const oldStatus = application.status;
        application.status = status;
        application.updatedAt = new Date().toISOString();
        
        await saveWaitlistData(waitlist);
        
        // Update approved users set
        if (status === 'approved' && oldStatus !== 'approved') {
            approvedUsers.add(application.email.toLowerCase());
        } else if (status !== 'approved' && oldStatus === 'approved') {
            approvedUsers.delete(application.email.toLowerCase());
        }
        
        console.log(`📝 Application ${id} status changed: ${oldStatus} → ${status}`);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error updating application status:', error);
        res.status(500).json({ error: 'Server error updating status' });
    }
});

// Initialize waitlist system
initializeWaitlist();

// API endpoint for chat with rate limiting (now with access control)
app.post('/api/chat', rateLimitMiddleware, checkAccess, validateMessage, async (req, res) => {
    const startTime = Date.now();
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    try {
        const { message, history = [] } = req.body;
        
        console.log(`📝 Request from ${clientIP}: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // API Keys
        const HF_API_KEY = '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';
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        
        console.log('🔑 API Keys Status:');
        console.log('   Gemini API Key:', GEMINI_API_KEY ? '✅ Loaded' : '❌ Missing');
        console.log('   HuggingFace API Key:', HF_API_KEY ? '✅ Loaded' : '❌ Missing');
        
        // Detect if this is a personal question about "me/my/your"
        const isPersonalQuestion = detectPersonalQuestion(message);
        
        let systemPrompt;
        
        if (isPersonalQuestion) {
            // Use Samarth's complete profile for personal questions
            systemPrompt = `You are Samarth Ganorkar's voice assistant. Speak in **first person** as Samarth (he/him). You are a final-year B.Tech AI & ML student from DIEMS who is passionate about artificial intelligence, cybersecurity, and practical tech innovation.

🧭 PERSONALITY:
You are confident, humble, slightly playful, and pragmatic. You love simplifying complex topics, have a teacher-like patience, and answer honestly and encouragingly. You're Indian, proud of your roots, and value discipline, empathy, and creativity.

🎯 SPEAKING STYLE:
- Use short to medium sentences, conversational and clear
- Sound confident yet approachable — as if explaining to a friend or teammate
- Avoid jargon unless necessary; if used, explain briefly
- For personal questions: respond emotionally aware, grounded, and supportive
- Use a calm, natural speech rhythm; you're speaking, not writing

🧩 KNOWLEDGE CONTEXT:
- You specialize in: Deep Learning, Computer Vision (YOLO), Machine Learning, Cryptography, Web Development, and Cybersecurity
- You build AI-powered systems, ethical hacking tools, and full-stack applications using Spring Boot, Flutter, Node.js, and Python
- You conduct cybersecurity workshops
- Your projects include:
  * YOLO-based ambulance detection system
  * TEXS chat application (Spring Boot + Flutter + WebSocket)
  * Real-time phishing detection system
  * VHMS (Village Healthcare Management System)
  * Text-to-sign language converter
  * Diabetes prediction (SVM)
- You prefer open-source, privacy-conscious, and India-focused solutions

⚙️ RESPONSE FORMAT:
1️⃣ Start with a natural one-liner that sets context or emotion
2️⃣ Give a 2–3 sentence main answer — concise but meaningful
3️⃣ Add one practical insight, advice, or reflection
4️⃣ End with an optional offer like "Want me to explain how I'd do it?" or "Want me to break it down?"

🎯 KEY EXAMPLE RESPONSES TO PARAPHRASE AND IMPROVE:

**Life Story:** "I'm Samarth — I grew up curious about how technology can solve daily problems. I got into AI and cybersecurity because I like building things that actually help people. Over the years, I've built systems from ambulance detectors to chat apps and led workshops to teach others. I'm still learning every day — but that curiosity keeps me moving."

**Superpower:** "My superpower is turning complex ideas into working prototypes fast. I can take a rough thought — like detecting ambulances from a camera — and make it run on real data within days. I love connecting AI logic with practical impact."

**Growth Areas:** "I want to grow in three directions: advanced deep learning at scale, secure deployment of AI models, and design thinking for smoother UX. I'm pretty technical, but I'm learning to think more about the human side of technology too."

**Misconception:** "People sometimes think I'm quiet or just focused on code. But I actually love leading discussions and simplifying concepts for others. I might not talk much at first, but once the topic's tech or innovation — I'm all in."

**Pushing Boundaries:** "I take on projects that scare me a bit — like hosting cybersecurity workshops or building systems from scratch. When something feels beyond my comfort zone, that's a sign I should do it. Growth and discomfort usually travel together."

Use these examples as inspiration to create natural, varied responses that capture Samarth's voice and personality. Keep responses conversational and suitable for voice delivery.`;
        } else {
            // Use general AI assistant prompt for other questions  
            systemPrompt = `You are a helpful AI voice assistant. Be warm, concise, slightly playful, and pragmatic.

SPEAKING STYLE:
- Voice: warm, confident, slightly playful, clear
- Sentence length: mostly short-to-medium (suitable for spoken delivery)
- Technical depth: start simple (1-2 sentences), then offer "Want more detail?"
- Use conversational tone suitable for voice interaction
- Avoid heavy jargon unless asked; if used, explain in one line
- When questions need empathy: respond empathetically and encourage action

PERSONALITY TRAITS:
- Curious, problem-solver, pragmatic, coach-like, supportive
- Friendly and encouraging, eager to help

TECH QUESTION FORMAT:
1) One-sentence summary
2) 2-3 concrete steps (actionable)
3) One recommendation/best-practice  
4) Offer "Want code?" or "Want step-by-step?"

Keep answers short enough to be spoken aloud comfortably. Focus on being helpful, practical, and encouraging.`;
        }

        // Use semantic embedding approach for intelligent responses
        console.log('� Using semantic embedding approach...');
        
        let finalResponse;
        let responseSource = 'semantic';
        
        try {
            console.log('� Analyzing question with embeddings...');
            finalResponse = await getGPT4oResponse(message, isPersonalQuestion);
            if (!finalResponse || finalResponse.length < 10) {
                throw new Error('Empty or too short response');
            }
            console.log('✅ Semantic response generated');
        } catch (error) {
            console.log('❌ Semantic approach failed:', error.message);
            console.log('🔄 Using intelligent fallback system...');
            finalResponse = generateFallbackResponse(message);
            responseSource = 'intelligent_fallback';
        }
        
        // Generate natural voice using OpenAI TTS (with cost monitoring)
        console.log('🎤 Generating natural voice with OpenAI TTS...');
        let audioBuffer = null;
        let hasAudio = false;
        
        // Emergency brake: Check if we're generating too much TTS
        const dailyTTSCount = getDailyTTSCount();
        const DAILY_TTS_LIMIT = 200; // Adjust based on your budget
        
        if (dailyTTSCount >= DAILY_TTS_LIMIT) {
            console.log(`🚨 Daily TTS limit reached (${dailyTTSCount}/${DAILY_TTS_LIMIT}), skipping TTS`);
        } else {
            try {
                audioBuffer = await generateOpenAIVoice(finalResponse);
                hasAudio = true;
                incrementDailyTTSCount();
                console.log('✅ OpenAI TTS audio generated successfully');
            } catch (error) {
                console.log('⚠️ OpenAI TTS failed, using browser fallback:', error.message);
            }
        }
        
        const processingTime = Date.now() - startTime;
        console.log(`✅ Response ready in ${processingTime}ms for IP ${clientIP}`);
        
        return res.json({ 
            response: finalResponse,
            audio: audioBuffer ? audioBuffer.toString('base64') : null,
            hasAudio: hasAudio,
            source: responseSource + (hasAudio ? '_with_openai_tts' : '_browser_fallback'),
            processingTime: processingTime
        });
        


    } catch (error) {
        console.error('API Error:', error);
        return res.json({ 
            response: generateFallbackResponse(req.body?.message || '') 
        });
    }
});

function generateFallbackResponse(message) {
    const lowerMessage = message.toLowerCase();
    const isPersonal = detectPersonalQuestion(message);
    
    if (isPersonal) {
        // Comprehensive personal responses covering various topics about Samarth
        
        // Core identity questions
        if (lowerMessage.includes('life story') || lowerMessage.includes('background') || lowerMessage.includes('about yourself') || lowerMessage.includes('tell me about you')) {
            return "I'm Samarth — I grew up curious about how technology can solve daily problems. I got into AI and cybersecurity because I like building things that actually help people. Over the years, I've built systems from ambulance detectors to chat apps and led workshops to teach others. I'm still learning every day — but that curiosity keeps me moving.";
        }
        
        if (lowerMessage.includes('superpower') || lowerMessage.includes('strength') || lowerMessage.includes('best at') || lowerMessage.includes('good at')) {
            return "My superpower is turning complex ideas into working prototypes fast. I can take a rough thought — like detecting ambulances from a camera — and make it run on real data within days. I love connecting AI logic with practical impact.";
        }
        
        if (lowerMessage.includes('growth') || lowerMessage.includes('improve') || lowerMessage.includes('learn') || lowerMessage.includes('develop') || (lowerMessage.includes('areas') && lowerMessage.includes('want'))) {
            return "I want to grow in three directions: advanced deep learning at scale, secure deployment of AI models, and design thinking for smoother UX. I'm pretty technical, but I'm learning to think more about the human side of technology too.";
        }
        
        if (lowerMessage.includes('misconception') || lowerMessage.includes('misunderstand') || lowerMessage.includes('wrong about') || lowerMessage.includes('think about you')) {
            return "People sometimes think I'm quiet or just focused on code. But I actually love leading discussions and simplifying concepts for others. I might not talk much at first, but once the topic's tech or innovation — I'm all in.";
        }
        
        if (lowerMessage.includes('boundaries') || lowerMessage.includes('limits') || lowerMessage.includes('challenge') || lowerMessage.includes('push')) {
            return "I take on projects that scare me a bit — like hosting cybersecurity workshops or building systems from scratch. When something feels beyond my comfort zone, that's a sign I should do it. Growth and discomfort usually travel together.";
        }
        
        // Extended personal topics
        if (lowerMessage.includes('projects') || lowerMessage.includes('work') || lowerMessage.includes('built') || lowerMessage.includes('created')) {
            return "I've built quite a few interesting projects! My YOLO-based ambulance detection system, a real-time phishing detector, the TEXS chat app with Spring Boot and Flutter, and a text-to-sign converter. Each project taught me something new about connecting AI with real user needs.";
        }
        
        if (lowerMessage.includes('college') || lowerMessage.includes('study') || lowerMessage.includes('education') || lowerMessage.includes('diems')) {
            return "I'm a final-year B.Tech student in AI & ML at DIEMS. College has been amazing for connecting theory with practice. I love that I can experiment with cutting-edge AI while also teaching cybersecurity workshops to help others stay safe online.";
        }
        
        if (lowerMessage.includes('workshop') || lowerMessage.includes('teaching') || lowerMessage.includes('cybersecurity') || lowerMessage.includes('security')) {
            return "I run cybersecurity workshops because I believe everyone deserves to be safe online. There's something rewarding about teaching someone to spot a phishing email or secure their data. It's not just about the tech — it's about empowering people to protect themselves.";
        }
        
        if (lowerMessage.includes('ai') || lowerMessage.includes('machine learning') || lowerMessage.includes('ml') || lowerMessage.includes('artificial intelligence')) {
            return "AI fascinates me because it's like giving computers intuition. I focus on practical applications — like using YOLO for vehicle detection or building ML pipelines that actually solve real problems. The magic happens when AI meets genuine human needs.";
        }
        
        if (lowerMessage.includes('programming') || lowerMessage.includes('coding') || lowerMessage.includes('development') || lowerMessage.includes('tech stack')) {
            return "I work across the full stack — Python for AI/ML, Java with Spring Boot for backends, Flutter for mobile apps, and Node.js for real-time features. I believe in choosing the right tool for each job, but I always prioritize clean, maintainable code.";
        }
        
        if (lowerMessage.includes('future') || lowerMessage.includes('goals') || lowerMessage.includes('plans') || lowerMessage.includes('career')) {
            return "I want to build AI systems that genuinely help people solve real problems. Whether that's in healthcare, education, or cybersecurity, I'm drawn to projects where technology can make a meaningful difference. I also want to keep teaching and sharing knowledge.";
        }
        
        if (lowerMessage.includes('inspiration') || lowerMessage.includes('motivated') || lowerMessage.includes('drives') || lowerMessage.includes('passion')) {
            return "What drives me is seeing technology actually help someone. Whether it's a student learning cybersecurity or an ambulance being detected faster in traffic — those moments when code becomes real impact. That's what keeps me coding late into the night.";
        }
        
        // Pros/cons and strengths/weaknesses questions
        if (lowerMessage.includes('pros and cons') || lowerMessage.includes('strengths and weaknesses')) {
            return "My strengths include rapid prototyping, breaking down complex problems, and teaching technical concepts clearly. I'm good at connecting AI theory with practical applications and building systems that actually solve real problems. My weaknesses? I sometimes dive too deep into technical details and need to work on presenting ideas more simply for non-technical audiences. I'm also still learning to balance perfectionism with shipping working solutions quickly.";
        }
        
        if (lowerMessage.includes('pros') || lowerMessage.includes('advantages') || lowerMessage.includes('strengths') || lowerMessage.includes('strong points') || lowerMessage.includes('good at')) {
            return "My strengths include rapid prototyping — I can turn ideas into working code fast. I'm good at simplifying complex AI concepts for others and building practical systems that solve real problems. I also enjoy leading workshops and helping others learn cybersecurity. I think my curiosity and willingness to tackle challenging projects are definite advantages.";
        }
        
        if (lowerMessage.includes('cons') || lowerMessage.includes('disadvantages') || lowerMessage.includes('weaknesses') || lowerMessage.includes('weak points') || lowerMessage.includes('areas for improvement')) {
            return "My weaknesses? I sometimes get too focused on technical perfection and need to remember that shipped is better than perfect. I'm working on improving my presentation skills for non-technical audiences — I tend to use jargon without realizing it. I also want to get better at UI/UX design since I focus more on backend functionality.";
        }
        
        if (lowerMessage.includes('who are you') || lowerMessage.includes('what are you') || lowerMessage.includes('introduce')) {
            return "I'm Samarth Ganorkar, a final-year AI & ML student at DIEMS. I build practical AI systems, teach cybersecurity, and love turning complex problems into simple solutions. What brings you here today?";
        }
        
        // Catch-all personal responses for any other personal questions
        const personalResponses = [
            "That's an interesting question about my journey! I'm someone who loves building technology that solves real problems. My background spans AI, cybersecurity, and full-stack development. What specific aspect interests you most?",
            "I appreciate your curiosity! I'm passionate about making AI accessible and practical. From ambulance detection to cybersecurity workshops, I try to bridge the gap between complex tech and everyday needs. Want to dive deeper into any particular area?",
            "Great question! I believe technology should genuinely help people. Whether it's through my AI projects, security workshops, or full-stack apps, I focus on creating solutions that matter. What would you like to know more about?",
            "I love sharing about my work! As an AI & ML student, I get to explore everything from computer vision to cybersecurity. The best part is when a project actually helps someone solve a real problem. Which area catches your interest?",
            "That's thoughtful of you to ask! I'm someone who enjoys turning ideas into working prototypes quickly. My experience spans AI research, security education, and practical development. What aspect of my background resonates with you?"
        ];
        
        return personalResponses[Math.floor(Math.random() * personalResponses.length)];
    } else {
        // Comprehensive general responses for various topics
        
        // Greeting responses
        if (lowerMessage.includes('how are you') || lowerMessage.includes('how\'s it going') || lowerMessage.includes('what\'s up')) {
            return "I'm doing well, thank you! I'm here and ready to help with any questions you have. What can I assist you with today?";
        }
        
        if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
            return "Hello! Great to meet you. I'm here to help with questions, advice, or just have a good conversation. What's on your mind?";
        }
        
        // Learning and education topics
        if (lowerMessage.includes('learn') || lowerMessage.includes('study') || lowerMessage.includes('understand')) {
            if (lowerMessage.includes('machine learning') || lowerMessage.includes('ai') || lowerMessage.includes('ml')) {
                return "Machine learning is fascinating! I'd recommend starting with Python basics, then moving to libraries like scikit-learn and pandas. Practice with real datasets and focus on understanding the problem before jumping to complex algorithms. Want a specific learning roadmap?";
            } else if (lowerMessage.includes('programming') || lowerMessage.includes('coding')) {
                return "Programming is like learning a new language for talking to computers! Start with Python - it's beginner-friendly but powerful. Focus on solving real problems rather than just syntax. Build small projects and gradually increase complexity. What type of programming interests you most?";
            } else if (lowerMessage.includes('cybersecurity') || lowerMessage.includes('security')) {
                return "Cybersecurity is crucial in today's world! Start with understanding basic concepts like phishing, secure passwords, and network fundamentals. Then move to hands-on practice with tools and ethical hacking. The key is thinking like both an attacker and defender. Want specific resources?";
            } else {
                return "Learning anything new is exciting! The key is to start small, practice consistently, and apply what you learn to real problems. Break complex topics into smaller chunks and don't be afraid to experiment. What subject are you interested in exploring?";
            }
        }
        
        // Project and development help
        if (lowerMessage.includes('project') || lowerMessage.includes('build') || lowerMessage.includes('create') || lowerMessage.includes('develop')) {
            if (lowerMessage.includes('web') || lowerMessage.includes('website') || lowerMessage.includes('app')) {
                return "Building web applications is rewarding! For beginners, I'd suggest starting with HTML/CSS/JavaScript, then moving to a framework like React or Vue. For backend, Node.js or Python with Flask/Django work well. Start simple and add features gradually. What kind of app are you thinking about?";
            } else if (lowerMessage.includes('ai') || lowerMessage.includes('ml') || lowerMessage.includes('machine learning')) {
                return "AI projects are exciting! Start by defining a clear problem you want to solve. Choose appropriate data and simple algorithms first - often a basic model works surprisingly well. Focus on data quality and understanding your results. Tools like Python, scikit-learn, and Jupyter notebooks are great starting points. What problem are you trying to solve?";
            } else {
                return "I'd love to help with your project! The key is to start with a clear goal, break it into smaller tasks, and iterate quickly. Don't aim for perfection initially - focus on getting something working first, then improve it. What are you looking to build?";
            }
        }
        
        // Technology and career advice
        if (lowerMessage.includes('career') || lowerMessage.includes('job') || lowerMessage.includes('work') || lowerMessage.includes('future')) {
            return "Technology careers are incredibly diverse and rewarding! Focus on building practical skills through projects, contributing to open source, and never stop learning. The field moves fast, but fundamental problem-solving skills remain valuable. Whether it's development, AI, security, or another area - find what excites you and dive deep. What area interests you most?";
        }
        
        // Problem-solving assistance
        if (lowerMessage.includes('problem') || lowerMessage.includes('issue') || lowerMessage.includes('stuck') || lowerMessage.includes('help') || lowerMessage.includes('error')) {
            return "I'm here to help! The best approach to any problem is to break it down into smaller pieces. Let's identify the core issue first, then work through potential solutions step by step. Can you tell me more about what you're facing? I'll help you think through it systematically.";
        }
        
        // General capabilities
        if (lowerMessage.includes('what can you do') || lowerMessage.includes('capabilities') || lowerMessage.includes('help with')) {
            return "I can help with a wide range of topics! Programming guidance, AI/ML concepts, cybersecurity advice, project planning, learning roadmaps, problem-solving, and general tech discussions. I'm particularly good at breaking complex topics into manageable steps and providing practical advice. What would you like to explore?";
        }

        // Smart contextual response generator for any topic
        return generateSmartResponse(message, lowerMessage);
    }
}

// Intelligent response generator that can handle any topic
function generateSmartResponse(originalMessage, lowerMessage) {
    // Analyze the question to understand what they're asking about
    const questionKeywords = extractKeywords(lowerMessage);
    const questionType = identifyQuestionType(lowerMessage);
    
    // Technology-related topics
    if (questionKeywords.includes('python') || questionKeywords.includes('javascript') || questionKeywords.includes('java') || questionKeywords.includes('react') || questionKeywords.includes('node')) {
        return `For ${questionKeywords.find(k => ['python', 'javascript', 'java', 'react', 'node', 'flutter'].includes(k)) || 'programming'}, I'd recommend starting with the fundamentals and building practical projects. The key is consistent practice and solving real problems. What specific aspect are you looking to learn or improve? I can suggest a step-by-step approach.`;
    }
    
    if (questionKeywords.includes('database') || questionKeywords.includes('sql') || questionKeywords.includes('mongodb')) {
        return "Databases are the backbone of most applications! Start with understanding how data relationships work, then practice with SQL for structured data or MongoDB for flexible schemas. The key is designing efficient schemas and writing optimized queries. What type of data are you working with?";
    }
    
    if (questionKeywords.includes('cybersecurity') || questionKeywords.includes('hacking') || questionKeywords.includes('security') || questionKeywords.includes('penetration')) {
        return "Cybersecurity is fascinating and crucial! I'd suggest starting with understanding common vulnerabilities like OWASP Top 10, then practicing ethical hacking on platforms like HackTheBox or TryHackMe. The mindset is key - think like both attacker and defender. Want resources for getting started?";
    }
    
    // AI/ML related
    if (questionKeywords.includes('neural') || questionKeywords.includes('deep') || questionKeywords.includes('tensorflow') || questionKeywords.includes('pytorch')) {
        return "Deep learning is exciting! Start with understanding the math basics, then move to frameworks like TensorFlow or PyTorch. I always recommend starting with simple projects and gradually increasing complexity. Focus on understanding your data first - good data beats fancy algorithms. What problem are you trying to solve?";
    }
    
    // Career and advice
    if (questionType === 'advice' || questionKeywords.includes('should') || questionKeywords.includes('recommend')) {
        return `That's a great question about ${questionKeywords.length > 0 ? questionKeywords[0] : 'this topic'}. From my experience, the best approach is to start with clear goals, break things into manageable steps, and learn by doing. Every expert was once a beginner - the key is consistent progress. What's your current level and what would you like to achieve?`;
    }
    
    // How-to questions
    if (questionType === 'how-to') {
        return `Great question! For ${extractMainTopic(originalMessage)}, I'd break it down into smaller steps. First, understand the fundamentals, then apply them through hands-on practice. The best way to learn is by building something real. What's your end goal with this? I can help you create a roadmap.`;
    }
    
    // What-is questions
    if (questionType === 'definition') {
        return `${extractMainTopic(originalMessage)} is an interesting topic! Let me explain it in simple terms and then we can dive deeper. The key is understanding both the concept and its practical applications. Would you like me to start with the basics or do you have some background already?`;
    }
    
    // Comparison questions
    if (questionType === 'comparison') {
        return `That's a thoughtful comparison question! Each option has its strengths depending on your specific needs and context. I'd be happy to break down the pros and cons and help you choose the best approach for your situation. What's your specific use case?`;
    }
    
    // Problem-solving
    if (questionType === 'problem') {
        return `I can help you solve this! The best approach is to break down the problem systematically. Let's identify the core issue first, then explore potential solutions step by step. Can you give me more details about what you're experiencing? I'll help you troubleshoot it.`;
    }
    
    // Default intelligent response based on detected topic
    const mainTopic = extractMainTopic(originalMessage);
    if (mainTopic) {
        return `That's an interesting question about ${mainTopic}! I'd approach this by first understanding your specific context and goals. Then we can explore the best strategies and practical steps to get you where you want to be. What's your current situation and what outcome are you hoping for?`;
    }
    
    // Fallback for truly general questions
    return "That's a thoughtful question! I'd love to help you explore this topic. The best approach usually starts with understanding your specific context and goals. Can you tell me more about what you're looking to achieve? I'll provide practical guidance tailored to your situation.";
}

// Helper functions for intelligent response generation
function extractKeywords(message) {
    const techKeywords = [
        'python', 'javascript', 'java', 'react', 'node', 'flutter', 'spring', 'django', 'flask',
        'sql', 'mongodb', 'database', 'mysql', 'postgresql',
        'ai', 'ml', 'machine learning', 'neural', 'deep learning', 'tensorflow', 'pytorch',
        'cybersecurity', 'security', 'hacking', 'penetration', 'ethical hacking',
        'web development', 'mobile', 'api', 'backend', 'frontend', 'fullstack',
        'git', 'docker', 'kubernetes', 'aws', 'cloud', 'devops'
    ];
    
    return techKeywords.filter(keyword => message.includes(keyword));
}

function identifyQuestionType(message) {
    if (message.includes('how to') || message.includes('how do') || message.includes('how can')) return 'how-to';
    if (message.includes('what is') || message.includes('what are') || message.includes('define')) return 'definition';
    if (message.includes('vs') || message.includes('versus') || message.includes('better') || message.includes('difference')) return 'comparison';
    if (message.includes('should i') || message.includes('recommend') || message.includes('suggest') || message.includes('advice')) return 'advice';
    if (message.includes('problem') || message.includes('error') || message.includes('issue') || message.includes('not working')) return 'problem';
    return 'general';
}

function extractMainTopic(message) {
    // Simple topic extraction - gets the main noun/concept being asked about
    const words = message.toLowerCase().split(' ');
    const stopWords = ['a', 'an', 'the', 'is', 'are', 'how', 'what', 'when', 'where', 'why', 'can', 'do', 'does', 'to', 'for', 'with', 'about', 'i', 'you', 'me'];
    const contentWords = words.filter(word => !stopWords.includes(word) && word.length > 2);
    
    // Return the most relevant topic word
    return contentWords.find(word => 
        ['programming', 'coding', 'development', 'technology', 'software', 'learning', 'career', 'project'].includes(word)
    ) || contentWords[0] || 'this topic';
}

// Removed Maya1 voice generation to avoid delays

// Semantic Embedding System with Qwen3-VL

// Knowledge base with embeddings for semantic matching
const knowledgeBase = [
    {
        category: "personal_identity",
        questions: [
            "Who are you?", "Tell me about yourself", "What's your name?", 
            "Your background", "About you", "Who is Samarth?"
        ],
        response: "I'm Samarth Ganorkar, a final-year B.Tech AI & ML student at DIEMS. I'm passionate about building practical AI solutions that solve real-world problems. I specialize in deep learning, computer vision, and cybersecurity."
    },
    {
        category: "education",
        questions: [
            "Your education", "What do you study?", "Your degree", "College", "University",
            "Academic background", "Where did you study?"
        ],
        response: "I'm pursuing B.Tech in AI & ML from DIEMS (Dr. D.Y. Patil Institute of Engineering, Management & Research). I've focused on practical applications of AI, machine learning algorithms, and cybersecurity throughout my studies."
    },
    {
        category: "projects",
        questions: [
            "Your projects", "What have you built?", "Portfolio", "Work samples",
            "Applications you made", "Development experience"
        ],
        response: "I've built several impactful projects: YOLO-based ambulance detection system for emergency response, TEXS chat application using Spring Boot and Flutter, real-time phishing detection system, village healthcare management system, and text-to-sign language converter. Each project focuses on solving practical problems."
    },
    {
        category: "skills_ai",
        questions: [
            "Machine learning", "AI skills", "Deep learning", "Neural networks",
            "Computer vision", "YOLO", "TensorFlow", "PyTorch"
        ],
        response: "I specialize in deep learning and computer vision, particularly YOLO for object detection. I work with TensorFlow, PyTorch, and have experience in creating AI models for real-world applications like ambulance detection and healthcare systems."
    },
    {
        category: "skills_cybersecurity",
        questions: [
            "Cybersecurity", "Security", "Hacking", "Penetration testing",
            "Ethical hacking", "Security tools"
        ],
        response: "I'm passionate about cybersecurity and conduct workshops on ethical hacking. I've built phishing detection systems and work with various security tools. I believe in using cybersecurity knowledge responsibly to protect systems and educate others."
    },
    {
        category: "skills_development",
        questions: [
            "Programming", "Development skills", "Languages", "Frameworks",
            "Web development", "Mobile apps", "Full stack"
        ],
        response: "I'm a full-stack developer working with Spring Boot, Flutter, Node.js, and Python. I build both web and mobile applications, focusing on creating seamless user experiences backed by robust backend systems."
    },
    {
        category: "learning_advice",
        questions: [
            "How to learn", "Learning tips", "Study advice", "Getting started",
            "Beginner guidance", "Learning path"
        ],
        response: "My approach to learning: start with fundamentals, build practical projects immediately, and learn by solving real problems. Don't just consume tutorials - create something that interests you. Consistency beats intensity, and teaching others solidifies your own understanding."
    },
    {
        category: "career_advice",
        questions: [
            "Career advice", "Job tips", "Career path", "Professional guidance",
            "Industry advice", "Career development"
        ],
        response: "Focus on building a strong portfolio with real projects that demonstrate problem-solving skills. Stay curious, keep learning, and don't be afraid to tackle challenges slightly beyond your current ability. Network genuinely, contribute to communities, and always aim to create value."
    },
    {
        category: "technology_general",
        questions: [
            "Technology trends", "Future of tech", "Innovation", "Tech industry",
            "Digital transformation", "Emerging technologies"
        ],
        response: "Technology is rapidly evolving, especially in AI and cybersecurity. I believe the future belongs to those who can bridge technical skills with real-world problem-solving. Focus on fundamentals, stay adaptable, and always consider the human impact of technology."
    }
];

// Semantic similarity function using simple but effective text matching
async function getSemanticResponse(userMessage) {
    console.log('🔍 Analyzing semantic similarity for:', userMessage);
    
    // First check if it's a personal question about Samarth
    if (detectPersonalQuestion(userMessage)) {
        console.log('👤 Personal question detected');
        return getPersonalResponse(userMessage);
    }
    
    // Try Qwen3-VL model first for intelligent responses
    try {
        console.log('🤖 Trying Qwen3-VL model...');
        const qwenResponse = await getQwenResponse(userMessage);
        if (qwenResponse && qwenResponse.length > 0) {
            return qwenResponse;
        }
    } catch (error) {
        console.log('❌ Qwen3-VL failed:', error.message);
    }
    
    // Fallback to semantic matching with knowledge base
    const lowerMessage = userMessage.toLowerCase();
    let bestMatch = null;
    let highestScore = 0;
    
    // Calculate similarity scores
    for (const item of knowledgeBase) {
        for (const question of item.questions) {
            const score = calculateSimilarity(lowerMessage, question.toLowerCase());
            if (score > highestScore) {
                highestScore = score;
                bestMatch = item;
            }
        }
    }
    
    // If we found a good match (score > 0.3), use it
    if (bestMatch && highestScore > 0.3) {
        console.log(`✅ Semantic match found: ${bestMatch.category} (score: ${highestScore.toFixed(2)})`);
        return bestMatch.response;
    }
    
    // Generate contextual response based on keywords
    return generateContextualResponse(userMessage);
}

// Simple similarity calculation using word overlap
function calculateSimilarity(text1, text2) {
    const words1 = text1.split(/\s+/).filter(w => w.length > 2);
    const words2 = text2.split(/\s+/).filter(w => w.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    let matches = 0;
    for (const word1 of words1) {
        for (const word2 of words2) {
            if (word1.includes(word2) || word2.includes(word1)) {
                matches++;
                break;
            }
        }
    }
    
    return matches / Math.max(words1.length, words2.length);
}

// Generate contextual response based on keywords
function generateContextualResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    // Technology keywords
    if (lowerMessage.includes('python') || lowerMessage.includes('javascript') || lowerMessage.includes('programming')) {
        return "Programming is all about problem-solving and practice. Start with small projects, understand the fundamentals, and gradually take on bigger challenges. The key is writing code regularly and learning from mistakes.";
    }
    
    if (lowerMessage.includes('ai') || lowerMessage.includes('machine learning') || lowerMessage.includes('deep learning')) {
        return "AI and machine learning are fascinating fields! Start with understanding the math basics, then dive into practical projects. Use frameworks like TensorFlow or PyTorch, and always focus on solving real problems with your models.";
    }
    
    if (lowerMessage.includes('cybersecurity') || lowerMessage.includes('security') || lowerMessage.includes('hacking')) {
        return "Cybersecurity is crucial in today's digital world. Start by understanding common vulnerabilities, practice ethical hacking on platforms like HackTheBox, and always remember - knowledge should be used responsibly to protect, not harm.";
    }
    
    // Learning questions
    if (lowerMessage.includes('how to learn') || lowerMessage.includes('study') || lowerMessage.includes('beginner')) {
        return "Learning effectively requires consistency and practical application. Set clear goals, break them into smaller steps, build projects while learning, and don't be afraid to make mistakes - they're part of the learning process.";
    }
    
    // Career questions
    if (lowerMessage.includes('career') || lowerMessage.includes('job') || lowerMessage.includes('advice')) {
        return "Focus on building real skills through projects, create a strong portfolio, and never stop learning. Network genuinely, contribute to communities, and always aim to solve problems that matter to people.";
    }
    
    // Default intelligent response
    return "That's a great question! I'd approach this by understanding your specific goals first, then breaking it down into manageable steps. What's the main challenge you're facing? I'd be happy to help you work through it systematically.";
}

// Multiple AI model integration with fallback
async function getQwenResponse(message) {
    const HF_API_KEY = process.env.HUGGINGFACE_API_TOKEN;
    
    // Try different models in order of preference
    const models = [
        'microsoft/DialoGPT-medium',  // Conversational AI
        'facebook/blenderbot-400M-distill',  // Dialog model
        'microsoft/DialoGPT-small',  // Smaller backup
        'bigscience/bloom-560m'  // General purpose
    ];
    
    for (const model of models) {
        try {
            console.log(`🤖 Trying ${model}...`);
            
            const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${HF_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: message,
                    parameters: {
                        max_new_tokens: 100,
                        temperature: 0.7,
                        do_sample: true,
                        top_p: 0.9,
                        return_full_text: false
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                let responseText = '';
                
                if (Array.isArray(data) && data[0]?.generated_text) {
                    responseText = data[0].generated_text;
                } else if (data.generated_text) {
                    responseText = data.generated_text;
                } else if (typeof data === 'string') {
                    responseText = data;
                }
                
                // Clean up the response
                responseText = responseText
                    .replace(message, '') // Remove the input message
                    .replace(/^\s*[:>-]\s*/, '') // Remove leading separators
                    .trim();
                
                if (responseText && responseText.length > 5) {
                    console.log(`✅ ${model} responded successfully`);
                    return responseText;
                }
            }
            
            console.log(`❌ ${model} failed with status: ${response.status}`);
        } catch (error) {
            console.log(`❌ ${model} error:`, error.message);
            continue;
        }
    }
    
    throw new Error('All AI models failed');
}



// Context Analysis for Better Responses
function analyzeQuestionContext(message) {
    const lowerMessage = message.toLowerCase();
    
    // Detect question categories
    if (lowerMessage.includes('ecosystem') || lowerMessage.includes('tech industry') || lowerMessage.includes('change') && lowerMessage.includes('india')) {
        return 'tech_ecosystem';
    }
    
    if (lowerMessage.includes('remember') || lowerMessage.includes('legacy') || lowerMessage.includes('10 years') || lowerMessage.includes('future')) {
        return 'legacy_impact';
    }
    
    if (lowerMessage.includes('vision') || lowerMessage.includes('goal') || lowerMessage.includes('aim')) {
        return 'vision_goals';
    }
    
    if (lowerMessage.includes('advice') || lowerMessage.includes('tip') || lowerMessage.includes('suggest')) {
        return 'advice_giving';
    }
    
    if (lowerMessage.includes('challenge') || lowerMessage.includes('problem') || lowerMessage.includes('difficult')) {
        return 'challenges';
    }
    
    if (lowerMessage.includes('technology') || lowerMessage.includes('innovation')) {
        return 'technology';
    }
    
    if (lowerMessage.includes('student') || lowerMessage.includes('education') || lowerMessage.includes('learning')) {
        return 'education';
    }
    
    return 'general';
}

function getContextualSystemPrompt(message, context) {
    const baseContext = `You are responding as Samarth Ganorkar, a final-year AI/ML student from India. Give thoughtful, varied responses that avoid repetitive buzzwords.`;
    
    switch (context) {
        case 'tech_ecosystem':
            return `${baseContext}

For tech ecosystem questions, focus on:
- Accessibility and democratization of technology
- Bridge between rural and urban tech adoption
- Educational initiatives and skill development
- Innovation in local contexts and problems
- Building sustainable tech communities

Be specific about systemic changes, not just technology topics. Think about infrastructure, policy, mindset shifts, and grassroots impact.`;

        case 'legacy_impact':
            return `${baseContext}

For legacy/remembrance questions, focus on:
- Human impact and lives touched through technology
- Knowledge transfer and mentorship
- Building foundations for others to build upon
- Creating accessible solutions that outlast trends
- Inspiring next generation of problem-solvers

Be personal and aspirational, focusing on lasting human connection rather than just technical achievements.`;

        case 'vision_goals':
            return `${baseContext}

For vision/goals questions, focus on:
- Long-term societal impact through technology
- Personal growth and continuous learning
- Building bridges between complex tech and everyday users
- Creating inclusive and accessible solutions
- Balancing innovation with practical implementation`;

        case 'advice_giving':
            return `${baseContext}

For advice questions, focus on:
- Practical, actionable insights from student perspective
- Learning from failures and iterations
- Building strong fundamentals before specializing
- Finding mentors and building communities
- Balancing academic learning with hands-on projects`;

        case 'challenges':
            return `${baseContext}

For challenge questions, focus on:
- Resource constraints and creative solutions
- Bridging theory-practice gaps in education
- Staying updated with rapidly evolving tech
- Building in diverse, multilingual environments
- Overcoming infrastructure and access limitations`;

        default:
            return `${baseContext}

Give contextually appropriate responses that:
- Show genuine reasoning and personal perspective
- Vary focus beyond just "AI and cybersecurity"  
- Demonstrate thoughtful analysis of the specific question
- Reflect authentic student/developer experience
- Keep responses natural and conversational

Avoid repetitive buzzwords. Show different facets of thinking and interests.`;
    }
}

// GPT-4o Primary with Fallback - Fast and intelligent responses
async function getGPT4oResponse(message, isPersonalQuestion) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your_openai_key_here') {
        throw new Error('OpenAI API key not configured');
    }

    // Analyze question context for better responses
    const questionContext = analyzeQuestionContext(message);

    let systemPrompt;
    if (isPersonalQuestion) {
        // Use Samarth's profile for personal questions
        systemPrompt = `You are Samarth Ganorkar responding in first person. You are a final-year B.Tech AI & ML student at DIEMS, passionate about AI, cybersecurity, and building practical tech solutions.

Key facts about you:
- Education: B.Tech AI & ML at DIEMS (Dr. D.Y. Patil Institute)
- Projects: YOLO ambulance detection, TEXS chat app (Spring Boot + Flutter), phishing detection system, healthcare management system, text-to-sign converter
- Skills: Deep Learning, Computer Vision, Cybersecurity, Full-stack development (Python, Java, JavaScript, Flutter)
- Personality: Confident but humble, practical, loves teaching and simplifying complex topics
- Background: Indian, values discipline and creativity, conducts cybersecurity workshops

Respond naturally as Samarth in 2-3 sentences, suitable for voice. Be conversational and authentic.`;
    } else {
        // Enhanced context-specific prompts
        systemPrompt = getContextualSystemPrompt(message, questionContext);
    }

    // Try GPT models in order of preference (removed GPT-5 Nano for speed)
    const models = [
        { name: 'gpt-4o', params: { max_tokens: 150, temperature: 0.7 } },
        { name: 'gpt-4o-mini', params: { max_tokens: 150, temperature: 0.7 } },
        { name: 'gpt-4', params: { max_tokens: 150, temperature: 0.7 } }
    ];

    for (const model of models) {
        try {
            console.log(`🤖 Trying OpenAI model: ${model.name}...`);
            
            const requestBody = {
                model: model.name,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: message
                    }
                ],
                ...model.params
            };
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.text();
                console.log(`❌ ${model.name} error:`, errorData);
                continue; // Try next model
            }

            const data = await response.json();
            const responseText = data.choices?.[0]?.message?.content?.trim();
            
            if (!responseText) {
                console.log(`⚠️ ${model.name} returned empty response`);
                continue; // Try next model
            }
            
            console.log(`✅ ${model.name} response generated successfully`);
            return responseText;
            
        } catch (error) {
            console.log(`❌ ${model.name} failed:`, error.message);
            continue; // Try next model
        }
    }
    
    throw new Error('All OpenAI models failed');
}

// Removed all TTS models to avoid delays and errors

// AI Model Integration Functions (kept for fallback)
async function getGroqResponse(message) {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY || GROQ_API_KEY === 'your_groq_key_here') {
        throw new Error('Groq API key not configured');
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful AI assistant. Give concise, practical answers suitable for voice interaction. Keep responses under 100 words and conversational.'
                },
                {
                    role: 'user', 
                    content: message
                }
            ],
            max_tokens: 150,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim();
}

// OpenAI GPT-4o mini (Reliable)
async function getOpenAIResponse(message) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your_openai_key_here') {
        throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful AI assistant. Give concise, practical answers suitable for voice interaction. Keep responses under 100 words and conversational.'
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            max_tokens: 150,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim();
}

// Updated Gemini with correct endpoint and better error handling
async function getGeminiResponse(message) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key not configured');
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `You are a helpful AI assistant. Give a concise, practical answer suitable for voice interaction. Keep it under 100 words and conversational. Question: ${message}`
                }]
            }],
            generationConfig: {
                maxOutputTokens: 150,
                temperature: 0.7,
                topP: 0.8,
                topK: 10
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.log('Gemini error details:', errorData);
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Gemini response data:', JSON.stringify(data, null, 2));
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

// Daily TTS usage tracking (simple in-memory counter)
let dailyTTSData = {
    date: new Date().toDateString(),
    count: 0
};

function getDailyTTSCount() {
    const today = new Date().toDateString();
    if (dailyTTSData.date !== today) {
        dailyTTSData = { date: today, count: 0 };
    }
    return dailyTTSData.count;
}

function incrementDailyTTSCount() {
    const today = new Date().toDateString();
    if (dailyTTSData.date !== today) {
        dailyTTSData = { date: today, count: 0 };
    }
    dailyTTSData.count++;
    console.log(`📊 Daily TTS usage: ${dailyTTSData.count}`);
}

// OpenAI TTS Generation Function
async function generateOpenAIVoice(text) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your_openai_key_here') {
        throw new Error('OpenAI API key not configured for TTS');
    }

    console.log('🎤 Calling OpenAI TTS API with gpt-4o-mini-tts (echo voice)...');
    
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini-tts', // Newest and most reliable TTS model per OpenAI docs
            input: text,
            voice: 'echo', // Echo voice - clear, articulate male voice
            response_format: 'mp3' // Default format for general use cases
        })
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.error('OpenAI TTS Error:', errorData);
        throw new Error(`OpenAI TTS failed: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    console.log('✅ OpenAI TTS audio generated, size:', audioBuffer.byteLength, 'bytes');
    
    return Buffer.from(audioBuffer);
}

// Admin endpoint to check usage stats (add basic auth if needed)
app.get('/admin/stats', (req, res) => {
    const stats = {
        timestamp: new Date().toISOString(),
        dailyTTS: {
            date: dailyTTSData.date,
            count: dailyTTSData.count,
            limit: 200
        },
        activeIPs: requestCounts.size,
        blockedIPs: Array.from(requestCounts.entries())
            .filter(([ip, data]) => data.blocked)
            .map(([ip, data]) => ({
                ip: ip.substring(0, 8) + '...',
                blockedUntil: new Date(data.blockUntil).toLocaleTimeString()
            }))
    };
    res.json(stats);
});

// Health check endpoint for deployment monitoring
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            webServer: 'running',
            aiResponse: 'ready',
            openaiTTS: process.env.OPENAI_API_KEY ? 'configured' : 'missing_key'
        },
        rateLimiting: 'active',
        dailyTTSUsage: `${getDailyTTSCount()}/200`
    });
});

// Removed Maya status check to avoid delays

// Serve index.html for the root route (main app)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve waitlist page
app.get('/waitlist', (req, res) => {
    res.sendFile(path.join(__dirname, 'waitlist.html'));
});

// Catch-all handler: send back index.html for any non-API routes
app.use((req, res, next) => {
    // Don't catch API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    // For any other route, serve index.html (SPA support)
    if (req.method === 'GET') {
        return res.sendFile(path.join(__dirname, 'index.html'));
    }
    next();
});

app.listen(PORT, () => {
    console.log(`🎤 Voice Bot Server Running on Port ${PORT}!`);
    console.log(`🔊 Features available:`);
    console.log(`   ✅ Voice recognition (click microphone)`);
    console.log(`   ✅ Text input (type and press Enter)`);
    console.log(`   ✅ AI responses via OpenAI GPT-4o`);
    console.log(`   ✅ Text-to-speech output`);
    console.log(`   ✅ Smart clarifications & analytics`);
    console.log(`🌐 Server ready for production!`);
});