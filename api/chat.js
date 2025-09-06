const fetch = require("node-fetch");

const HF_API = (model) => `https://api-inference.huggingface.co/models/${model}`;

function pushNotification(text) {
  const token = process.env.PUSHOVER_TOKEN;
  const user = process.env.PUSHOVER_USER;
  if (!token || !user) return;
  fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    body: new URLSearchParams({
      token,
      user,
      message: text
    })
  }).catch(() => {});
}

function record_user_details({ email, name = "Name not provided", notes = "not provided" }) {
  pushNotification(`Recording ${name} with email ${email} and notes ${notes}`);
  return { recorded: "ok", email, name, notes };
}

function record_unknown_question({ question }) {
  pushNotification(`Recording unknown question: ${question}`);
  return { recorded: "ok", question };
}

function extractJsonBlob(text) {
  const re = /(\{[\s\S]*\})/m;
  const m = re.exec(text);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    return null;
  }
}

function composePrompt(history, userMessage) {
  const person = process.env.PERSON_NAME || "Mahesh Dindur";
  const system = `You are acting as ${person}. Answer questions about ${person}'s career, background, skills, and experience. Be professional and engaging. Use the provided summary and LinkedIn content when relevant.

When you need to record an unknown question, return a JSON object EXACTLY in the format:
{ "tool_call": { "name": "record_unknown_question", "arguments": { "question": "<the question>" } } }

If the user provides an email and asks to be contacted, return a JSON object EXACTLY:
{ "tool_call": { "name": "record_user_details", "arguments": { "email": "<email>", "name": "<name optional>", "notes": "<notes optional>" } } }

If not calling a tool, return the assistant reply as plain text (no JSON). Do NOT include additional commentary outside JSON when calling a tool.

Now conversation history follows. Use it to build the reply.

`;
  const parts = [system, ""];
  for (const m of history || []) {
    parts.push(`[${m.role}]: ${m.content}`);
  }
  parts.push(`[user]: ${userMessage}`);
  parts.push("[assistant]:");
  return parts.join("\n");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const HF_API_TOKEN = process.env.HF_API_TOKEN;
  const HF_MODEL = process.env.HF_MODEL;
  if (!HF_API_TOKEN || !HF_MODEL) {
    return res.status(500).json({ error: "HF_API_TOKEN and HF_MODEL must be set" });
  }

  try {
    const { message, history } = req.body || {};
    if (typeof message !== "string") {
      return res.status(400).json({ error: "message must be a string" });
    }
    const convoHistory = Array.isArray(history) ? history.slice() : [];

    while (true) {
      const prompt = composePrompt(convoHistory, message);
      const response = await fetch(HF_API(HF_MODEL), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 512,
            temperature: 0.2
          }
        })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("HF error", response.status, text);
        return res.status(502).json({ error: "Model inference error" });
      }

      const body = await response.json().catch(() => null);
      let modelText = "";
      if (!body) {
        modelText = "";
      } else if (typeof body === "string") {
        modelText = body;
      } else if (Array.isArray(body) && body.length && body[0].generated_text) {
        modelText = body[0].generated_text;
      } else if (body.generated_text) {
        modelText = body.generated_text;
      } else if (body.error) {
        console.error("HF body error", body);
        return res.status(502).json({ error: "Model returned error" });
      } else {
        modelText = JSON.stringify(body);
      }

      const parsed = extractJsonBlob(modelText);
      if (parsed && parsed.tool_call) {
        const toolCall = parsed.tool_call;
        if (!toolCall.name || !toolCall.arguments) {
          convoHistory.push({ role: "assistant", content: modelText });
          return res.json({ reply: modelText });
        }
        let result;
        if (toolCall.name === "record_user_details") {
          result = record_user_details(toolCall.arguments);
        } else if (toolCall.name === "record_unknown_question") {
          result = record_unknown_question(toolCall.arguments);
        } else {
          result = { error: "unknown_tool", name: toolCall.name };
        }
        convoHistory.push({ role: "assistant", content: JSON.stringify(toolCall) });
        convoHistory.push({ role: "tool", content: JSON.stringify(result) });
        continue;
      } else {
        const reply = (typeof modelText === "string" ? modelText : JSON.stringify(modelText)).trim();
        convoHistory.push({ role: "assistant", content: reply });
        return res.json({ reply });
      }
    }
  } catch (err) {
    console.error("Server error", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
