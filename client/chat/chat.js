const conversationsSection = document.getElementById("conversations-section");
let selectedConversation;

const messagesSection = document.getElementById("messages-section");
let messagesContainer = document.getElementById("messages-container");
const messageInputForm = document.getElementById("message-input-container");
const messageInput = document.getElementById("message-input");

let socket;

const connect = async () => {
    socket = io();

    socket.on("error", (error) => {
        console.log(error);
        alert(error);
    });
    
    socket.emit("auth-request", localStorage.getItem("token"));
    socket.on("auth-response", async (res) => {
        socket.user = res.user;
        await populateConversaions(await getConversations());
    });

    socket.on("message", (message) => {
        messagesContainer.appendChild(getNewMessageElement(message));
        messagesContainer.scroll(0, messagesContainer.scrollHeight);
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

const isLoggedIn = async () => {
    if(!localStorage.getItem("token")){
        window.location.replace("/");
        return false;
    }

   const { data: response } = await axios.get("/auth", {
       headers: { Authorization: "Bearer " + localStorage.getItem("token") }
   });
   const loggedIn = response;

    if(!loggedIn) {
        localStorage.clear();
        window.location.replace("/");
    }
    return loggedIn;
}

messageInputForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    messageInput.value = messageInput.value.trim();

    if(messageInput.value === "") return;
    
    socket.emit("message-request", conversationsSection.children[selectedConversation-1].dataset.groupId, messageInput.value);

    const messages = await getMessages(selectedConversation);

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

const getNewConversationElement = (conversation) => {
    const newConversation = document.createElement("div");
    newConversation.setAttribute("class", "conversation start align-center");
    newConversation.dataset.groupId = conversation.group_id;

    const conversationImg = document.createElement("img");
    conversationImg.setAttribute("class", "conversation-img");
    conversationImg.setAttribute("src", "../img/UnitChat-logo.svg");

    const conversationName = document.createElement("h4");
    conversationName.textContent = conversation.group_name;

    newConversation.appendChild(conversationImg);
    newConversation.appendChild(conversationName);

    newConversation.addEventListener("click", (event) => {
        selectConversation(Array.prototype.indexOf.call(event.target.parentNode.children, newConversation) + 1);
    });

    return newConversation;
}

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

    const messageBubble = document.createElement("div");
    messageBubble.setAttribute("class", "message-bubble");

    const messageContent = document.createElement("div");
    messageContent.setAttribute("class", "message-content container-h align-center self-center");

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
        const editButton = document.createElement("button");
        editButton.setAttribute("class", "edit-message");
        editButton.addEventListener("click", (event) => {
            messageContent.style.display = "none";
            editButton.style.pointerEvents = "none";
            const value = messageText.textContent;

            const editForm = document.createElement("form");

            const editInput = document.createElement("input");
            editInput.value = value;

            editForm.appendChild(editInput);
            editForm.addEventListener("submit", async (event) => {
                event.preventDefault();

                editForm.remove();
                messageText.textContent = editInput.value.trim();
                messageBubble.insertBefore(messageContent, messageInfo);

                editButton.removeAttribute("style");
                messageContent.removeAttribute("style");
                await socket.emit("edit", {
                    message_id: newMessage.dataset.messageId,
                    text: editInput.value.trim()
                });
            });
            
            messageBubble.insertBefore(editForm, messageInfo);
            editInput.focus();
        });

        const editIcon = document.createElement("span");
        editIcon.setAttribute("class", "material-icons");
        editIcon.textContent = "edit";

        editButton.appendChild(editIcon);

        const deleteButton = document.createElement("button");
        deleteButton.setAttribute("class", "delete-message");
        deleteButton.addEventListener("click", (event) => {
            deleteMessage(message.message_id);
        });

        const deleteIcon = document.createElement("span");
        deleteIcon.setAttribute("class", "material-icons");
        deleteIcon.textContent = "delete"

        deleteButton.appendChild(deleteIcon);

        const buttonsContainer = document.createElement("div");
        buttonsContainer.setAttribute("class", "container-h end");
        buttonsContainer.appendChild(editButton);
        buttonsContainer.appendChild(deleteButton);

        newMessage.addEventListener("mouseenter", () => {
            messageInfo.appendChild(buttonsContainer);
        });
        newMessage.addEventListener("mouseleave", () => {
            messageInfo.removeChild(buttonsContainer);
        });
    }

    messageBubble.appendChild(messageContent);
    messageBubble.appendChild(messageInfo);

    newMessage.appendChild(messageBubble);

    return newMessage;
};

const getConversations = async () => {
    try {
        const { data: response } = await axios.get("/conversations", {
            headers: { Authorization: "Bearer " + localStorage.getItem("token") }
        });
        return response;
    } catch (error) {
        console.log(error);
    }
};

const getMessages = async (groupId) => {
    try {
        const {data: response} = await axios.get("/messages/" + groupId, { headers: {"Authorization": "Bearer " + localStorage.getItem("token")} });
        return response;
    } catch (error) {
        console.log(error);
    }
};

const populateConversaions = (conversations) => {
    const fragment = new DocumentFragment();

    for(let i = 0; i < conversations.length; i++) {
        fragment.appendChild(getNewConversationElement(conversations[i]));
    }

    conversationsSection.appendChild(fragment);
    selectConversation(1);
    selectedConversation = 1;
};

const selectConversation = async (index) => {
    const conversations = conversationsSection.querySelectorAll(".conversation");
    if(conversations[index-1].classList.contains("selected")) return;
    const selectedConversations = conversationsSection.querySelectorAll(".selected");
    for(let i = 0; i < selectedConversations.length; i++) {
        selectedConversations[i].classList.remove("selected");
    }

    if(!conversations[index-1].classList.contains("selected")) conversations[index-1].classList.add("selected");
    selectedConversation = conversations[index-1].dataset.groupId;

    await populateMessages(await getMessages(conversations[index-1].dataset.groupId));
};

const populateMessages = (messages) => {
    if(messagesContainer.hasChildNodes()) {
        messagesContainer.remove();
        messagesContainer = document.createElement("div");
        messagesContainer.setAttribute("id", "messages-container");
        messagesContainer.setAttribute("class", "container start align-center");
        messagesSection.insertBefore(messagesContainer, messagesSection.querySelector(".container"));
    }

    if(!messages) return;

    const fragment = new DocumentFragment();

    for(let i = 0; i < messages.length; i++) {
        fragment.appendChild(getNewMessageElement(messages[i]));
    }

    messagesContainer.appendChild(fragment);
    messagesContainer.scroll(0, messagesContainer.scrollHeight);
};

const stopEditing = () => {
    const messages = messagesContainer.querySelectorAll(".message");
    for(let i = 0; i < messages.length; i++) {
        const bubble = messages[i].querySelector(".message-bubble");
        const form = bubble.querySelector("form");
        if(!form) continue;

        form.remove();

        const messageContent = bubble.querySelector(".message-content");
        editButton.removeAttribute("style");
        messageContent.removeAttribute("style");
    }
}

const deleteMessage = (id) => {
    socket.emit("delete-request", id);
}

const logout = (event) => {
    localStorage.clear();
    location.reload();
};

document.addEventListener("keyup", (event) => {
    if(event.key === "Escape") stopEditing();
});

window.onload = async () => {
    if(await isLoggedIn()) await connect();
    messagesContainer.scroll(0, messagesContainer.scrollHeight);
};