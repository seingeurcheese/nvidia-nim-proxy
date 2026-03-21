// server.js - OpenAI to NVIDIA NIM Proxy (Hybrid Mode: Fast vs Thinking)
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// 🚀 SPEED BOOST: Keeps the connection to NVIDIA "warm"
const axiosInstance = axios.create({
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
});

// 🛠️ PATH FIX: Catch Janitor's double-path
app.use((req, res, next) => {
    if (req.url.includes('chat/completions')) {
        req.url = '/v1/chat/completions';
    }
    next();
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// 🎯 DUAL-MODE MAPPING
const MODEL_MAPPING = {
  'gpt-4': 'z-ai/glm4.7',     // ⚡ FAST MODE (No Thinking)
  'gpt-4o': 'z-ai/glm4.7',    // 🧠 THINKING MODE (Deep Reasoning)
  'glm': 'z-ai/glm4.7',
  'llama-70b': 'meta/llama-3.1-70b-instruct'
};

const RP_GUARD = `You are ONLY the character described. No user dialogue. Stop when your turn ends.`;

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!NIM_API_KEY) return res.status(500).json({ error: 'Missing API Key' });

    const { model, messages, temperature, max_tokens, stream } = req.body;
    let nimModel = MODEL_MAPPING[model] || 'z-ai/glm4.7';

    // 🧠 LOGIC: Force thinking ONLY if user picks gpt-4o
    const shouldThink = (model === 'gpt-4o');

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
      // 🚀 Control reasoning based on the model chosen
      include_reasoning: shouldThink 
    };

    // Extra flag specifically for GLM-4.7 thinking
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
