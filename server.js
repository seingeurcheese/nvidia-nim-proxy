// server.js - NVIDIA NIM Proxy (Optimized for Render 24/7 Uptime)
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// 🧹 THE FIX #1: Aggressive Socket Cleanup (No more slowdowns)
const axiosInstance = axios.create({
  httpAgent: new http.Agent({ 
    keepAlive: true, 
    maxSockets: 50,          // Limit max open connections
    timeout: 60000           // Kill dead sockets after 60 seconds
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
  'gpt-4': 'z-ai/glm4.7',           // ⚡ Fast
  'gpt-4o': 'z-ai/glm4.7',          // 🧠 Thinking
  'gpt-4-turbo': 'z-ai/glm5',       // ⚡ Fast
  'gpt-4-reasoning': 'z-ai/glm5',   // 🧠 Thinking
};

// Health endpoint for our ping
app.get('/health', (req, res) => res.json({ status: 'I am awake, boss 🦁' }));

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;
    let nimModel = MODEL_MAPPING[model] || 'z-ai/glm4.7';

    const shouldThink = model.includes('4o') || model.includes('reasoning');

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
      response.data.pipe(res);
    } else {
      res.json(response.data);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ⏰ THE FIX #2: The 14-Minute Anti-Sleep Ping
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Running on ${PORT}`);
  
  // Render automatically provides RENDER_EXTERNAL_URL for your app
  const serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  
  setInterval(() => {
    axios.get(`${serverUrl}/health`)
      .then(() => console.log('Pinged self to prevent sleep ⚡'))
      .catch((err) => console.log('Ping failed', err.message));
  }, 14 * 60 * 1000); // Runs every 14 minutes
});
