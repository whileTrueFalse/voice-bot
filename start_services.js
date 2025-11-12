#!/usr/bin/env node
/**
 * Integrated Voice Bot Startup Script
 * Starts both Maya1 voice service and the main server
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fetch = require('node-fetch').default || require('node-fetch');

// Configuration
const MAYA_SERVICE_PORT = 5000;
const WEB_SERVER_PORT = 3000;
const MAX_STARTUP_TIME = 120000; // 2 minutes for Maya1 to load

let mayaProcess = null;
let webProcess = null;

// Cleanup function
function cleanup() {
    console.log('\n🛑 Shutting down services...');
    
    if (mayaProcess) {
        mayaProcess.kill('SIGTERM');
        console.log('✅ Maya1 service stopped');
    }
    
    if (webProcess) {
        webProcess.kill('SIGTERM');
        console.log('✅ Web server stopped');
    }
    
    process.exit(0);
}

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

// Check if Maya1 service is ready
async function checkMayaService() {
    try {
        const response = await fetch(`http://localhost:${MAYA_SERVICE_PORT}/health`, {
            timeout: 5000
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

// Start Maya1 voice service
function startMayaService() {
    return new Promise((resolve, reject) => {
        console.log('🎤 Starting Maya1 Voice Service...');
        console.log('⏳ This may take 1-2 minutes for model loading...');
        
        mayaProcess = spawn('python', ['maya_voice_service.py'], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let isReady = false;
        
        mayaProcess.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            
            // Look for service ready indicators
            if (text.includes('Flask server') || text.includes('Running on') || text.includes('All models loaded')) {
                if (!isReady) {
                    isReady = true;
                    console.log('✅ Maya1 service started successfully!');
                    resolve();
                }
            }
            
            // Show progress
            if (text.includes('Loading') || text.includes('%')) {
                process.stdout.write('.');
            }
        });
        
        mayaProcess.stderr.on('data', (data) => {
            const text = data.toString();
            console.error('Maya1 Error:', text);
            
            // Check for missing dependencies
            if (text.includes('accelerate')) {
                console.log('\n📦 Installing missing dependency: accelerate...');
                exec('pip install accelerate', (error) => {
                    if (!error) {
                        console.log('✅ Accelerate installed, restarting Maya1...');
                        mayaProcess.kill();
                        setTimeout(() => startMayaService().then(resolve).catch(reject), 2000);
                    }
                });
            }
        });
        
        mayaProcess.on('close', (code) => {
            if (code !== 0 && !isReady) {
                console.error(`❌ Maya1 service failed to start (code: ${code})`);
                // Don't reject, continue with fallback
                resolve();
            }
        });
        
        // Timeout fallback
        setTimeout(() => {
            if (!isReady) {
                console.log('\n⚠️ Maya1 taking longer than expected, starting web server...');
                console.log('💡 Maya1 will continue loading in background');
                resolve();
            }
        }, MAX_STARTUP_TIME);
    });
}

// Start web server
function startWebServer() {
    return new Promise((resolve, reject) => {
        console.log('\n🌐 Starting Voice Bot Web Server...');
        
        webProcess = spawn('node', ['server.js'], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        webProcess.stdout.on('data', (data) => {
            const text = data.toString();
            console.log(text.trim());
            
            if (text.includes('Voice Bot Server Running')) {
                console.log('✅ Web server started successfully!');
                resolve();
            }
        });
        
        webProcess.stderr.on('data', (data) => {
            console.error('Web Server Error:', data.toString());
        });
        
        webProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`❌ Web server failed (code: ${code})`);
                reject(new Error(`Web server failed with code ${code}`));
            }
        });
        
        // Timeout
        setTimeout(() => {
            console.log('✅ Web server startup timeout reached, assuming success');
            resolve();
        }, 10000);
    });
}

// Main startup sequence
async function main() {
    console.log('🚀 Starting Integrated Voice Bot System');
    console.log('=' .repeat(50));
    
    try {
        // Step 1: Start Maya1 service
        await startMayaService();
        
        // Step 2: Start web server
        await startWebServer();
        
        // Step 3: Final status check
        console.log('\n🎉 All services started!');
        console.log('📱 Voice Bot: http://localhost:3000');
        console.log('🎤 Maya1 Voice: http://localhost:5000');
        console.log('\n🔍 Service Status:');
        
        // Check Maya1 status
        const mayaReady = await checkMayaService();
        console.log(`🎤 Maya1 Voice Service: ${mayaReady ? '✅ Ready' : '⚠️ Loading...'}`);
        console.log(`🌐 Web Server: ✅ Ready`);
        
        if (!mayaReady) {
            console.log('\n💡 Maya1 is still loading models in the background.');
            console.log('🎧 Voice will use browser TTS until Maya1 is ready.');
            
            // Keep checking Maya1 status
            const checkInterval = setInterval(async () => {
                if (await checkMayaService()) {
                    console.log('🎉 Maya1 Voice Service is now ready!');
                    clearInterval(checkInterval);
                }
            }, 10000);
        }
        
        console.log('\n🛑 Press Ctrl+C to stop all services');
        
        // Keep process alive
        process.stdin.resume();
        
    } catch (error) {
        console.error('❌ Startup failed:', error.message);
        cleanup();
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
    cleanup();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
    cleanup();
});

// Start everything
main();