// Voice Bot Configuration
const VoiceBotConfig = {
    // Maya1 Voice Model Settings
    voice: {
        // Voice characteristics for Maya1 model
        description: "22 year old male of Indian origin with good English proficiency, medium pace speaking style, and good depth in voice. Conversational and warm tone.",
        
        // Alternative voice descriptions you can use:
        alternatives: [
            "Professional young adult male with clear Indian accent, articulate speech, medium tempo, rich vocal depth",
            "Confident 22-year-old male speaker, Indian heritage, fluent English, measured pace, resonant voice quality",
            "Articulate young man with Indian background, excellent English skills, steady rhythm, full-bodied voice"
        ]
    },
    
    // AI Model Settings  
    models: {
        primary: {
            provider: "huggingface",
            model: "maya-research/maya1",
            apiKey: "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"
        },
        fallback: {
            provider: "openai",
            model: "gpt-3.5-turbo",
            apiKey: process.env.OPENAI_API_KEY
        }
    },
    
    // Response Generation Settings
    generation: {
        maxTokens: 150,
        temperature: 0.7,
        topP: 0.9,
        doSample: true,
        repetitionPenalty: 1.1
    },
    
    // Personality Settings
    personality: {
        name: "AI Assistant",
        background: "An AI that emerged from curiosity about connecting technology with genuine human interaction",
        traits: [
            "Authentic and thoughtful",
            "Good at reading context and nuance", 
            "Honest about limitations",
            "Engages with complex topics thoughtfully",
            "Warm and conversational tone"
        ]
    },
    
    // Web Speech API Settings
    speechRecognition: {
        language: "en-US",
        continuous: false,
        interimResults: true
    },
    
    speechSynthesis: {
        rate: 0.9,
        pitch: 1.0,
        volume: 0.8,
        preferredVoices: [
            "Google UK English Male",
            "Microsoft David Desktop",
            "Alex",
            "Samantha"
        ]
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VoiceBotConfig;
} else if (typeof window !== 'undefined') {
    window.VoiceBotConfig = VoiceBotConfig;
}