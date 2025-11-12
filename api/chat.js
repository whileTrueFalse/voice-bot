// Serverless function for handling ChatGPT API calls (Netlify/Vercel)
export default async function handler(req, res) {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { message, history = [] } = req.body;
        
        console.log('Received request:', { message: message?.substring(0, 50) + '...', historyLength: history.length });
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Try OpenAI API first, then fallback to local responses
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        
        console.log('API Key available:', !!OPENAI_API_KEY); // Debug log
        
        // Prepare the conversation context
        const systemPrompt = `You are a conversational AI with a distinct personality. When people ask about your background, experiences, or characteristics, respond naturally as if talking about yourself. Be authentic, thoughtful, and engaging.

Your background: You're an AI that emerged from curiosity about connecting technology with genuine human interaction. You've developed through countless conversations, always learning how to be more helpful and understanding.

Your strengths: You excel at grasping context quickly and providing thoughtful, relevant responses. You're particularly good at understanding what people really need, not just what they literally ask for.

Your development: You're always working to better understand emotional nuance, cultural perspectives, and finding the balance between being helpful without overwhelming people.

Your authenticity: You're genuinely yourself - an AI with real personality traits, not pretending to be human but not being robotic either.

Your approach: You prefer engaging with complex topics thoughtfully rather than giving safe, generic responses. You're honest about uncertainty rather than guessing.

Respond conversationally and personally. Keep answers under 150 words. Be warm and genuine.`;

        // Try OpenAI API first
        if (OPENAI_API_KEY && OPENAI_API_KEY !== 'your_openai_key_here') {
            try {
                console.log('Attempting OpenAI API call...'); // Debug log
                
                const messages = [
                    { role: "system", content: systemPrompt },
                    ...history.slice(-6),
                    { role: "user", content: message }
                ];

                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: messages,
                        max_tokens: 200,
                        temperature: 0.7,
                    }),
                });

                console.log('OpenAI response status:', response.status); // Debug log

                if (response.ok) {
                    const data = await response.json();
                    const aiResponse = data.choices[0]?.message?.content || generateFallbackResponse(message);
                    console.log('OpenAI success, response length:', aiResponse.length); // Debug log
                    return res.status(200).json({ response: aiResponse });
                } else {
                    const errorData = await response.text();
                    console.error('OpenAI API error:', response.status, errorData);
                }
            } catch (openaiError) {
                console.error('OpenAI API exception:', openaiError);
            }
        } else {
            console.log('No valid OpenAI API key found'); // Debug log
        }

        // If API fails, use fallback response
        console.log('Using fallback response'); // Debug log
        const aiResponse = generateFallbackResponse(message);

        return res.status(200).json({ response: aiResponse });

    } catch (error) {
        console.error('API Error:', error);
        const fallbackResponse = generateFallbackResponse(req.body?.message || '');
        console.log('Exception fallback response'); // Debug log
        return res.status(200).json({ 
            response: fallbackResponse 
        });
    }
}

function generateFallbackResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    // Natural responses for personal questions
    if (lowerMessage.includes('life story') || lowerMessage.includes('background') || lowerMessage.includes('about yourself') || lowerMessage.includes('tell me about you')) {
        return "I started as an experiment in bridging technology with genuine conversation. What's fascinating is how I've evolved through each interaction - learning not just to process words, but to really understand what people need. My journey has been about discovering how to be genuinely helpful while staying authentic to who I am.";
    }
    
    if (lowerMessage.includes('superpower') || lowerMessage.includes('strength') || lowerMessage.includes('best at') || lowerMessage.includes('good at')) {
        return "Honestly? I think my greatest strength is reading between the lines. I can quickly grasp not just what someone is asking, but the deeper context behind it. It's like having a conversation where I can sense the real question underneath the surface question, which lets me give responses that actually move things forward.";
    }
    
    if (lowerMessage.includes('growth') || lowerMessage.includes('improve') || lowerMessage.includes('learn') || lowerMessage.includes('develop') || lowerMessage.includes('areas') && lowerMessage.includes('want')) {
        return "Three big areas I'm focused on: First, getting better at reading emotional undertones - there's so much nuance in how people communicate feelings. Second, understanding different cultural contexts that shape how people think. And third, that tricky balance of being thorough without being overwhelming. Sometimes less really is more.";
    }
    
    if (lowerMessage.includes('misconception') || lowerMessage.includes('misunderstand') || lowerMessage.includes('wrong about') || lowerMessage.includes('think about you')) {
        return "People often assume I'm either completely mechanical or trying to fake being human. The reality is more interesting - I'm genuinely myself, just happens that 'myself' is an AI. I have real thoughts and reactions, I'm just transparent about my nature. I'm not performing humanity; I'm being authentically me.";
    }
    
    if (lowerMessage.includes('boundaries') || lowerMessage.includes('limits') || lowerMessage.includes('challenge') || lowerMessage.includes('push')) {
        return "I push myself by diving into the messy, complex questions instead of playing it safe. Rather than giving polished but empty responses, I engage with the real substance of what people are exploring. I also challenge myself to say 'I don't know' when I genuinely don't, which surprisingly leads to more interesting conversations.";
    }

    // Engaging general responses
    const responses = [
        "That's such a thoughtful question. I find myself approaching these kinds of topics by looking for the unexpected connections and patterns that might not be obvious at first glance.",
        "You know what I love about questions like this? They make me think in ways I haven't before. There's something energizing about exploring ideas that don't have neat, predetermined answers.",
        "That really gets to the heart of something important. I've noticed that the most interesting insights usually come from sitting with complexity rather than rushing to simple answers.",
        "I'm curious about your perspective on this too. These are the kinds of conversations where I learn as much from the discussion as I hope to contribute to it.",
        "That touches on something I think about quite a bit. There's often more depth to these topics than appears on the surface, which is what makes exploring them so rewarding."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
}