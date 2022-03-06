let messages = [];

const messagesContainer = document.getElementById("messages-container");
const messageInputForm = document.getElementById("message-input-container");
const messageInput = document.getElementById("message-input");

let socket;

const connect = () => {
    socket = io();

    socket.on("error", (error) => {
        console.log(error);
        alert(error);
    });
    
    socket.emit("auth-request", localStorage.getItem("token"));
    socket.on("auth-response", async (res) => {
        socket.user = res.user;
        await populateMessages(await getMessages());
    });

    socket.on("message", (message) => {
        console.log("hit");
        messagesContainer.appendChild(getNewMessageElement(message));
    });

    socket.on("delete", (message) => {
        const found = Array.from(messagesContainer.children).find((child) => +child.dataset.messageId === +message.message_id);

        if(found) messagesContainer.removeChild(found);
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
        connect();
    }
}

messageInputForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if(messageInput.value === "") return;
    
    socket.emit("message-request", messageInput.value);

    const messages = await getMessages();

    messagesContainer.appendChild(getNewMessageElement({
        message_id: messages[messages.length - 1].message_id,
        username: socket.user.username,
        user_id: socket.user.user_id,
        text: messageInput.value,
        created: new Date(Date.now())
    }));
    
    messageInput.value = "";
});

messageInput.addEventListener("input", (event) => {
    //socket.emit("typing");
});

const getNewMessageElement = (message) => {
    const newMessage = document.createElement("div");
    newMessage.setAttribute("class", "message start align-start");
    newMessage.dataset.messageId = message.message_id;
    newMessage.dataset.userId = message.user_id;

    const userInfo = document.createElement("div");
    userInfo.setAttribute("class", "message-user-info container align-start");

    const username = document.createElement("p");
    username.textContent = message.username;
    userInfo.appendChild(username);

    const userImg = document.createElement("img");
    userImg.setAttribute("class", "message-img");
    // Set to actual pfp
    userImg.setAttribute("src", "../img/UnitChat-logo.svg");
    userInfo.appendChild(userImg);
    newMessage.appendChild(userInfo);

    const messageContent = document.createElement("div");
    messageContent.setAttribute("class", "message-content container-h align-start");

    const messageText = document.createElement("p");
    messageText.setAttribute("class", "message-text");
    messageText.textContent = message.text;
    messageContent.appendChild(messageText);

    const messageInfo = document.createElement("div");
    messageInfo.setAttribute("class", "message-info container align-end");

    const date = document.createElement("p");
    date.setAttribute("class", "message-date");
    date.textContent = moment(new Date(message.created)).format("h:mm a")
    messageInfo.appendChild(date);

    if(+socket.user.user_id === +message.user_id) {
        const deleteButton = document.createElement("button");

        deleteButton.setAttribute("class", "delete-message");
        deleteButton.addEventListener("click", (event) => {
            deleteMessage(message.message_id);
        });

        const deleteIcon = document.createElement("span");
        deleteIcon.setAttribute("class", "material-icons");
        deleteIcon.textContent = "delete"

        deleteButton.appendChild(deleteIcon);

        newMessage.addEventListener("mouseenter", () => messageInfo.appendChild(deleteButton));
        newMessage.addEventListener("mouseleave", () => messageInfo.removeChild(deleteButton));
    }

    newMessage.appendChild(messageContent);
    newMessage.appendChild(messageInfo);

    return newMessage;
};

const getMessages = async () => {
    try {
        const {data: response} = await axios.get("/messages", {headers: {"Authorization": "Bearer " + localStorage.getItem("token")}});
        return response;
    } catch (error) {
        console.log(error);
    }
};

const populateMessages = (messages) => {
    const fragment = new DocumentFragment();

    for(let i = 0; i < messages.length; i++) {
        fragment.appendChild(getNewMessageElement(messages[i]));
    }

    messagesContainer.appendChild(fragment);
    messagesContainer.scroll(0, messagesContainer.scrollHeight);
};

const deleteMessage = (id) => {
    socket.emit("delete-request", id);
}

const logout = (event) => {
    localStorage.clear();
    location.reload();
};

window.onload = () => {
    checkLoggedIn();
    messagesContainer.scroll(0, messagesContainer.scrollHeight);
}