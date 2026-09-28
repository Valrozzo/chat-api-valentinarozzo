let socket = null;

let reconnectAttempts = 0;

let reconnectTimer = null;

let typingTimer = null;


// -------------------------------------
// ELEMENTOS HTML
// -------------------------------------

const loginSection =
    document.getElementById("loginSection");

const chatSection =
    document.getElementById("chatSection");

const nameInput =
    document.getElementById("nameInput");

const connectButton =
    document.getElementById("connectButton");

const connectionStatus =
    document.getElementById("connectionStatus");

const readyState =
    document.getElementById("readyState");

const usersList =
    document.getElementById("usersList");

const messages =
    document.getElementById("messages");

const messageForm =
    document.getElementById("messageForm");

const messageInput =
    document.getElementById("messageInput");

const typingIndicator =
    document.getElementById("typingIndicator");

const loginError =
    document.getElementById("loginError");

const messageError =
    document.getElementById("messageError");


// -------------------------------------
// CONVERTIR HTTP A WS
// -------------------------------------

function getWebSocketURL() {

    const url =
        new URL(CONFIG.BACKEND_URL);

    if (url.protocol === "https:") {

        url.protocol = "wss:";

    } else {

        url.protocol = "ws:";

    }

    return url.toString();
}


// -------------------------------------
// READY STATE
// -------------------------------------

function updateReadyState() {

    if (!socket) {

        readyState.textContent = "3";

        return;
    }

    readyState.textContent =
        socket.readyState;
}


// -------------------------------------
// ESTADO DE CONEXIÓN
// -------------------------------------

function updateStatus(status) {

    connectionStatus.textContent =
        status;

    updateReadyState();
}


// -------------------------------------
// MOSTRAR MENSAJE
// -------------------------------------

function showMessage(data) {

    const div =
        document.createElement("div");


    // MENSAJE DEL SISTEMA

    if (data.type === "system") {

        div.className =
            "message system";

        div.textContent =
            `[Sistema] ${data.message}`;

    }


    // MENSAJE NORMAL

    else {

        div.className =
            "message";


        const name =
            document.createElement("strong");

        name.textContent =
            `${data.name}:`;


        const message =
            document.createElement("span");

        message.textContent =
            ` ${data.message}`;


        div.appendChild(name);

        div.appendChild(message);
    }


    messages.appendChild(div);


    messages.scrollTop =
        messages.scrollHeight;
}


// -------------------------------------
// USUARIOS
// -------------------------------------

function updateUsers(users) {

    usersList.innerHTML = "";


    users.forEach(user => {

        const li =
            document.createElement("li");

        li.textContent =
            user;

        usersList.appendChild(li);

    });
}


// -------------------------------------
// CONECTAR
// -------------------------------------

