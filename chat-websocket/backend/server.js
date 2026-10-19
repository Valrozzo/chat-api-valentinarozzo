const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = (
    process.env.ALLOWED_ORIGINS || "http://localhost:5500"
).split(",").map(origin => origin.trim());

const clients = new Map();
const history = [];

const MAX_HISTORY = 50;
const MAX_MESSAGE_LENGTH = 500;
const MESSAGE_INTERVAL = 500;

const server = http.createServer((req, res) => {

    if (req.url === "/health") {
        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            status: "ok",
            connected: clients.size
        }));

        return;
    }

    res.writeHead(404);
    res.end("Not found");
});

const wss = new WebSocket.Server({
    noServer: true,
    maxPayload: 2048
});

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(data) {
    for (const ws of clients.keys()) {
        send(ws, data);
    }
}

function updateUsers() {
    const users = [...clients.values()]
        .map(client => client.name);

    broadcast({
        type: "users",
        users
    });
}

server.on("upgrade", (request, socket, head) => {

    const origin = request.headers.origin;

    if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
    }

    wss.handleUpgrade(request, socket, head, ws => {
        console.log("[upgrade] Nueva conexión");
        wss.emit("connection", ws, request);
    });
});

wss.on("connection", ws => {

    ws.isAlive = true;

    ws.on("pong", () => {
        ws.isAlive = true;
    });

    ws.on("message", raw => {

        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return send(ws, {
                type: "error",
                message: "Formato inválido"
            });
        }

        if (data.type === "join") {

            if (clients.has(ws)) return;

            if (
                typeof data.name !== "string" ||
                !data.name.trim() ||
                data.name.trim().length > 30
            ) {
                return send(ws, {
                    type: "error",
                    message: "Nombre inválido"
                });
            }

            const name = data.name.trim();

            clients.set(ws, {
                name,
                lastMessage: 0
            });

            send(ws, {
                type: "welcome",
                name
            });

            send(ws, {
                type: "history",
                messages: history
            });

            broadcast({
                type: "notice",
                message: `${name} entró al chat`
            });

            updateUsers();
            return;
        }

        const client = clients.get(ws);

        if (!client) {
            return send(ws, {
                type: "error",
                message: "Debes ingresar primero"
            });
        }

        if (data.type === "message") {

            if (typeof data.text !== "string") {
                return send(ws, {
                    type: "error",
                    message: "Mensaje inválido"
                });
            }

            const text = data.text.trim();

            if (!text || text.length > MAX_MESSAGE_LENGTH) {
                return send(ws, {
                    type: "error",
                    message: "Mensaje vacío o demasiado largo"
                });
            }

            const now = Date.now();

            if (now - client.lastMessage < MESSAGE_INTERVAL) {
                return send(ws, {
                    type: "error",
                    message: "Estás enviando mensajes demasiado rápido"
                });
            }

            client.lastMessage = now;

            const message = {
                name: client.name,
                text,
                time: new Date().toISOString()
            };

            history.push(message);

            if (history.length > MAX_HISTORY) {
                history.shift();
            }

            broadcast({
                type: "message",
                ...message
            });
        }

        if (data.type === "typing") {
            if (typeof data.isTyping !== "boolean") return;

            for (const other of clients.keys()) {
                if (other !== ws) {
                    send(other, {
                        type: "typing",
                        name: client.name,
                        isTyping: data.isTyping
                    });
                }
            }
        }
    });

    ws.on("close", (code) => {

        const client = clients.get(ws);

        console.log(`[cierre] Código: ${code}`);

        if (client) {

            clients.delete(ws);

            broadcast({
                type: "notice",
                message: `${client.name} salió del chat`
            });

            updateUsers();
        }
    });
});

const heartbeat = setInterval(() => {

    for (const ws of wss.clients) {

        if (ws.isAlive === false) {
            ws.terminate();
            continue;
        }

        ws.isAlive = false;
        ws.ping();
    }

}, 30000);

wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
});