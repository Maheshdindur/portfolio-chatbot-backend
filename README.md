# Portfolio Chatbot Backend (Vercel Serverless, Hugging Face)

This is a Node.js serverless backend for your portfolio chatbot, ready to deploy on [Vercel](https://vercel.com/).

## Features
- Keeps Hugging Face API token server-side for security.
- Handles chat, tool-calling (email/question logging), and integrates with your portfolio widget.
- Can be extended to store leads, add analytics, etc.

## Setup & Deploy

1. **Clone this repo and connect to [Vercel](https://vercel.com/).**
2. **Set Environment Variables in Vercel:**
   - `HF_API_TOKEN` — your Hugging Face API token
   - `HF_MODEL` — e.g. `tiiuae/falcon-7b-instruct`
   - `PERSON_NAME` — (optional) e.g. "Mahesh Dindur"
   - `PUSHOVER_TOKEN` and `PUSHOVER_USER` — (optional, for notifications)
3. **Deploy. Your endpoint will be:**  
   `https://<your-vercel-app>.vercel.app/api/chat`
4. **Point your frontend widget to this endpoint.**

## Local Dev

Install dependencies:

```bash
npm install
```

To run locally, use Vercel's dev tools or any Node serverless emulator.

## Security

- Never expose your Hugging Face token in the frontend.
- Optionally add rate limiting or CAPTCHA to prevent abuse.

## License

MIT