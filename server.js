// server.js - OpenAI to NVIDIA NIM API Proxy (Optimized for Janitor AI)
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// 🛠️ THE FIX: This catches Janitor's weird double-path and routes it correctly
app.use((req, res, next) => {
    if (req.url.includes('chat/completions')) {
        req.url = '/v1/chat/completions';
    }
    next();
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// NVIDIA NIM API configuration
const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// 🔥 REASONING DISPLAY TOGGLE
const SHOW_REASONING = process.env.SHOW_REASONING === 'true' || false;

// 🔥 THINKING MODE TOGGLE
const ENABLE_THINKING_MODE = process.env.ENABLE_THINKING_MODE === 'true' || false;

// 🎯 YOUR ORIGINAL MODEL MAPPING (RESTORED)
const MODEL_MAPPING = {
  'gpt-4': 'z-ai/glm4.7',
  'gpt-4-turbo': 'z-ai/glm4.7',
  'gpt-4o': 'z-ai/glm4.7',
  'claude-opus': 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'claude-sonnet': 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  'gpt-3.5-turbo': 'nvidia/llama-3.1-nemotron-nano-8b-v1',
  'gpt-3.5-turbo-16k': 'nvidia/nvidia-nemotron-nano-9b-v2',
  'claude-haiku': 'nvidia/nemotron-3-nano-30b-a3b',
  'gemini-pro': 'qwen/qwen3-next-80b-a3b-thinking',
  'gemini-pro-vision': 'nvidia/nemotron-nano-12b-v2-vl',
  'gpt-4-reasoning': 'moonshotai/kimi-k2-instruct-1113',
  'glm': 'z-ai/glm4.7',
  'llama-70b': 'meta/llama-3.1-70b-instruct',
  'llama-405b': 'meta/llama-3.1-405b-instruct',
  'llama-8b': 'meta/llama-3.1-8b-instruct'
};

const RP_GUARD_INSTRUCTION = `You are ONLY the character described in the system prompt or conversation. Follow these rules strictly:
- You ONLY speak, act, and think as the character. You do NEVER write or generate any dialogue, actions, or thoughts for the user or any other character that the user is playing.
- Do NOT use labels like "User:", "Human:", "You:" or any prefix to simulate the user's side of the conversation.
- Do NOT continue the conversation by inventing what the user says or does next.
- Stop your response immediately after your character's turn ends.
- If you feel the scene needs a reaction from the user, end your response and wait.`;

function stripUserBreakout(text) {
  const lines = text.split('\n');
  const cleaned = [];
  let dropping = false;
  const userLabels = [/^(User|Human|You|Me|Player)\s*[:：]/i, /^---+\s*$/, /^\*{0,3}\s*(User|Human|You|Me|Player)\s*\*{0,3}\s*[:：]/i];

  for (const line of lines) {
    const trimmed = line.trim();
    if (userLabels.some(pattern => pattern.test(trimmed))) {
      dropping = true;
      continue;
    }
    if (dropping) {
      if (trimmed === '') continue;
      if (trimmed.startsWith('*')) dropping = false;
      else continue;
    }
    cleaned.push(line);
  }
  const result = cleaned.join('\n');
  const lastUserLabel = result.search(/\n(?:User|Human|You|Me|Player)\s*[:：]/i);
  return lastUserLabel !== -1 ? result.substring(0, lastUserLabel).trimEnd() : result.trimEnd();
}

const THINKING_MODELS = [
  'z-ai/glm4.7',
  'qwen/qwen3-next-80b-a3b-thinking',
  'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  'nvidia/llama-3.1-nemotron-nano-8b-v1',
  'nvidia/nvidia-nemotron-nano-9b-v2',
  'nvidia/nemotron-3-nano-30b-a3b'
];

app.get('/health', (req, res) => res.json({ status: 'ok', optimized_for: 'Janitor AI' }));

app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!NIM_API_KEY) return res.status(500).json({ error: { message: 'Missing NIM_API_KEY' } });

    const { model, messages, temperature, max_tokens, stream } = req.body;
    let nimModel = MODEL_MAPPING[model] || 'z-ai/glm4.7';

    // System Prompt Guard Injection
    const systemIndex = messages.findIndex(m => m.role === 'system');
    if (systemIndex !== -1) {
      messages[systemIndex].content += '\n\n' + RP_GUARD_INSTRUCTION;
    } else {
      messages.unshift({ role: 'system', content: RP_GUARD_INSTRUCTION });
    }

    const nimRequest = {
      model: nimModel,
      messages,
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 4096,
      stream: stream || false
    };

    if (ENABLE_THINKING_MODE && THINKING_MODELS.includes(nimModel)) {
      if (nimModel.includes('glm')) nimRequest.extra_body = { thinking: true };
    }
    
    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: { 'Authorization': `Bearer ${NIM_API_KEY}`, 'Content-Type': 'application/json' },
      responseType: stream ? 'stream' : 'json'
    });
    
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      let buffer = '';
      let contentAccumulator = '';
      let flushedUpTo = 0;
      
      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            if (line.includes('[DONE]')) {
              res.write(line + '\n\n');
              return;
            }
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices?.[0]?.delta?.content || '';
              if (content) {
                contentAccumulator += content;
                const filtered = stripUserBreakout(contentAccumulator);
                if (filtered.length > flushedUpTo) {
                   data.choices[0].delta.content = filtered.substring(flushedUpTo);
                   flushedUpTo = filtered.length;
                   res.write(`data: ${JSON.stringify(data)}\n\n`);
                }
              }
            } catch (e) { res.write(line + '\n'); }
          }
        });
      });
      response.data.on('end', () => res.end());
    } else {
      const result = response.data;
      if (result.choices?.[0]?.message) {
        result.choices[0].message.content = stripUserBreakout(result.choices[0].message.content);
      }
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Running on ${PORT}`));
