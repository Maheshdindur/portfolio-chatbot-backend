const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'models/gemini-1.5-flash';

const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;
const PUSHOVER_USER = process.env.PUSHOVER_USER;

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable not set');
}

async function sendPushoverNotification(message) {
  if (!PUSHOVER_TOKEN || !PUSHOVER_USER) return;
  try {
    await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: PUSHOVER_TOKEN,
        user: PUSHOVER_USER,
        message,
      }),
    });
  } catch (error) {
    // Optional: log or ignore errors from notifications
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const { message, history = [] } = body;

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Message is required.' });
    return;
  }

  // Send Pushover notification (async, don\'t block response)
  sendPushoverNotification(`New chatbot message: ${message}`).catch(() => {});

  // Format chat history for Gemini
  const geminiHistory = history.map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));
  geminiHistory.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: geminiHistory })
    });

    if (!response.ok) {
      const errData = await response.json();
      res.status(response.status).json({ error: errData.error || 'Gemini API error' });
      return;
    }

    const data = await response.json();
    const answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No response from Gemini.';

    res.status(200).json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
