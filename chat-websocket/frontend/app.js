let socket;
let username = "";

let reconnectAttempts = 0;
let reconnectTimer;
let typingTimer;
let statusTimer;

let manualClose = false;

function updateStatus() {

    const status = document.getElementById("status");

    if (!socket) {
        status.textContent = "Desconectado";
        return;
    }

    const states = [
        "Conectando",
        "Conectado",
        "Cerrando",
        "Desconectado"
    ];

    status.textContent = states[socket.readyState];
}

function connect() {

    username = document.getElementById("username").value.trim();

    if (!username || username.length > 30) {
        alert("Ingresa un nombre válido");
        return;
    }

    manualClose = false;

    document.getElementById("login").style.display = "none";
    document.getElementById("chat").style.display = "block";

    startConnection();
}

function startConnection() {

    clearTimeout(reconnectTimer);

    socket = new WebSocket(window.CHAT_CONFIG.WS_URL);

    updateStatus();

    socket.onopen = () => {

        reconnectAttempts = 0;

        updateStatus();

        socket.send(JSON.stringify({
            type: "join",
            name: username
        }));
    };

    socket.onmessage = event => {

        const data = JSON.parse(event.data);

        switch (data.type) {

            case "welcome":
                addNotice(`Bienvenido, ${data.name}`);
                break;

            case "message":
                addMessage(data.name, data.text);
                break;

            case "notice":
                addNotice(data.message);
                break;

            case "users":
                updateUsers(data.users);
                break;

            case "history":
                document.getElementById("messages").textContent = "";

                data.messages.forEach(msg => {
                    addMessage(msg.name, msg.text);
                });
                break;

            case "typing":
                document.getElementById("typing").textContent =
                    data.isTyping
                        ? `${data.name} está escribiendo...`
                        : "";
                break;

            case "error":
                addNotice(`Error: ${data.message}`);
                break;
        }
    };

    socket.onclose = () => {

        updateStatus();

        if (!manualClose) {
            scheduleReconnect();
        }
    };

    socket.onerror = () => {
        updateStatus();
    };
}

function scheduleReconnect() {

    const delay = Math.min(
        1000 * Math.pow(2, reconnectAttempts),
        30000
    );

    reconnectAttempts++;

    addNotice(`Reconectando en ${delay / 1000} segundos...`);

    reconnectTimer = setTimeout(startConnection, delay);
}

function sendMessage() {

    const input = document.getElementById("message");

    const text = input.value.trim();

    if (!text || !socket ||
        socket.readyState !== WebSocket.OPEN) {
        return;
    }

    socket.send(JSON.stringify({
        type: "message",
        text
    }));

    input.value = "";

    sendTyping(false);
}

function addMessage(name, text) {

    const div = document.createElement("div");

    div.className = "message";

    // textContent evita interpretar HTML
    div.textContent = `${name}: ${text}`;

    document.getElementById("messages").appendChild(div);

    div.scrollIntoView();
}

function addNotice(text) {

    const div = document.createElement("div");

    div.className = "notice";
    div.textContent = text;

    document.getElementById("messages").appendChild(div);
}

function updateUsers(users) {

    const list = document.getElementById("users");

    list.textContent = "";

    users.forEach(user => {

        const li = document.createElement("li");

        li.textContent = user;

        list.appendChild(li);
    });
}

function sendTyping(isTyping) {

    if (socket && socket.readyState === WebSocket.OPEN) {

        socket.send(JSON.stringify({
            type: "typing",
            isTyping
        }));
    }
}

document.getElementById("message")
    .addEventListener("input", () => {

        sendTyping(true);

        clearTimeout(typingTimer);

        typingTimer = setTimeout(() => {
            sendTyping(false);
        }, 1000);
    });

document.getElementById("message")
    .addEventListener("keydown", event => {

        if (event.key === "Enter") {
            sendMessage();
        }
    });

function disconnect() {

    manualClose = true;

    clearTimeout(reconnectTimer);
    clearTimeout(typingTimer);

    if (socket) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.close(1000, "Salida voluntaria");
        } else if (socket.readyState === WebSocket.CONNECTING) {
            socket.addEventListener("open", () => {
                socket.close(1000, "Salida voluntaria");
            }, { once: true });
        }
    }

    document.getElementById("chat").style.display = "none";
    document.getElementById("login").style.display = "block";
}

statusTimer = setInterval(updateStatus, 500);