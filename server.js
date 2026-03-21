const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// FIX: This solves the "Endpoint not found" error in your screenshot
app.use((req, res, next) => {
    if (req.url.includes('/chat/completions/chat/completions')) {
        req.url = req.url.replace('/chat/completions/chat/completions', '/chat/completions');
    }
    next();
});

app.use(cors());
app.use(express.json());

const NIM_API_BASE = 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY; // SET THIS IN RENDER DASHBOARD

// The exact model IDs NVIDIA expects
const MODELS = {
    'gpt-4': 'z-ai/glm-4-9b-chat',
    'gpt-4o': 'z-ai/glm-4-9b-chat',
    'gpt-3.5-turbo': 'nvidia/llama-3.1-nemotron-nano-8b-v1'
};

app.get('/health', (req, res) => res.send("Proxy is Online"));

app.post('/v1/chat/completions', async (req, res) => {
    try {
        const { model, messages, temperature, stream } = req.body;
        
        const response = await axios.post(`${NIM_API_BASE}/chat/completions`, {
            model: MODELS[model] || 'z-ai/glm-4-9b-chat',
            messages: messages,
            temperature: temperature || 0.7,
            stream: stream || false
        }, {
            headers: { 
                'Authorization': `Bearer ${NIM_API_KEY}`,
                'Content-Type': 'application/json' 
            },
            responseType: stream ? 'stream' : 'json'
        });

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            response.data.pipe(res);
        } else {
            res.json(response.data);
        }
    } catch (err) {
        console.error("Error:", err.message);
        res.status(500).json({ error: "Proxy Error", detail: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Proxy live on port ${PORT}`));
