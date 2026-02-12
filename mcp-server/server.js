import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { connectDB, getDB } from "./db.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

await connectDB();

/* ======================
   OAuth2 TOKEN ROUTE
====================== */
app.post("/oauth/token", (req, res) => {
  const { username } = req.body;

  const token = jwt.sign(
    { username },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ access_token: token });
});

/* ======================
   AUTH MIDDLEWARE
====================== */
function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.sendStatus(401);

  try {
    const token = header.split(" ")[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.sendStatus(403);
  }
}

/* ======================
   MCP QUERY
====================== */
app.post("/mcp/query", verifyToken, async (req, res) => {
  const db = getDB();

  const docs = await db.collection("data").find({}).limit(5).toArray();

  res.json({
    user: req.user.username,
    result: docs
  });
});

/* ======================
   SSE STREAM
====================== */
app.get("/mcp/stream", verifyToken, async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const db = getDB();

  const interval = setInterval(async () => {
    const doc = await db.collection("data").findOne();

    res.write(`data: ${JSON.stringify(doc)}\n\n`);
  }, 3000);

  req.on("close", () => clearInterval(interval));
});

app.listen(process.env.PORT, () => {
  console.log(`🚀 MCP Server running on ${process.env.PORT}`);
});


app.post("/mcp/tool", verifyToken, async (req, res) => {
  const db = getDB();
  const { tool, collection, filter, data } = req.body;

  try {
    let result;

    switch (tool) {

      case "find":
        result = await db.collection(collection)
          .find(filter || {})
          .toArray();
        break;

      case "count":
        const count = await db.collection(collection)
          .countDocuments(filter || {});
        result = { count };
        break;

      case "insert":
        const insertRes = await db.collection(collection)
          .insertOne(data);
        result = { insertedId: insertRes.insertedId };
        break;

      case "createCollection":
        await db.createCollection(collection);
        result = { message: `Collection ${collection} created` };
        break;

      case "dropCollection":
        await db.collection(collection).drop();
        result = { message: `Collection ${collection} dropped` };
        break;

      case "delete":
        const delRes = await db.collection(collection)
          .deleteMany(filter || {});
        result = { deletedCount: delRes.deletedCount };
        break;

      default:
        return res.status(400).json({ error: "Unknown tool" });
    }

    res.json({
      success: true,
      result
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
