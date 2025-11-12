// Voice Bot Application
class VoiceBot {
    constructor() {
        this.isListening = false;
        this.isMuted = false;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.conversationHistory = [];
        this.voiceSettings = {
            rate: 0.75,     // Much slower for human-like speech
            pitch: 0.95,    // Slightly lower for warmth
            volume: 0.85    // Softer, more natural volume
        };
        
        // Initialize components
        this.initializeElements();
        this.initializeSpeechRecognition();
        this.initializeEventListeners();
        this.setupPersonality();
        
        // Check browser compatibility
        this.checkBrowserSupport();
        
        // Preload voices for better selection
        this.loadVoices();
    }

    initializeElements() {
        this.micBtn = document.getElementById('micBtn');
        this.voiceStatus = document.getElementById('voiceStatus');
        this.textInput = document.getElementById('textInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.muteBtn = document.getElementById('muteBtn');
        this.muteText = document.getElementById('muteText');
        this.chatContainer = document.getElementById('chatContainer');
        this.loading = document.getElementById('loading');
        this.waveBars = document.getElementById('waveBars');
        
        // Page navigation elements
        this.homePage = document.getElementById('homePage');
        this.chatInterface = document.getElementById('chatInterface');
        this.proceedBtn = document.getElementById('proceedBtn');
        this.backBtn = document.getElementById('backBtn');
        this.inputSection = document.getElementById('inputSection');
        
        // Initialize page navigation
        this.initializeNavigation();
        
        // Initialize wave visualizer
        this.initializeWaveVisualizer();
    }

    setupPersonality() {
        // Generic AI assistant personality - helpful and friendly
        this.personality = {
            name: "AI Assistant",
            responses: {
                // Remove specific personal responses to make bot more versatile
            }
        };
    }

    initializeSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
            
            this.recognition.onstart = () => {
                this.isListening = true;
                this.micBtn.classList.add('recording');
                this.voiceStatus.textContent = 'VOICE INPUT ACTIVE - LISTENING...';
                this.animateWaves(true);
            };
            
            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                if (finalTranscript) {
                    this.textInput.value = finalTranscript.trim();
                    this.sendMessage();
                } else {
                    this.voiceStatus.textContent = `Listening: ${interimTranscript}`;
                }
            };
            
            this.recognition.onerror = (event) => {
                this.stopListening();
                this.voiceStatus.textContent = `Speech recognition error: ${event.error}`;
                console.error('Speech recognition error:', event.error);
            };
            
