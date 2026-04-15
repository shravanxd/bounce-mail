import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import dns from 'dns';
import net from 'net';
import pLimit from 'p-limit';
import dotenv from 'dotenv';

dotenv.config(); // Fallback to current directory

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const apiKey = process.env.ANTHROPIC_API_KEY || '';

const anthropic = new Anthropic({
  apiKey: apiKey || 'sk-ant-dummy-key',
});

// Helper to remove accents/diacritics
const normalize = (str) => {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]/g, '').toLowerCase();
};

app.post('/api/extract', async (req, res) => {
  try {
    const { text, apiProvider, apiKey: customApiKey } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided' });

    const finalApiKey = customApiKey || apiKey;

    if (!finalApiKey) {
      return res.status(401).json({ error: 'Configure API key to use AI Extract mode.' });
    }

    const prompt = `Extract the company name, domain, and a list of key people from the following text.
    Return ONLY a raw JSON object with this structure:
    {
      "company": "Company Name",
      "domain": "company.com",
      "founders": [
        { "first": "John", "middle": "A", "last": "Smith" }
      ]
    }
    If you cannot find a middle name, leave it out or set to null. If a single name is provided, use just "first". 
    CRITICAL: If the domain is not explicitly mentioned in the text, use your knowledge to infer or guess the official corporate domain based on the company name (e.g., if you see "Canary Technologies", infer their real website domain if you know it, otherwise guess commonly structured domains like "canary.is" or "canarytech.com"). Only return null for the domain if you are absolutely stuck.
    Here is the text:
    ---
    ${text}
    `;

    let jsonStr = '';

    if (apiProvider === 'openai') {
      const openai = new OpenAI({ apiKey: finalApiKey });
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: "You are an expert data extraction assistant. Return only valid JSON. Do not wrap in markdown or backticks." },
          { role: 'user', content: prompt }
        ],
        response_format: { type: "json_object" }
      });
      jsonStr = response.choices[0].message.content.trim();
    } else {
      const tAnthropic = new Anthropic({ apiKey: finalApiKey });
      const response = await tAnthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: "You are an expert data extraction assistant. Return only valid JSON. Do not wrap in markdown or backticks.",
        messages: [{ role: 'user', content: prompt }]
      });
      jsonStr = response.content[0].text.trim();
    }

    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    }
    
    const data = JSON.parse(jsonStr);
    res.json(data);
  } catch (error) {
    console.error('Extraction error:', error);
    const errMsg = error.error?.error?.message || error.error?.message || error.message || 'Failed to extract data';
    res.status(500).json({ error: errMsg });
  }
});

app.post('/api/verify-key', async (req, res) => {
  try {
    const { apiProvider, apiKey: customApiKey } = req.body;
    if (!customApiKey) return res.status(400).json({ error: 'API Key is required' });

    if (apiProvider === 'openai') {
      const openai = new OpenAI({ apiKey: customApiKey });
      // Lightweight call to verify
      await openai.models.list();
      return res.json({ success: true, message: 'OpenAI API Key verified successfully! (200 OK)' });
    } else {
      const tAnthropic = new Anthropic({ apiKey: customApiKey });
      // Lightweight call to verify
      await tAnthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      });
      return res.json({ success: true, message: 'Anthropic API Key verified successfully! (200 OK)' });
    }
  } catch (error) {
    console.error('Verify Key Error:', error);
    const errMsg = error.error?.error?.message || error.error?.message || error.message || 'Invalid API Key or Exceeded Credentials';
    return res.status(400).json({ error: errMsg });
  }
});

const generatePermutations = (founder, domain) => {
  const f = normalize(founder.first);
  const l = normalize(founder.last);
  const m = normalize(founder.middle);
  
  if (!f || !l) return [];
  if (!domain) return [];

  let perms = [
    `${f}@${domain}`,
    `${l}@${domain}`,
    `${f}${l}@${domain}`,
    `${f}.${l}@${domain}`,
    `${f[0]}${l}@${domain}`,
    `${f}${l[0]}@${domain}`,
    `${f[0]}.${l}@${domain}`,
    `${l}.${f}@${domain}`,
    `${f}-${l}@${domain}`,
  ];

  if (m) {
    perms.push(
      `${f}${m[0]}${l}@${domain}`,
      `${f[0]}${m[0]}${l}@${domain}`,
      `${f[0]}${m[0]}.${l}@${domain}`,
      `${f}${m}${l}@${domain}`
    );
  }

  // Deduplicate and filter length
  return [...new Set(perms)].filter(e => e.length > 5).slice(0, 15);
};

