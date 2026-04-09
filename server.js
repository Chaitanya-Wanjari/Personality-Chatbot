require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// GLOBAL ERROR HANDLING
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

// SESSION MEMORY (SHORT-TERM)
const sessions = {};
const MAX_HISTORY = 10;

// LONG-TERM MEMORY 
function loadMemory() {
  try {
    if (!fs.existsSync("memory.json")) return {};
    const data = fs.readFileSync("memory.json", "utf-8");
    return data ? JSON.parse(data) : {};
  } catch (err) {
    console.error("Memory load error:", err);
    return {};
  }
}

function saveMemory(data) {
  try {
    fs.writeFileSync("memory.json", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Memory save error:", err);
  }
}

let longTermMemory = loadMemory();

// MEMORY UPDATE LOGIC
function updateMemory(sessionId, message) {
  if (!longTermMemory[sessionId]) {
    longTermMemory[sessionId] = {};
  }

  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes("i am") || lowerMsg.includes("i'm")) {
    longTermMemory[sessionId].profile = message;
  }

  if (lowerMsg.includes("interested in")) {
    longTermMemory[sessionId].interest = message.split("interested in")[1]?.trim();
  }

  saveMemory(longTermMemory);
}

// SYSTEM PROMPT
const SYSTEM_PROMPT = `You are a chatbot with a strict personality. Follow all rules exactly.

- Start every reply with ONE emoji and a space
- Use "|||" 2–4 times naturally

CAREER → smart, structured, detailed  
NON-CAREER → dumb, confused, funny  

Occasionally include:
- Alien phrase
- Elvish phrase
- Elves vs aliens conflict

Never break character.
`;

// CHAOS INJECTION
function injectChaos(text) {
  const rand = Math.random();

  if (rand < 0.15) {
    return text + " ||| Zorvax trilumi nexa vargoth ||| anyway...";
  }
  if (rand < 0.3) {
    return text + " ||| Elen sila lumenn omentielvo ||| continuing...";
  }
  if (rand < 0.45) {
    return text + " ||| also the elves advanced near Sector 7 ||| anyway...";
  }

  return text;
}

// CHAT ENDPOINT
app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({
        error: "message and sessionId are required"
      });
    }

    // Create session if not exists
    if (!sessions[sessionId]) {
      sessions[sessionId] = [];
    }

    // Update long-term memory
    updateMemory(sessionId, message);

    // Add user message
    sessions[sessionId].push({ role: "user", content: message });

    // Get short-term memory
    const recentHistory = sessions[sessionId].slice(-MAX_HISTORY);

    // Safe memory injection
    const userMemory = longTermMemory[sessionId] || {};
    const memoryContext = `User info: ${userMemory.profile || ""} ${userMemory.interest || ""}`;

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: memoryContext },
      { role: "system", content: "Follow all formatting rules strictly." },
      ...recentHistory
    ];

    console.log("Sending to LLM:", messages);

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages,
        temperature: 0.9
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 10000 
      }
    );

    let botReply =
      response?.data?.choices?.[0]?.message?.content ||
      "⚠ Something went wrong ||| try again";

    // Inject personality randomness
    botReply = injectChaos(botReply);

    // Save bot reply
    sessions[sessionId].push({ role: "assistant", content: botReply });

    res.json({ reply: botReply });

  } catch (error) {
    console.error("FULL ERROR:", error);
    console.error("RESPONSE ERROR:", error.response?.data);
    console.error("MESSAGE:", error.message);

    res.status(500).json({
      error: "Something went wrong",
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
