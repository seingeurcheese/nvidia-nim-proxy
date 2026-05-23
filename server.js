// server.js - NVIDIA NIM Proxy (No logs version)
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// 🧹 Aggressive Socket Cleanup + Request Timeout
const axiosInstance = axios.create({
  timeout: 300000, // 5-minute hard timeout per request
  httpAgent: new http.Agent({ 
    keepAlive: true, 
    maxSockets: 50,          
    timeout: 60000           
  }),
  httpsAgent: new https.Agent({ 
    keepAlive: true, 
    maxSockets: 50, 
    timeout: 60000 
  }),
});

app.use((req, res, next) => {
    if (req.url.includes('chat/completions')) req.url = '/v1/chat/completions';
    next();
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

const MODEL_MAPPING = {
  'gpt-4': 'z-ai/glm4.7',
  'gpt-4o': 'z-ai/glm4.7',
  'gpt-4-turbo': 'z-ai/glm5',
  'gpt-4-reasoning': 'z-ai/glm5',
  'gpt-3.5-turbo': 'z-ai/glm-5.1',
  'gpt-3.5-turbo-instruct': 'z-ai/glm-5.1',
};

// Health endpoint
app.get('/health', (req, res) => res.json({ status: 'I am awake, boss 🦁' }));

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;
    let nimModel = MODEL_MAPPING[model] || 'z-ai/glm4.7';

    const shouldThink = model.includes('4o') || model.includes('reasoning') || model.includes('instruct');
    
    const nimRequest = {
      model: nimModel,
      messages,
      temperature: temperature || 1, 
      top_p: 1,
      max_tokens: max_tokens || 16384,
      stream: stream || false,
      chat_template_kwargs: {
        "enable_thinking": shouldThink,
        "clear_thinking": !shouldThink 
      }
    };

    const response = await axiosInstance.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: { 'Authorization': `Bearer ${NIM_API_KEY}`, 'Content-Type': 'application/json' },
      responseType: stream ? 'stream' : 'json'
    });
    
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      response.data.on('error', (err) => {
        console.error('Upstream stream error:', err.message);
        res.end();
      });
      response.data.pipe(res);
    } else {
      res.json(response.data);
    }
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(502).json({ error: error.message });
    }
  }
});

// ⏰ The 14-Minute Anti-Sleep Ping
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Running on ${PORT}`);
  
  const serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  
  setInterval(() => {
    axios.get(`${serverUrl}/health`)
      .then(() => console.log('Pinged self to prevent sleep ⚡'))
      .catch((err) => console.log('Ping failed', err.message));
  }, 14 * 60 * 1000);
});