function connect() {

    const name =
        nameInput.value.trim();


    // VALIDAR NOMBRE

    if (!name) {

        loginError.textContent =
            "Debes escribir un nombre.";

        return;
    }


    if (name.length > 30) {

        loginError.textContent =
            "El nombre no puede superar 30 caracteres.";

        return;
    }


    loginError.textContent = "";


    const wsURL =
        getWebSocketURL();


    console.log(
        "Conectando a:",
        wsURL
    );


    socket =
        new WebSocket(wsURL);


    updateStatus(
        "Conectando..."
    );


    // ---------------------------------
    // CONEXIÓN ABIERTA
    // ---------------------------------

    socket.addEventListener(
        "open",
        () => {

            console.log(
                "WebSocket conectado"
            );


            reconnectAttempts = 0;


            updateStatus(
                "Conectado"
            );


            loginSection.classList.add(
                "hidden"
            );


            chatSection.classList.remove(
                "hidden"
            );


            socket.send(
                JSON.stringify({
                    type: "join",
                    name: name
                })
            );


            messageInput.focus();

        }
    );


    // ---------------------------------
    // RECIBIR MENSAJES
    // ---------------------------------

    socket.addEventListener(
        "message",
        event => {

            try {

                const data =
                    JSON.parse(event.data);


                // USUARIO CONECTADO

                if (
                    data.type === "joined"
                ) {

                    updateStatus(
                        "Conectado"
                    );

                    return;
                }


                // HISTORIAL

                if (
                    data.type === "history"
                ) {

                    messages.innerHTML = "";


                    data.messages.forEach(
                        showMessage
                    );


                    return;
                }


                // MENSAJE

                if (
                    data.type === "message"
                ) {

                    showMessage(data);

                    return;
                }


                // SISTEMA

                if (
                    data.type === "system"
                ) {

                    showMessage(data);

                    return;
                }


                // USUARIOS

                if (
                    data.type === "users"
                ) {

                    updateUsers(
                        data.users
                    );

                    return;
                }


                // ESCRIBIENDO

                if (
                    data.type === "typing"
                ) {

                    if (
                        data.name !== name &&
                        data.typing === true
                    ) {

                        typingIndicator.textContent =
                            `${data.name} está escribiendo...`;

                    } else {

                        typingIndicator.textContent =
                            "";

                    }

                    return;
                }


                // ERROR

                if (
                    data.type === "error"
                ) {

                    messageError.textContent =
                        data.message;


                    setTimeout(
                        () => {

                            messageError.textContent =
                                "";

                        },
                        3000
                    );

                }

            } catch (error) {

                console.error(
                    "Error procesando mensaje:",
                    error
                );

            }

        }
    );


    // ---------------------------------
    // CERRAR CONEXIÓN
    // ---------------------------------

    socket.addEventListener(
        "close",
        () => {

            console.log(
                "WebSocket desconectado"
            );


            updateStatus(
                "Desconectado"
            );


            scheduleReconnect();

        }
    );


    // ---------------------------------
    // ERROR
    // ---------------------------------

    socket.addEventListener(
        "error",
        error => {

            console.error(
                "Error WebSocket:",
                error
            );


            updateStatus(
                "Error"
            );

        }
    );


    // ---------------------------------
    // ACTUALIZAR READY STATE
    // ---------------------------------

    const stateInterval =
        setInterval(
            () => {

                updateReadyState();


                if (
                    !socket ||
                    socket.readyState ===
                    WebSocket.CLOSED
                ) {

                    clearInterval(
                        stateInterval
                    );

                }

            },
            500
        );
}


// -------------------------------------
// RECONEXIÓN AUTOMÁTICA
// -------------------------------------

function scheduleReconnect() {

    if (reconnectTimer) {

        return;
    }


    const delay =
        Math.min(
            1000 *
            Math.pow(
                2,
                reconnectAttempts
            ),
            30000
        );


    reconnectAttempts++;


    console.log(
        `Reconexión en ${delay} ms`
    );


    reconnectTimer =
        setTimeout(
            () => {

                reconnectTimer =
                    null;


                if (
                    socket &&
                    socket.readyState ===
                    WebSocket.OPEN
                ) {

                    return;
                }


                connect();

            },
            delay
        );
}


// -------------------------------------
// BOTÓN CONECTAR
// -------------------------------------

connectButton.addEventListener(
    "click",
    connect
);


// -------------------------------------
// ENVIAR MENSAJE
// -------------------------------------

messageForm.addEventListener(
    "submit",
    event => {

        event.preventDefault();


        messageError.textContent =
            "";


        // VERIFICAR CONEXIÓN

        if (
            !socket ||
            socket.readyState !==
            WebSocket.OPEN
        ) {

            messageError.textContent =
                "No estás conectado.";

            return;
        }


        const message =
            messageInput.value.trim();


        // MENSAJE VACÍO

        if (!message) {

            messageError.textContent =
                "El mensaje no puede estar vacío.";

            return;
        }


        // MENSAJE MUY LARGO

        if (message.length > 500) {

            messageError.textContent =
                "El mensaje no puede superar 500 caracteres.";

            return;
        }


        // ENVIAR

        socket.send(
            JSON.stringify({
                type: "message",
                message: message
            })
        );


        // DETENER INDICADOR

        socket.send(
            JSON.stringify({
                type: "typing",
                typing: false
            })
        );


        messageInput.value = "";

        messageInput.focus();

    }
);


// -------------------------------------
// INDICADOR "ESCRIBIENDO"
// -------------------------------------

messageInput.addEventListener(
    "input",
    () => {

        if (
            !socket ||
            socket.readyState !==
            WebSocket.OPEN
        ) {

            return;
        }


        socket.send(
            JSON.stringify({
                type: "typing",
                typing: true
            })
        );


        clearTimeout(
            typingTimer
        );


        typingTimer =
            setTimeout(
                () => {

                    if (
                        socket &&
                        socket.readyState ===
                        WebSocket.OPEN
                    ) {

                        socket.send(
                            JSON.stringify({
                                type: "typing",
                                typing: false
                            })
                        );

                    }

                },
                1000
            );

    }
);
