// server.js - OpenAI to NVIDIA NIM Proxy (Clean & GLM-5 Optimized)
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// 🚀 SPEED BOOST: Keep-Alive Agent
const axiosInstance = axios.create({
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
});

app.use((req, res, next) => {
    if (req.url.includes('chat/completions')) req.url = '/v1/chat/completions';
    next();
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// 🎯 MODEL MAPPING (GLM-5 Ready)
const MODEL_MAPPING = {
  'gpt-4': 'z-ai/glm4.7',           // ⚡ Fast Mode
  'gpt-4o': 'z-ai/glm4.7',          // 🧠 Thinking Mode
  'gpt-4-turbo': 'z-ai/glm5',      // ⚡ Fast Mode (GLM-5)
  'gpt-4-reasoning': 'z-ai/glm5',  // 🧠 Thinking Mode (GLM-5)
  'llama-70b': 'meta/llama-3.1-70b-instruct'
};

// Generic RP Guard (No character names)
const RP_GUARD = `You are the character described in the system prompt.
- Stay in character. Do NOT speak for the user.
- Stop your response immediately after your turn ends.`;

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!NIM_API_KEY) return res.status(500).json({ error: 'Missing API Key' });

    const { model, messages, temperature, max_tokens, stream } = req.body;
    let nimModel = MODEL_MAPPING[model] || 'z-ai/glm4.7';

    // 🧠 LOGIC: Check if we should enable thinking
    const shouldThink = model.includes('4o') || model.includes('reasoning');

    // Attach generic RP Guard
    const systemIndex = messages.findIndex(m => m.role === 'system');
    if (systemIndex !== -1) {
      messages[systemIndex].content += '\n\n' + RP_GUARD;
    } else {
      messages.unshift({ role: 'system', content: RP_GUARD });
    }

    const nimRequest = {
      model: nimModel,
      messages,
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 4096,
      stream: stream || false,
      // 🎯 THE CRITICAL 2026 FIX:
      // This object forces the model to stop the internal monologue.
      thinking: { 
        type: shouldThink ? "enabled" : "disabled" 
      },
      // Some NVIDIA endpoints still use the 2025 "extra_body" style
      extra_body: {
        enable_thinking: shouldThink,
        clear_thinking: true // Ensures it doesn't "remember" old thoughts
      }
    };

    // Extra compatibility flag for older GLM-4.7 NIM instances
    if (shouldThink && nimModel.includes('glm')) {
      nimRequest.extra_body = { thinking: true };
    }
    
    const response = await axiosInstance.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: { 'Authorization': `Bearer ${NIM_API_KEY}`, 'Content-Type': 'application/json' },
      responseType: stream ? 'stream' : 'json'
    });
    
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      response.data.pipe(res);
    } else {
      res.json(response.data);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Running on ${PORT}`));