// Check if a specific email is valid via SMTP
const checkEmailSMTP = async (email, mxRecord) => {
  return new Promise((resolve) => {
    let responded = false;
    const socket = new net.Socket();
    
    // 8-second timeout
    socket.setTimeout(8000);
    
    const pass = (res) => {
      if (!responded) { responded = true; socket.destroy(); resolve(res); }
    };

    let step = 0;
    
    socket.on('data', (data) => {
      const msg = data.toString();
      const code = parseInt(msg.substring(0, 3));
      
      if (step === 0 && code === 220) {
        socket.write(`EHLO my-validator.local\r\n`);
        step++;
      } else if (step === 1 && code === 250) {
        socket.write(`MAIL FROM:<hello@my-validator.local>\r\n`);
        step++;
      } else if (step === 2 && code === 250) {
        socket.write(`RCPT TO:<${email}>\r\n`);
        step++;
      } else if (step === 3) {
        if (code === 250) {
          pass('valid');
        } else if (code >= 500 && code < 600) {
          pass('invalid');
        } else {
          pass('unknown');
        }
      } else if (code >= 400 && code < 600 && step < 3) {
         // Some block or error on connection/ehlo
         pass('blocked');
      }
    });

    socket.on('error', () => pass('error'));
    socket.on('timeout', () => pass('timeout'));

    socket.connect(25, mxRecord);
  });
};

app.post('/api/validate', async (req, res) => {
  try {
    const { founders, domain } = req.body;
    if (!founders || !domain) return res.status(400).json({ error: 'Missing founders or domain' });

    // Ensure we can check standard MX
    let mxRecords;
    try {
      mxRecords = await dns.promises.resolveMx(domain);
    } catch {
      return res.status(400).json({ error: 'No MX records found for domain' });
    }

    if (!mxRecords || mxRecords.length === 0) {
      return res.status(400).json({ error: 'No MX records found for domain' });
    }

    // Sort MX by priority
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;

    let catchAll = false;
    let fallback = false;

    // Concurrency limiter
    const limit = pLimit(5);
    
    // Test for catch-all: send to gibberish
    const gibberish = `catchall-test-${Date.now()}@${domain}`;
    const gibberishResult = await checkEmailSMTP(gibberish, mxHost);
    
    if (gibberishResult === 'valid') {
      catchAll = true;
    } else if (gibberishResult === 'timeout' || gibberishResult === 'error' || gibberishResult === 'blocked') {
      fallback = true;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial status
    res.write(`data: ${JSON.stringify({ type: 'status', payload: { catchAll, fallback } })}\n\n`);

    const allTasks = [];
    for (const founder of founders) {
      const perms = generatePermutations(founder, domain);
      for (const email of perms) {
        allTasks.push(limit(async () => {
          let status = 'unknown';
          if (fallback) {
            status = 'unverifiable';
          } else if (catchAll) {
            status = 'catch-all';
          } else {
            status = await checkEmailSMTP(email, mxHost);
          }
          
          res.write(`data: ${JSON.stringify({ type: 'result', payload: { founder: founder.first + ' ' + (founder.last || ''), email, status } })}\n\n`);
        }));
      }
    }

    await Promise.all(allTasks);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Validator error:', error);
    res.status(500).json({ error: 'Validation failed' });
    res.end();
  }
});

app.post('/api/validate-single', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Missing or invalid email' });

    const domain = email.split('@')[1];
    
    let mxRecords;
    try {
      mxRecords = await dns.promises.resolveMx(domain);
    } catch {
      return res.json({ email, status: 'invalid' });
    }

    if (!mxRecords || mxRecords.length === 0) {
      return res.json({ email, status: 'invalid' });
    }

    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;

    const gibberish = `catchall-test-${Date.now()}@${domain}`;
    const gibberishResult = await checkEmailSMTP(gibberish, mxHost);
    
    if (gibberishResult === 'valid') {
      return res.json({ email, status: 'catch-all', fallback: false, catchAll: true });
    } else if (gibberishResult === 'timeout' || gibberishResult === 'error' || gibberishResult === 'blocked') {
      return res.json({ email, status: 'unverifiable', fallback: true, catchAll: false });
    }

    const status = await checkEmailSMTP(email, mxHost);
    res.json({ email, status, fallback: false, catchAll: false });

  } catch (error) {
    console.error('Single validation error:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
});

export default app;
if (process.env.VERCEL == null) { app.listen(3001, () => console.log("Running local")); }