            this.recognition.onend = () => {
                this.stopListening();
                this.animateWaves(false);
            };
        } else {
            this.voiceStatus.textContent = 'Speech recognition not supported in this browser';
            this.micBtn.disabled = true;
        }
    }

    initializeEventListeners() {
        this.micBtn.addEventListener('click', () => {
            if (this.isListening) {
                this.stopListening();
            } else {
                this.startListening();
            }
        });

        this.sendBtn.addEventListener('click', () => this.sendMessage());
        
        this.textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        this.clearBtn.addEventListener('click', () => this.clearChat());
        
        this.muteBtn.addEventListener('click', () => this.toggleMute());
        
        // Add voice selection when voices are loaded
        if (this.synthesis) {
            this.synthesis.onvoiceschanged = () => {
                this.logAvailableVoices();
            };
            // Also try immediately in case voices are already loaded
            setTimeout(() => this.logAvailableVoices(), 1000);
        }
    }

    initializeNavigation() {
        // Proceed to chat button
        if (this.proceedBtn) {
            this.proceedBtn.addEventListener('click', () => {
                this.showChatInterface();
            });
        }
        
        // Back to home button
        if (this.backBtn) {
            this.backBtn.addEventListener('click', () => {
                this.showHomePage();
            });
        }
    }
    
    showChatInterface() {
        if (this.homePage && this.chatInterface && this.inputSection) {
            this.homePage.style.display = 'none';
            this.chatInterface.style.display = 'flex';
            this.inputSection.style.display = 'block';
            
            // Initialize wave visualizer when entering chat
            this.initializeWaveVisualizer();
            
            console.log('> Entered chat interface');
        }
    }
    
    showHomePage() {
        if (this.homePage && this.chatInterface && this.inputSection) {
            this.homePage.style.display = 'flex';
            this.chatInterface.style.display = 'none';
            this.inputSection.style.display = 'none';
            
            // Stop any ongoing speech
            if (this.synthesis) {
                this.synthesis.cancel();
            }
            
            // Stop listening
            this.stopListening();
            
            console.log('> Returned to home page');
        }
    }

    initializeWaveVisualizer() {
        // Create wave bars dynamically
        if (!this.waveBars) return;
        
        this.waveBarCount = 40;
        this.waveBars.innerHTML = '';
        
        for (let i = 0; i < this.waveBarCount; i++) {
            const bar = document.createElement('div');
            bar.className = 'wave-bar';
            bar.style.animationDelay = `${(i * 0.1)}s`;
            this.waveBars.appendChild(bar);
        }
        
        this.waveActive = false;
    }
    
    animateWaves(active = true) {
        this.waveActive = active;
        const bars = this.waveBars.querySelectorAll('.wave-bar');
        
        if (active) {
            bars.forEach((bar, index) => {
                bar.classList.add('active');
                // Stagger the animation for a wave effect
                bar.style.animationDelay = `${(index * 0.05)}s`;
            });
        } else {
            bars.forEach(bar => {
                bar.classList.remove('active');
            });
        }
    }

    checkBrowserSupport() {
        const warnings = [];
        
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            warnings.push('Speech recognition is not supported in this browser. You can still use text input.');
        }
        
        if (!('speechSynthesis' in window)) {
            warnings.push('Text-to-speech is not supported in this browser.');
        }
        
        if (warnings.length > 0) {
            this.addBotMessage(`⚠️ SYSTEM WARNING: ${warnings.join(' ')}`);
        }
    }

    startListening() {
        if (this.recognition && !this.isListening) {
            try {
                this.recognition.start();
            } catch (error) {
                console.error('Error starting speech recognition:', error);
                this.voiceStatus.textContent = 'Could not start speech recognition';
            }
        }
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
        
        this.isListening = false;
        this.micBtn.classList.remove('recording');
        this.voiceStatus.textContent = 'READY FOR VOICE INPUT';
        this.animateWaves(false);
    }

    async sendMessage() {
        const message = this.textInput.value.trim();
        if (!message) return;

        // Add user message to chat
        this.addUserMessage(message);
        this.textInput.value = '';
        
        // Show loading
        this.showLoading(true);
        
        try {
            // Get AI response (now includes audio)
            const responseData = await this.getAIResponse(message);
            
            // Handle both text and audio response
            if (typeof responseData === 'string') {
                // Old format - just text
                this.addBotMessage(responseData);
                if (!this.isMuted) {
                    this.speak(responseData);
                }
            } else {
                // New format - text + optional OpenAI audio
                this.addBotMessage(responseData.response);
                
                // Debug: Show which AI system responded
                if (responseData.source) {
                    console.log(`🤖 Response from: ${responseData.source}`);
                }
                
                // Prioritize OpenAI TTS for natural voice, fallback to browser TTS
                if (!this.isMuted) {
                    if (responseData.hasAudio && responseData.audio) {
                        console.log('🎤 Playing OpenAI TTS audio (natural voice)...');
                        this.voiceStatus.textContent = 'AI SPEAKING - OPENAI VOICE SYNTHESIS';
                        this.animateWaves(true);
                        this.playOpenAIAudio(responseData.audio);
                    } else {
                        console.log('🎤 Fallback to enhanced browser TTS...');
                        this.voiceStatus.textContent = 'AI SPEAKING - BROWSER VOICE SYNTHESIS';
                        this.animateWaves(true);
                        this.speak(responseData.response);
                    }
                }
            }
        } catch (error) {
            console.error('Error getting AI response:', error);
            this.addBotMessage("I'm sorry, I'm having trouble connecting right now. Please try again in a moment.");
        } finally {
            this.showLoading(false);
        }
    }

    async getAIResponse(message) {
        // Try API first for all messages
        try {
            const apiResponse = await this.callChatGPTAPI(message);
            return apiResponse;
        } catch (error) {
            // Fallback to generic helpful responses
            return {
                response: this.generatePersonalityResponse(message),
                hasAudio: false,
                audio: null
            };
        }
    }

    async callChatGPTAPI(message) {
        // Try to call the serverless function
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    history: this.conversationHistory
                })
            });
            
            if (!response.ok) {
                throw new Error('API request failed');
            }
            
            const data = await response.json();
            return data; // Now returns full response object with text and audio
        } catch (error) {
            // If API fails, throw error to trigger fallback
            throw new Error('API not available');
        }
    }

    generatePersonalityResponse(message) {
        const lowerMessage = message.toLowerCase();
        const isPersonal = this.detectPersonalQuestion(message);
        
        if (isPersonal) {
            // Personal questions - use Samarth's voice
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
            
            if (lowerMessage.includes('who are you') || lowerMessage.includes('what are you')) {
                return "I'm Samarth Ganorkar, a final-year AI & ML student at DIEMS. I build practical AI systems, teach cybersecurity, and love turning complex problems into simple solutions. What brings you here today?";
            }
            
            // General personal responses
            const personalResponses = [
                "That's a thoughtful question about me. I'm someone who loves connecting technology with real-world impact. What specific aspect are you curious about?",
                "I appreciate you asking! I'm passionate about AI, cybersecurity, and teaching others. There's something satisfying about making complex things accessible. Want to know more about any particular area?",
                "Good question! I'm always happy to share my perspective. I believe in building technology that genuinely helps people. What would you like to explore about my journey?"
            ];
            
            return personalResponses[Math.floor(Math.random() * personalResponses.length)];
        } else {
            // Basic greeting responses
            if (lowerMessage.includes('how are you') || lowerMessage.includes('how\'s it going') || lowerMessage.includes('what\'s up')) {
                return "I'm doing well, thank you! I'm here and ready to help with any questions you have. What can I assist you with today?";
            }
            
            // Generic helpful responses
            const responses = [
                "That's a great question! I'd approach it by breaking it down into smaller, manageable pieces first. What specific aspect would you like to explore?",
                "Interesting! I find it helps to start simple and build from there. What's the main goal you're trying to achieve?",
                "I love helping with questions like this! Let me think about this step by step and give you a practical approach.",
                "That's something worth exploring! I'd recommend starting with the fundamentals and then building up. Would you like me to walk you through it?",
                "Good question! The best approach usually starts with understanding the core problem. Can you tell me more about what you're trying to accomplish?"
            ];
            
            return responses[Math.floor(Math.random() * responses.length)];
        }
    }

    detectPersonalQuestion(message) {
        const lowerMessage = message.toLowerCase();
        
        // Personal question patterns
        const personalPatterns = [
            // Direct personal questions
            /\b(your|you)\s+(life story|background|story|history)/,
            /\b(your|you)\s+(superpower|strength|talent|skill)/,
            /\btell me about (yourself|you)\b/,
            /\bwhat.*(your|you).*(grow|improve|learn|develop)/,
            /\bmisconception.*about (you|yourself)/,
            /\b(your|you)\s+(boundaries|limits|challenge)/,
            /\bwho are you\b/,
            /\bwhat are you\b/,
            
            // Specific personal question formats
            /what should.*know about.*life story/,
            /what.*your.*superpower/,
            /top.*areas.*like to grow/,
            /misconception.*coworkers.*about you/,
            /how.*you.*push.*boundaries/,
            /how.*you.*push.*limits/,
            
            // General personal inquiry patterns
            /\btell.*about.*yourself/,
            /\bwhat.*you.*good at/,
            /\bwhat.*you.*best at/,
            /\byour.*expertise/,
            /\byour.*experience/,
            /\byour.*projects/,
            /\byour.*work/,
            /\babout.*yourself/
        ];
        
        // Check if message matches any personal pattern
        return personalPatterns.some(pattern => pattern.test(lowerMessage));
    }

    addUserMessage(message) {
        const messageDiv = this.createMessageElement(message, 'user');
        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
        
        // Add to conversation history
        this.conversationHistory.push({ role: 'user', content: message });
    }

    addBotMessage(message) {
        const messageDiv = this.createMessageElement(message, 'bot');
        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
        
        // Store last bot message for fallback TTS
        this.lastBotMessage = message;
        
        // Add to conversation history
        this.conversationHistory.push({ role: 'assistant', content: message });
    }

    createMessageElement(message, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
        
        const textDiv = document.createElement('div');
        textDiv.className = 'text';
        textDiv.textContent = message;
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(textDiv);
        
        return messageDiv;
    }

    loadVoices() {
        // Force voice loading
        if (this.synthesis) {
            const voices = this.synthesis.getVoices();
            if (voices.length === 0) {
                // Wait for voices to load
                this.synthesis.addEventListener('voiceschanged', () => {
                    this.logAvailableVoices();
                }, { once: true });
            } else {
                this.logAvailableVoices();
            }
        }
    }

    // Play OpenAI generated audio (natural TTS)
    playOpenAIAudio(base64Audio) {
        try {
            // Convert base64 to audio blob
            const audioData = atob(base64Audio);
            const audioArray = new Uint8Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
                audioArray[i] = audioData.charCodeAt(i);
            }
            
            const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Create and play audio element
            const audio = new Audio(audioUrl);
            audio.volume = 0.8; // Comfortable listening level
            
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl); // Clean up memory
                this.voiceStatus.textContent = 'READY FOR VOICE INPUT';
                this.animateWaves(false);
                console.log('🎤 OpenAI TTS playback completed');
            };
            
            audio.onerror = (error) => {
                console.error('🎤 OpenAI audio playback error:', error);
                URL.revokeObjectURL(audioUrl);
                // Fallback to browser TTS if OpenAI audio fails
                this.speak(this.lastBotMessage || 'Audio playback failed');
            };
            
            audio.play().catch(error => {
                console.error('🎤 Audio play failed:', error);
                // Fallback to browser TTS
                this.speak(this.lastBotMessage || 'Audio playback failed');
            });
            
        } catch (error) {
            console.error('🎤 OpenAI audio processing error:', error);
            // Fallback to browser TTS
            this.speak(this.lastBotMessage || 'Audio processing failed');
        }
    }

    speak(text) {
        if (!this.synthesis || this.isMuted) return;
        
        // Cancel any ongoing speech immediately
        this.synthesis.cancel();
        
        // Small delay to ensure cancellation is processed
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            
        // Configure for extremely natural human-like speech (22 year old male)
        utterance.rate = 0.6;     // Very slow, intimate conversational pace
        utterance.pitch = 0.85;    // Lower, warmer, more masculine pitch
        utterance.volume = 0.9;    // Clear but natural volume
        
        // Find the best male voice available (prioritizing Indian/English accents)
        const voices = this.synthesis.getVoices();
        
        // Priority list for most natural human-like voices
        const naturalVoicePreferences = [
            'Alex',                                       // Mac - legendary natural voice
            'Google US English Male',                     // Google's natural synthesis
            'Microsoft Ravi - English (India)',           // Indian male - warm accent
            'Microsoft David Desktop - English (United States)', // Deep, rich voice
            'Microsoft Hemant - English (India)',         // Indian male alternative
            'Microsoft Mark - English (United States)',   // Clear male voice
            'Google UK English Male',                     // British pronunciation
            'Daniel',                                     // Classic male voice
            'Microsoft Ryan - English (United States)',   // Another natural option
            'Google English (US)',                       // Clean synthesis
            'Fred',                                       // Mac alternative
            'Tom',                                        // Natural alternative
            'Ralph'                                       // Backup option
        ];        let selectedVoice = null;
        
        // Try to find most natural voices first
        for (const preference of naturalVoicePreferences) {
            selectedVoice = voices.find(voice => 
                voice.name.includes(preference) || 
                voice.name.toLowerCase().includes(preference.toLowerCase())
            );
            if (selectedVoice) {
                console.log(`🎯 Found preferred male voice: ${selectedVoice.name}`);
                break;
            }
        }
        
        // Fallback: find any male voice by keywords
        if (!selectedVoice) {
            selectedVoice = voices.find(voice => 
                voice.name.toLowerCase().includes('male') ||
                voice.name.toLowerCase().includes('david') ||
                voice.name.toLowerCase().includes('mark') ||
                voice.name.toLowerCase().includes('ravi') ||
                voice.name.toLowerCase().includes('hemant') ||
                voice.name.toLowerCase().includes('daniel') ||
                voice.name.toLowerCase().includes('alex') ||
                (voice.name.toLowerCase().includes('english') && 
                 !voice.name.toLowerCase().includes('female') &&
                 !voice.name.toLowerCase().includes('zira') &&
                 !voice.name.toLowerCase().includes('samantha') &&
                 !voice.name.toLowerCase().includes('susan'))
            );
            
            if (selectedVoice) {
                console.log(`🔄 Found male voice fallback: ${selectedVoice.name}`);
            }
        }
        
        // Final fallback: avoid obviously female voices
        if (!selectedVoice && voices.length > 0) {
            selectedVoice = voices.find(voice => 
                !voice.name.toLowerCase().includes('female') &&
                !voice.name.toLowerCase().includes('zira') &&
                !voice.name.toLowerCase().includes('samantha') &&
                !voice.name.toLowerCase().includes('susan') &&
                !voice.name.toLowerCase().includes('karen') &&
                !voice.name.toLowerCase().includes('moira') &&
                !voice.name.toLowerCase().includes('victoria')
            ) || voices[0]; // Use first voice if no good options
        }
            
            if (selectedVoice) {
                utterance.voice = selectedVoice;
                console.log(`🎤 Using voice: ${selectedVoice.name} (${selectedVoice.lang}) - Rate: ${utterance.rate}x`);
            } else {
                console.log(`🎤 Using default system voice - Rate: ${utterance.rate}x`);
            }
        
            // Process text for extremely natural, conversational speech
            let processedText = text
                // Make contractions more natural and casual
                .replace(/\bI am\b/gi, "I'm")
                .replace(/\bI will\b/gi, "I'll")
                .replace(/\bI would\b/gi, "I'd")
                .replace(/\bI have\b/gi, "I've")
                .replace(/\bI had\b/gi, "I'd")
                .replace(/\bthat is\b/gi, "that's")
                .replace(/\bthat will\b/gi, "that'll")
                .replace(/\bwhat is\b/gi, "what's")
                .replace(/\bwhere is\b/gi, "where's")
                .replace(/\bthere is\b/gi, "there's")
                .replace(/\bdo not\b/gi, "don't")
                .replace(/\bcannot\b/gi, "can't")
                .replace(/\bwill not\b/gi, "won't")
                .replace(/\bshould not\b/gi, "shouldn't")
                .replace(/\bcould not\b/gi, "couldn't")
                .replace(/\bwould not\b/gi, "wouldn't")
                .replace(/\bis not\b/gi, "isn't")
                .replace(/\bare not\b/gi, "aren't")
                .replace(/\bwas not\b/gi, "wasn't")
                .replace(/\bwere not\b/gi, "weren't")
                .replace(/\bhas not\b/gi, "hasn't")
                .replace(/\bhave not\b/gi, "haven't")
                .replace(/\bdid not\b/gi, "didn't")
                
                // Add natural hesitations and filler words for human-like speech
                .replace(/\bWell,\s*/gi, 'Well, um, ')
                .replace(/\bSo,\s*/gi, 'So, ')
                .replace(/\bActually,\s*/gi, 'Actually, ')
                .replace(/\bBasically,\s*/gi, 'Basically, ')
                
                // Make responses sound more conversational and less formal
                .replace(/\bhowever\b/gi, 'but')
                .replace(/\btherefore\b/gi, 'so')
                .replace(/\bfurthermore\b/gi, 'also')
                .replace(/\bin addition\b/gi, 'plus')
                .replace(/\bmoreover\b/gi, 'and')
                .replace(/\bnevertheless\b/gi, 'but still')
                
                // Add natural conversation starters and fillers
                .replace(/^Well,/gi, 'Well, ')
                .replace(/^So,/gi, 'So, ')
                .replace(/^Actually,/gi, 'Actually, ')
                .replace(/^You know,/gi, 'You know, ')
                .replace(/^Basically,/gi, 'Basically, ')
                .replace(/^I think/gi, 'I think')
                .replace(/^I mean,/gi, 'I mean, ')
                
                // Make technical terms sound natural
                .replace(/\bAI\b/g, 'A I')
                .replace(/\bML\b/g, 'M L')
                .replace(/\bAPI\b/g, 'A P I')
                .replace(/\bUI\b/g, 'U I')
                .replace(/\bURL\b/g, 'U R L')
                .replace(/\bCSS\b/g, 'C S S')
                .replace(/\bHTML\b/g, 'H T M L')
                .replace(/\bJS\b/g, 'JavaScript')
                .replace(/\bVS Code\b/gi, 'V S Code')
                
                // Add natural emphasis and tone
                .replace(/\bawesome\b/gi, 'awesome')
                .replace(/\bgreat\b/gi, 'great')
                .replace(/\binteresting\b/gi, 'interesting')
                .replace(/\bcool\b/gi, 'cool')
                .replace(/\bnice\b/gi, 'nice')
                
                // Add natural pauses and breathing
                .replace(/\. ([A-Z])/g, '. $1')
                .replace(/! ([A-Z])/g, '! $1')
                .replace(/\? ([A-Z])/g, '? $1')
                .replace(/, ([a-zA-Z])/g, ', $1')
                .replace(/: ([a-zA-Z])/g, ': $1')
                .replace(/; ([a-zA-Z])/g, '; $1')
                
                // Clean up multiple spaces
                .replace(/\s+/g, ' ')
                .trim();

            // Add natural speech patterns - split long sentences
            const sentences = processedText.split(/([.!?]+\s*)/);
            processedText = sentences.map(sentence => {
                if (sentence.length > 100) {
                    // Add micro-pauses in long sentences
                    return sentence.replace(/,/g, ', ');
                }
                return sentence;
            }).join('');            // Final step: Add SSML-like pauses for ultimate naturalness
            const finalText = this.addNaturalPauses(processedText);
            utterance.text = finalText;
            
            // Fine-tune voice characteristics for maximum naturalness
            if (selectedVoice) {
                const voiceName = selectedVoice.name.toLowerCase();
                
                // Optimize settings per voice for maximum naturalness
                if (voiceName.includes('alex')) {
                    // Alex is naturally smooth - make it even more human
                    utterance.rate = 0.55;   // Very slow for maximum naturalness
                    utterance.pitch = 0.8;   // Lower, warmer tone
                    utterance.volume = 0.9;  // Clear but intimate
                } else if (voiceName.includes('david')) {
                    // David is deeper - optimize for natural masculine voice
                    utterance.rate = 0.5;    // Extremely slow for depth
                    utterance.pitch = 0.75;  // Lower pitch for warmth
                    utterance.volume = 0.9;
                } else if (voiceName.includes('mark')) {
                    // Mark - make it sound more conversational
                    utterance.rate = 0.55;
                    utterance.pitch = 0.8;
                    utterance.volume = 0.9;
                } else if (voiceName.includes('ravi') || voiceName.includes('hemant')) {
                    // Indian voices - optimize for natural accent and warmth
                    utterance.rate = 0.6;    // Slower for clarity
                    utterance.pitch = 0.85;  // Warmer Indian male pitch
                    utterance.volume = 0.9;
                } else if (voiceName.includes('google')) {
                    // Google voices - make them less robotic
                    utterance.rate = 0.55;
                    utterance.pitch = 0.8;
                    utterance.volume = 0.9;
                } else {
                    // Default ultra-natural settings for any voice
                    utterance.rate = 0.6;    // Much slower = more human
                    utterance.pitch = 0.8;   // Lower, warmer tone
                    utterance.volume = 0.9;  // Clear conversational volume
                }
                
                console.log(`🎤 Optimized for ${selectedVoice.name}: Rate=${utterance.rate}, Pitch=${utterance.pitch}`);
            }
            
            // Add event handlers for better user experience
            utterance.onstart = () => {
                console.log('🎤 Natural speech started');
                this.animateWaves(true);
            };
            
            utterance.onend = () => {
                console.log('🎤 Natural speech completed');
                this.voiceStatus.textContent = 'READY FOR VOICE INPUT';
                this.animateWaves(false);
            };
            
            utterance.onerror = (event) => {
                console.error('🎤 Speech error:', event.error);
            };
            
            this.synthesis.speak(utterance);
        }, 50); // Small delay to ensure proper cancellation
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        
        if (this.isMuted) {
            this.muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i> <span id="muteText">Unmute</span>';
            this.synthesis.cancel();
        } else {
            this.muteBtn.innerHTML = '<i class="fas fa-volume-up"></i> <span id="muteText">Mute</span>';
        }
    }

    clearChat() {
        // Remove all messages except the welcome message
        const messages = this.chatContainer.querySelectorAll('.message');
        messages.forEach((message, index) => {
            if (index > 0) { // Keep the first welcome message
                message.remove();
            }
        });
        
        // Clear conversation history
        this.conversationHistory = [];
        
        // Stop any ongoing speech
        this.synthesis.cancel();
    }

    showLoading(show) {
        this.loading.style.display = show ? 'flex' : 'none';
    }

    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
    
    logAvailableVoices() {
        const voices = this.synthesis.getVoices();
        console.log('🎤 Available voices (' + voices.length + ' total):');
        
        // Find Indian/Male voices specifically
        const indianVoices = voices.filter(voice => 
            voice.name.toLowerCase().includes('india') ||
            voice.name.toLowerCase().includes('ravi') ||
            voice.name.toLowerCase().includes('hemant') ||
            voice.name.toLowerCase().includes('hindi')
        );
        
        const maleVoices = voices.filter(voice => 
            voice.name.toLowerCase().includes('male') ||
            voice.name.toLowerCase().includes('david') ||
            voice.name.toLowerCase().includes('mark') ||
            voice.name.toLowerCase().includes('daniel') ||
            voice.name.toLowerCase().includes('alex')
        );
        
        if (indianVoices.length > 0) {
            console.log('🇮🇳 Indian voices found:');
            indianVoices.forEach(voice => {
                console.log(`   🎯 ${voice.name} (${voice.lang})`);
            });
        }
        
        if (maleVoices.length > 0) {
            console.log('👨 Male voices found:');
            maleVoices.forEach(voice => {
                console.log(`   ♂️ ${voice.name} (${voice.lang})`);
            });
        }
        
        // Show first few voices for reference
        console.log('📋 All voices (first 8):');
        voices.slice(0, 8).forEach((voice, index) => {
            const gender = voice.name.toLowerCase().includes('female') ? '♀️' :
                          voice.name.toLowerCase().includes('male') ? '♂️' :
                          voice.name.toLowerCase().includes('david') ? '♂️' :
                          voice.name.toLowerCase().includes('mark') ? '♂️' :
                          voice.name.toLowerCase().includes('zira') ? '♀️' :
                          voice.name.toLowerCase().includes('samantha') ? '♀️' : '?';
            console.log(`   ${index + 1}. ${gender} ${voice.name} (${voice.lang})`);
        });
        
        console.log(`🎛️ Voice settings for 22yr Indian male: Rate=${this.voiceSettings.rate}x, Pitch=${this.voiceSettings.pitch}, Volume=${this.voiceSettings.volume}`);
    }
    
    // Add natural pauses and breathing to text
    addNaturalPauses(text) {
        return text
            // Add micro-pauses after common words for breathing
            .replace(/\bwell\b/gi, 'well, ')
            .replace(/\bso\b/gi, 'so, ')
            .replace(/\byou know\b/gi, 'you know, ')
            .replace(/\bi mean\b/gi, 'I mean, ')
            .replace(/\bbasically\b/gi, 'basically, ')
            .replace(/\bactually\b/gi, 'actually, ')
            .replace(/\bobviously\b/gi, 'obviously, ')
            .replace(/\bof course\b/gi, 'of course, ')
            .replace(/\bhonestly\b/gi, 'honestly, ')
            
            // Add natural pauses before important concepts
            .replace(/\b(important|interesting|amazing|great|awesome|incredible|fantastic)\b/gi, ' $1')
            .replace(/\b(however|moreover|furthermore|therefore|meanwhile)\b/gi, ' $1')
            
            // Add breathing space at sentence transitions
            .replace(/\.\s*([A-Z])/g, '. $1')
            .replace(/!\s*([A-Z])/g, '! $1')  
            .replace(/\?\s*([A-Z])/g, '? $1')
            
            // Slow down endings for natural completion
            .replace(/(\w+)([.!?]+)$/g, '$1, $2')
            
            // Add natural rhythm to lists and conjunctions
            .replace(/,\s*and\s/gi, ', and ')
            .replace(/,\s*or\s/gi, ', or ')
            .replace(/,\s*but\s/gi, ', but ')
            .replace(/,\s*so\s/gi, ', so ')
            .replace(/,\s*then\s/gi, ', then ')
            
            // Add slight pauses after technical terms for clarity
            .replace(/\b(AI|ML|API|CSS|HTML|JavaScript)\b/gi, '$1, ')
            
            // Clean up extra spaces and multiple commas
            .replace(/,+/g, ',')
            .replace(/\s+/g, ' ')
            .trim();
    }
}

// Initialize the voice bot when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceBot();
});

// Handle page visibility change to manage speech recognition
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.voiceBot) {
        window.voiceBot.stopListening();
    }
});