// server.js - Updated with NVIDIA chat_template_kwargs (2026)
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

const MODEL_MAPPING = {
  'gpt-4': 'z-ai/glm4.7',           // ⚡ Fast
  'gpt-4o': 'z-ai/glm4.7',          // 🧠 Thinking
  'gpt-4-turbo': 'z-ai/glm5',       // ⚡ Fast
  'gpt-4-reasoning': 'z-ai/glm5',   // 🧠 Thinking
};

const RP_GUARD = `You are the character described. No user dialogue. Stop when your turn ends.`;

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;
    let nimModel = MODEL_MAPPING[model] || 'z-ai/glm4.7';

    // 🧠 LOGIC: Set the thinking flags exactly like the NVIDIA snippet
    const shouldThink = model.includes('4o') || model.includes('reasoning');

    const nimRequest = {
      model: nimModel,
      messages,
      temperature: temperature || 1, // Standardizing to your snippet
      top_p: 1,
      max_tokens: max_tokens || 16384,
      stream: stream || false,
      // 🚀 THE FIX: Passing the template args as raw JSON fields
      chat_template_kwargs: {
        "enable_thinking": shouldThink,
        "clear_thinking": !shouldThink // clear_thinking: true when fast, false when thinking
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

app.listen(PORT, '0.0.0.0', () => console.log(`Running on ${PORT}`));
