// Simple test to verify OpenAI API key works locally
// Run with: node test-openai-key.js

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your_openai_key_here';

async function testOpenAIConnection() {
    console.log('🔑 Testing OpenAI API Key...');
    console.log('Key present:', !!OPENAI_API_KEY);
    console.log('Key length:', OPENAI_API_KEY?.length);
    console.log('Key starts with sk-:', OPENAI_API_KEY?.startsWith('sk-'));
    
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your_openai_key_here') {
        console.log('❌ No valid OpenAI API key found!');
        console.log('Set your key with: export OPENAI_API_KEY=sk-your-key-here');
        return;
    }

    try {
        // Test basic chat completion first
        console.log('\n🤖 Testing Chat API...');
        const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: 'Say hello' }],
                max_tokens: 10
            })
        });

        if (chatResponse.ok) {
            console.log('✅ Chat API working!');
            
            // Test TTS API
            console.log('\n🎵 Testing TTS API with gpt-4o-mini-tts...');
            const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini-tts',
                    input: 'Hello! This is a test of the alloy voice.',
                    voice: 'alloy',
                    response_format: 'mp3',
                    instructions: 'Speak in a natural, conversational tone.'
                })
            });

            if (ttsResponse.ok) {
                const audioBuffer = await ttsResponse.arrayBuffer();
                console.log('✅ TTS API working!');
                console.log('Audio generated:', audioBuffer.byteLength, 'bytes');
                console.log('🎉 OpenAI APIs are fully functional!');
            } else {
                const ttsError = await ttsResponse.text();
                console.log('❌ TTS API failed:', ttsResponse.status);
                console.log('Error:', ttsError);
            }
        } else {
            const chatError = await chatResponse.text();
            console.log('❌ Chat API failed:', chatResponse.status);
            console.log('Error:', chatError);
        }
    } catch (error) {
        console.error('❌ API test failed:', error);
    }
}

testOpenAIConnection();