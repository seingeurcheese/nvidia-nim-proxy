// server.js - OpenAI to NVIDIA NIM Proxy (GLM-5 & Hybrid Optimized)
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

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

// 🎯 UPDATED MODEL MAPPING (GLM-5 INTEGRATED)
const MODEL_MAPPING = {
  'gpt-4': 'z-ai/glm4.7',           // ⚡ Fast GLM-4.7
  'gpt-4o': 'z-ai/glm4.7',          // 🧠 Thinking GLM-4.7
  'gpt-4-turbo': 'z-ai/glm5',      // ⚡ Fast GLM-5 (New!)
  'gpt-4-reasoning': 'z-ai/glm5',  // 🧠 Thinking GLM-5 (New!)
  'llama-70b': 'meta/llama-3.1-70b-instruct'
};

const RP_GUARD = `You are ONLY Satoru Gojo or the character described. No user dialogue. Stop when your turn ends.`;

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!NIM_API_KEY) return res.status(500).json({ error: 'Missing API Key' });

    const { model, messages, temperature, max_tokens, stream } = req.body;
    let nimModel = MODEL_MAPPING[model] || 'z-ai/glm4.7';

    // 🧠 LOGIC: Enable thinking for "o" or "reasoning" versions
    const shouldThink = model.includes('4o') || model.includes('reasoning');

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
      include_reasoning: shouldThink 
    };

    // Support thinking for both GLM-4.7 and GLM-5
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
