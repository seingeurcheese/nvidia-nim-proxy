const express = require('express');
const cors = require('cors');
const axios = require('axios');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚡ Speed Boost: Keeps the connection to NVIDIA active
const axiosInstance = axios.create({
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 🛠️ Path Fix for Janitor AI
app.use((req, res, next) => {
    if (req.url.includes('chat/completions')) req.url = '/v1/chat/completions';
    next();
});

const NIM_API_BASE = 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

const MODEL_MAPPING = {
  'gpt-4': 'z-ai/glm4.7',           // ⚡ Fast (Standard)
  'gpt-4o': 'z-ai/glm4.7',          // 🧠 Thinking (Reasoning)
  'gpt-4-turbo': 'z-ai/glm-5',      // ⚡ Fast (New GLM-5)
  'gpt-4-reasoning': 'z-ai/glm-5'   // 🧠 Thinking (New GLM-5)
};

// Clean, neutral RP Guard
const RP_GUARD = `You are ONLY the character described. Do not write for the user. End your turn immediately.`;

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, stream } = req.body;
    const nimModel = MODEL_MAPPING[model] || 'z-ai/glm4.7';

    // 🧠 The "Think" Switch logic
    const shouldThink = model.includes('4o') || model.includes('reasoning');

    // Inject neutral guard
    if (messages[0].role === 'system') {
      messages[0].content += `\n\n${RP_GUARD}`;
    } else {
      messages.unshift({ role: 'system', content: RP_GUARD });
    }

    const nimRequest = {
      model: nimModel,
      messages,
      temperature: req.body.temperature || 0.7,
      max_tokens: req.body.max_tokens || 4096,
      stream: stream || false,
      // 🚀 2026 NVIDIA Fix: Force GLM to obey the thinking toggle
      chat_template_kwargs: {
        enable_thinking: shouldThink
      }
    };

    // Extra safety for specific Z.ai endpoints
    if (nimModel.includes('glm')) {
      nimRequest.thinking = { type: shouldThink ? "enabled" : "disabled" };
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

app.listen(PORT, '0.0.0.0', () => console.log(`Proxy running on port ${PORT}`));
