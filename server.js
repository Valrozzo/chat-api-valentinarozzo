const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// ======================================================
// CONFIGURACIÓN
// ======================================================

const MAX_NAME_LENGTH = 30;
const MAX_MESSAGE_LENGTH = 500;
const MAX_HISTORY = 50;

const RATE_LIMIT_MESSAGES = 8;
const RATE_LIMIT_WINDOW = 10000;

const PING_INTERVAL = 30000;

// En producción se debe configurar con la URL real
// del frontend. No se utiliza "*".
const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
  "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// ======================================================
// DATOS EN MEMORIA
// ======================================================

const clients = new Map();
const history = [];

// ======================================================
// FUNCIONES AUXILIARES
// ======================================================

function addHistory(message) {
  history.push(message);

  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

function broadcast(data) {
  const message = JSON.stringify(data);

  for (const client of clients.keys()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function sendTo(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function getUsers() {
  return Array.from(clients.values()).map((client) => client.name);
}

function normalizeText(text) {
  return text.trim();
}

function isValidName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= MAX_NAME_LENGTH
  );
}

function isValidMessage(message) {
  return (
    typeof message === "string" &&
    message.trim().length > 0 &&
    message.length <= MAX_MESSAGE_LENGTH
  );
}

function checkRateLimit(client) {
  const now = Date.now();

  client.messageTimes = client.messageTimes.filter(
    (time) => now - time < RATE_LIMIT_WINDOW
  );

  if (client.messageTimes.length >= RATE_LIMIT_MESSAGES) {
    return false;
  }

  client.messageTimes.push(now);
  return true;
}

// ======================================================
// RUTA HEALTH
// ======================================================

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "chat-websocket",
    users: clients.size,
    history: history.length,
    uptime: process.uptime()
  });
});

// ======================================================
// RUTA DE INFORMACIÓN
// ======================================================

app.get("/", (req, res) => {
  res.json({
    service: "Chat WebSocket",
    status: "online",
    websocket: "enabled",
    health: "/health"
  });
});

// ======================================================
// WEBSOCKET
// ======================================================

const wss = new WebSocket.Server({
  noServer: true
});

// ------------------------------------------------------
// HANDSHAKE / UPGRADE
// ------------------------------------------------------

