const htmlBody = document.body;

const loginForm = document.getElementById("login-form");
const loginUsername = document.getElementById("login-username");
const loginPassword = document.getElementById("login-password");

const registerForm = document.getElementById("register-form");
const registerUsername = document.getElementById("register-username");
const registerPassword = document.getElementById("register-password");
let messages = [];

const messagesBox = document.createElement("div");
messagesBox.id = "messages-box";
const messagesList = document.createElement("ul");
messagesList.id = "messages";

const typingText = document.createElement("p");
typingText.id = "typing";
messagesBox.appendChild(messagesList);

const messagesCreator = document.createElement("form");
messagesCreator.id = "messages-creator";
const messageInput = document.createElement("input");
messageInput.type = "text";
messageInput.id = "message-input";
messageInput.placeholder = "Message";
messageInput.autocomplete = "off";
const sendButton = document.createElement("button");
sendButton.id = "send-button";
sendButton.className = "primary";
sendButton.textContent = "Send";
messagesCreator.appendChild(messageInput);
messagesCreator.appendChild(sendButton);

const changeSection = document.createElement("section");
changeSection.id = "change-section";
const changeInput = document.createElement("input");
changeInput.id = "change-input";
changeInput.type = "text";
changeInput.placeholder = "Username";
changeInput.autocomplete = "off";
const changeButton = document.createElement("button");
changeButton.id = "change-button";
changeButton.textContent = "Change Username";
changeSection.appendChild(changeInput);
changeSection.appendChild(changeButton);
const logoutButton = document.createElement("button");
logoutButton.id = "logout-button";
logoutButton.className = "danger";
logoutButton.textContent = "Logout";

let socket;

const connect = () => {
    socket = io();

    socket.on("error", (error) => {
        console.log(error);
        alert(error);
    });
    
    socket.emit("auth-request", localStorage.getItem("token"));
    socket.on("auth-response", (res) => {
        socket.user = res.user;

        htmlBody.appendChild(messagesBox);
        htmlBody.appendChild(typingText);
        htmlBody.appendChild(messagesCreator);
        htmlBody.appendChild(changeSection);
        htmlBody.appendChild(logoutButton);
    });

    socket.emit("refresh-messages");

    socket.on("refresh-messages", (serverMessages) => {
        populateMessages(serverMessages, socket);
    });

    socket.on("typing", (typing) => {
        typingFiltered = typing.filter((username) => username !== socket.user.username);
        typingText.textContent = typingFiltered.length > 0 ? typingFiltered.reduce((text, value, i) => text + (i < typing.length - 1 ? ", " : ", and ") + value) + " is typing..." : "";
    });

    socket.on("change-response", (user) => {
        socket.user = user;
        changeInput.value = "";
    });
}

const checkLoggedIn = () => {
    if(localStorage.getItem("token")) {
        htmlBody.removeChild(loginForm);
        if (htmlBody.contains(registerForm)) {
            htmlBody.removeChild(registerForm);
        }

        connect();
    }
}

loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const body = {
        username: loginUsername.value,
        password: loginPassword.value
    };

    loginUsername.value = "";
    loginPassword.value = "";

    axios
        .post("/login", body)
        .then((res) => {
            localStorage.setItem("token", res.data);

            htmlBody.removeChild(loginForm);
            if (htmlBody.contains(registerForm)) {
                htmlBody.removeChild(registerForm);
            }

            htmlBody.appendChild(messagesBox);
            htmlBody.appendChild(messagesCreator);

            htmlBody.appendChild(changeSection);
            htmlBody.appendChild(logoutButton);

            connect();
        })
        .catch((error) => {
            console.log(error);
            alert(error.response.data);
        });
});

registerForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const body = {
        username: registerUsername.value,
        password: registerPassword.value
    };

    registerUsername.value = "";
    registerPassword.value = "";

    axios
        .post("/register", body)
        .then((res) => {
            document.querySelector("body").removeChild(registerForm);
        })
        .catch((error) => {
            console.log(error);
            alert(error.response.data);
        });
});

messagesCreator.addEventListener("submit", (event) => {
    event.preventDefault();
    
    messageInput.value = "";
    socket.emit("message-request", messageInput.value);
});

messageInput.addEventListener("input", (event) => {
    socket.emit("typing");
});

changeButton.addEventListener("click", (event) => {
    socket.emit("change-request", changeInput.value);
});

const populateMessages = (serverMessages, socket) => {
    while(messagesList.firstChild) {
        messagesList.removeChild(messagesList.firstChild);
    }

    messages = [];

    for (let i = 0; i < serverMessages.length; i++) {
        const { id, username, userID, message, date } = serverMessages[i];

        if (!messages.find((element) => element.id === id)) {
            const messageElement = document.createElement("div");
            messageElement.className = "message";

            const messageContent = document.createElement("p");
            messageContent.className = "message-content";
            messageContent.textContent = `[${username}]: ${message}`;

            const dateDelete = document.createElement("div");
            dateDelete.className = "date-delete";

            const dateElement = document.createElement("p");
            dateElement.className = "date";
            dateElement.textContent = `${new Date(date).toLocaleTimeString()}`;

            dateDelete.appendChild(dateElement);

            if(socket && +userID === +socket.user.id) {
                const deleteElement = document.createElement("p");
                deleteElement.className = "delete";
                deleteElement.textContent = "Delete";

                deleteElement.addEventListener("click", (event) => {
                    deleteMessage(id);
                });
                
                dateDelete.appendChild(deleteElement);
            }

            messageElement.appendChild(messageContent);
            messageElement.appendChild(dateDelete);

            const messageHTML = `
            <div class="message">
                <p class="message-content">[${username}]: ${message}</p>
                <div class="date-delete">
                    <p class="date">${new Date(date).toLocaleTimeString()}</p>
                    <p class="delete" onclick="deleteMessage(${id})">Delete</p>
                </div>
            </div>
            `;

            const newMessage = document.createElement("li");
            newMessage.appendChild(messageElement);

            messagesList.appendChild(newMessage);

            messages.push(serverMessages[i]);
            window.scrollTo(0, messagesBox.scrollHeight);
        }
    }
};

const deleteMessage = (id) => {
    socket.emit("delete-request", id);
}

const logout = (event) => {
    localStorage.clear();
    location.reload();
};

logoutButton.addEventListener("click", logout);

window.onload = checkLoggedIn;