server.on("upgrade", (request, socket, head) => {
  const origin = request.headers.origin;

  console.log(`[upgrade] Origin: ${origin || "sin origin"}`);

  if (!origin || !allowedOrigins.includes(origin)) {
    console.log(`[upgrade] Rechazado: origen no permitido`);

    socket.write(
      "HTTP/1.1 403 Forbidden\r\n" +
      "Connection: close\r\n" +
      "\r\n"
    );

    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// ------------------------------------------------------
// NUEVA CONEXIÓN
// ------------------------------------------------------

wss.on("connection", (ws, request) => {
  const client = {
    name: null,
    isAlive: true,
    messageTimes: [],
    typing: false
  };

  clients.set(ws, client);

  console.log("[connection] Cliente conectado");

  // ----------------------------------------------
  // MENSAJE DEL CLIENTE
  // ----------------------------------------------

  ws.on("message", (rawData) => {
    let data;

    try {
      data = JSON.parse(rawData.toString());
    } catch (error) {
      sendTo(ws, {
        type: "error",
        message: "Formato de mensaje inválido."
      });

      return;
    }

    // ============================================
    // REGISTRO DEL NOMBRE
    // ============================================

    if (data.type === "join") {
      if (client.name !== null) {
        sendTo(ws, {
          type: "error",
          message: "El nombre ya fue registrado."
        });

        return;
      }

      const name = normalizeText(data.name);

      if (!isValidName(name)) {
        sendTo(ws, {
          type: "error",
          message: `El nombre debe tener entre 1 y ${MAX_NAME_LENGTH} caracteres.`
        });

        return;
      }

      const nameExists = getUsers().some(
        (existingName) =>
          existingName.toLowerCase() === name.toLowerCase()
      );

      if (nameExists) {
        sendTo(ws, {
          type: "error",
          message: "Ese nombre ya está conectado."
        });

        return;
      }

      client.name = name;

      sendTo(ws, {
        type: "welcome",
        message: `Bienvenido, ${client.name}.`,
        history
      });

      addHistory({
        type: "system",
        message: `${client.name} se ha conectado.`,
        timestamp: new Date().toISOString()
      });

      broadcast({
        type: "system",
        message: `${client.name} se ha conectado.`,
        timestamp: new Date().toISOString()
      });

      broadcast({
        type: "users",
        users: getUsers()
      });

      return;
    }

    // ============================================
    // COMPROBAR QUE EL USUARIO TENGA NOMBRE
    // ============================================

    if (!client.name) {
      sendTo(ws, {
        type: "error",
        message: "Primero debes registrarte con un nombre."
      });

      return;
    }

    // ============================================
    // MENSAJE DE CHAT
    // ============================================

    if (data.type === "message") {
      const message = normalizeText(data.message);

      if (!isValidMessage(message)) {
        sendTo(ws, {
          type: "error",
          message: `El mensaje debe tener entre 1 y ${MAX_MESSAGE_LENGTH} caracteres.`
        });

        return;
      }

      if (!checkRateLimit(client)) {
        sendTo(ws, {
          type: "error",
          message:
            "Estás enviando mensajes demasiado rápido. Espera unos segundos."
        });

        return;
      }

      const chatMessage = {
        type: "message",
        name: client.name,
        message,
        timestamp: new Date().toISOString()
      };

      addHistory(chatMessage);
      broadcast(chatMessage);

      return;
    }

    // ============================================
    // ESTÁ ESCRIBIENDO
    // ============================================

    if (data.type === "typing") {
      if (client.typing === Boolean(data.isTyping)) {
        return;
      }

      client.typing = Boolean(data.isTyping);

      broadcast({
        type: "typing",
        name: client.name,
        isTyping: client.typing
      });

      return;
    }

    // ============================================
    // PONG MANUAL
    // ============================================

    if (data.type === "pong") {
      client.isAlive = true;
      return;
    }

    // ============================================
    // TIPO DESCONOCIDO
    // ============================================

    sendTo(ws, {
      type: "error",
      message: "Tipo de mensaje no reconocido."
    });
  });

  // ----------------------------------------------
  // PONG NATIVO DE WEBSOCKET
  // ----------------------------------------------

  ws.on("pong", () => {
    client.isAlive = true;
  });

  // ----------------------------------------------
  // CIERRE
  // ----------------------------------------------

  ws.on("close", (code, reason) => {
    const name = client.name;

    clients.delete(ws);

    console.log(
      `[cierre] ${name || "Cliente sin nombre"} | código: ${code}`
    );

    if (name) {
      const leaveMessage = {
        type: "system",
        message: `${name} se ha desconectado.`,
        timestamp: new Date().toISOString()
      };

      addHistory(leaveMessage);

      broadcast(leaveMessage);

      broadcast({
        type: "users",
        users: getUsers()
      });
    }
  });

  // ----------------------------------------------
  // ERROR
  // ----------------------------------------------

  ws.on("error", (error) => {
    console.error("[websocket error]", error.message);
  });
});

// ======================================================
// PING / PONG
// ======================================================

const pingInterval = setInterval(() => {
  for (const [ws, client] of clients.entries()) {
    if (client.isAlive === false) {
      console.log("[ping] Conexión sin respuesta. Cerrando.");

      ws.terminate();
      continue;
    }

    client.isAlive = false;

    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }
}, PING_INTERVAL);

// ======================================================
// CIERRE DEL SERVIDOR
// ======================================================

function shutdown() {
  console.log("Cerrando servidor...");

  clearInterval(pingInterval);

  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1001, "Servidor apagándose");
    }
  }

  server.close(() => {
    console.log("Servidor cerrado.");
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ======================================================
// INICIAR SERVIDOR
// ======================================================

server.listen(PORT, () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(
    `Orígenes permitidos: ${allowedOrigins.join(", ")}`
  );
});
