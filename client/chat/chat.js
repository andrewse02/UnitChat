const conversationsSection = document.getElementById("conversations-section");
const newConversationButton = document.getElementById("new-conversation-button");
let selectedConversation;

const conversationModal = document.getElementById("conversation-modal");
const usernameField = document.getElementById("username-field");
const usernameResults = document.getElementById("username-results");
const overlay = document.getElementById("overlay");

const messagesSection = document.getElementById("messages-section");
let messagesContainer = document.getElementById("messages-container");
const messageInputForm = document.getElementById("message-input-container");
const typingIcon = document.getElementById("typing-icon");
const typingText = document.getElementById("typing-text");
const messageInput = document.getElementById("message-input");

let socket;

const profilePictures = [];

const messageValidator = new UnderageValidate({
        errorMessageClass: "error",
        errorMessageContainerClass: "error-message-container",
        errorFieldClass: "error"
    })
    .addField(messageInput.id, {
        max: 1000,
        message: "1000 character limit!"
    });

const connect = async () => {
    socket = io();

    socket.on("error", (error) => {
        console.log(error);
        alert(error);
    });
    
    socket.emit("auth", localStorage.getItem("token"));
    socket.on("auth", async (res) => {
        socket.user = res.user;
        await populateConversaions(await getConversations());
        await selectConversation(0);
    });

    socket.on("conversation", async () => {
        console.log("hit");
        await populateConversaions(await getConversations());
    });

    socket.on("message", async (message) => {

        const newMessage = await getNewMessageElement(message);
        newMessage.style = "animation: message 850ms ease-in;";

        messagesContainer.appendChild(newMessage);
        messagesContainer.scroll(0, messagesContainer.scrollHeight);
    });

    socket.on("edit", async (message) => {
        const found = Array.from(messagesContainer.children).find((child) => +child.dataset.messageId === +message.message_id)
        if(found) found.querySelector(".message-text").textContent = message.text;
    });

    socket.on("delete", (message) => {
        const found = Array.from(messagesContainer.children).find((child) => +child.dataset.messageId === +message.message_id);
        if(found) messagesContainer.removeChild(found);
    });

    socket.on("typing", (typing) => {
        typingFiltered = [...new Set([...typing].filter((element) => element.user.username !== socket.user.username && +conversationsSection.querySelectorAll(".conversation")[selectedConversation].dataset.groupId === +element.group).map((element) => element.user.username))];

        if(typingFiltered.length < 1) {
            typingIcon.style.display = "none";
            return typingText.textContent = "";
        }

        typingText.textContent = typingFiltered.reduce((text, value, i) => text + (i < typing.length - 1 ? ", " : ", and ") + value) + " is typing...";
        typingIcon.style.display = "block";
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
    if(!messageValidator.validate()) return;
    
    socket.emit("message", conversationsSection.querySelectorAll(".conversation")[selectedConversation].dataset.groupId, messageInput.value);

    const messages = await getMessages(conversationsSection.querySelectorAll(".conversation")[selectedConversation].dataset.groupId);
    const newMessage = await getNewMessageElement({
        message_id: messages[messages.length - 1].message_id,
        username: socket.user.username,
        user_id: socket.user.user_id,
        text: messageInput.value,
        created: new Date(Date.now())
    });
    newMessage.style = "animation: message-outgoing 850ms ease-in;";

    messagesContainer.appendChild(newMessage);
    
    messageInput.value = "";
});

messageInput.addEventListener("input", (event) => {
    messageValidator.validate();
    socket.emit("typing", +conversationsSection.querySelectorAll(".conversation")[selectedConversation].dataset.groupId);
});

const getNewConversationElement = async (conversation) => {
    const newConversation = document.createElement("div");
    newConversation.setAttribute("class", "conversation start align-center");
    newConversation.dataset.groupId = conversation.group_id;

    const conversationImg = document.createElement("img");
    conversationImg.setAttribute("class", "conversation-img");
    conversationImg.setAttribute("src", "/img/UnitChat-logo.svg");
    if(conversation.private) conversationImg.setAttribute("src", await getUserProfilePicture(await (await getGroupUsers(conversation.group_id)).filter(user => +user.user_id !== +socket.user.user_id)[0].user_id));

    const conversationName = document.createElement("h4");
    conversationName.textContent = conversation.group_name.replace(",", "").replace(socket.user.username, "");

    newConversation.appendChild(conversationImg);
    newConversation.appendChild(conversationName);

    newConversation.addEventListener("click", async (event) => {
        await selectConversation(Array.prototype.indexOf.call(event.target.parentNode.querySelectorAll(".conversation"), newConversation));
    });

    return newConversation;
}

const getNewMessageElement = async (message) => {
    const fromUser = +socket.user.user_id === +message.user_id;

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
    await userImg.setAttribute("src", await getUserProfilePicture(message.user_id));
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
    messageInfo.setAttribute("class", "message-info container center align-end");

    const date = document.createElement("p");
    date.setAttribute("class", "message-date self-center");
    date.textContent = moment(new Date(message.created)).format("h:mm a")

    if(fromUser) {
        newMessage.setAttribute("class", "message outgoing start align-start");

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
        deleteIcon.textContent = "delete";

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
    newMessage.appendChild(date);

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

const populateConversaions = async (conversations) => {
    const fragment = new DocumentFragment();

    for(let i = 0; i < conversations.length; i++) {
        await fragment.appendChild(await getNewConversationElement(conversations[i]));
    }

    const currentConversations = conversationsSection.querySelectorAll(".conversation");
    for(let i = 0; i < currentConversations.length; i++) {
        currentConversations[i].remove();
    }

    conversationsSection.appendChild(fragment);
    selectedConversation = 0;
};

const selectConversation = async (index) => {
    const conversations = conversationsSection.querySelectorAll(".conversation");
    if(conversations[index].classList.contains("selected")) return;
    
    const selectedConversations = conversationsSection.querySelectorAll(".selected");
    for(let i = 0; i < selectedConversations.length; i++) {
        selectedConversations[i].classList.remove("selected");
    }

    if(!conversations[index].classList.contains("selected")) conversations[index].classList.add("selected");
    selectedConversation = index;

    await populateMessages(await getMessages(conversations[index].dataset.groupId));
};

const createConversation = async (username) => {
    const body = { username };

    axios
        .post("/conversations", body, { headers: { Authorization: "Bearer " + localStorage.getItem("token") } })
        .then(async (res) => {
            await populateConversaions(await getConversations());
            selectConversation(conversationsSection.querySelectorAll(".conversation").length - 1);
        })
        .catch((error) => {
            if(error.response.status === 409) return alert("Group already exists!");
            console.log(error.message);
        });
};

const populateMessages = async (messages) => {
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
        fragment.appendChild(await getNewMessageElement(messages[i]));
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
    socket.emit("delete", id);
};


const searchUsers = async(searchTerm) => {
    const { data: response } = await axios.get("/users?username=" + searchTerm, {headers: { Authorization: "Bearer " + localStorage.getItem("token") }});
    return response;
};

const getUserProfilePicture = async (id) => {
    if(profilePictures[id]) return profilePictures[id];

    const {data: response} = await axios.get("/profile-picture/" + id, {headers: { Authorization: "Bearer " + localStorage.getItem("token") }});
    profilePictures[id] = response;
    return response;
};

const getGroupUsers = async (id) => {
    const {data: response} = await axios.get("/conversations/" + id + "/users", {headers: { Authorization: "Bearer " + localStorage.getItem("token") }});
    return response;
};

const logout = (event) => {
    localStorage.clear();
    location.reload();
};

newConversationButton.addEventListener("click", async (event) => {
    conversationModal.style.display = "flex";
    overlay.style.display = "block";
    usernameField.focus();
});

overlay.addEventListener("click", (event) => {
    hideModals();
});

usernameField.addEventListener("input", async (event) => {
    const results = await(await searchUsers(usernameField.value));
    if(results.length < 1) return usernameResults.style.display = "none";

    while (usernameResults.hasChildNodes()) {
        usernameResults.removeChild(usernameResults.firstChild);
    }

    if(results.map((user) => user.username.toLowerCase()).includes(socket.user.username.toLowerCase())) return usernameResults.style.display = "none";

    usernameResults.style.display = "flex";

    const fragment = new DocumentFragment();

    for(let i = 0; i < results.length; i++) {
        const resultButton = document.createElement("button");
        resultButton.setAttribute("class", "search-result");

        const resultPic = document.createElement("img");
        resultPic.setAttribute("src", results[i].profile_pic);

        const resultTitle = document.createElement("h5");
        resultTitle.textContent = results[i].username;
        
        resultButton.appendChild(resultPic);
        resultButton.appendChild(resultTitle);

        resultButton.addEventListener("click", async (event) => {
            usernameField.value = results[i].username;
            usernameResults.style.display = "none";

            while(usernameResults.hasChildNodes()) {
                usernameResults.removeChild(usernameResults.firstChild);
            }

            createConversation(usernameField.value);
            hideModals();
        });
        
        fragment.appendChild(resultButton);
    }

    usernameResults.appendChild(fragment);
});

conversationModal.addEventListener("submit", async (event) => {
    event.preventDefault();

    createConversation(usernameField.value);
    hideModals();
});

const hideModals = () => {
    conversationModal.style.display = "none";
    overlay.style.display = "none";

    usernameField.value = "";
};

document.addEventListener("keyup", (event) => {
    if(event.key === "Escape") stopEditing();
});

const checkTheme = async () => {
    if (localStorage.getItem("token")) {
        await axios.get("/user", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } })
            .then((res) => {
                if (res.data.username.toLowerCase().includes("joely") || res.data.username.toLowerCase().includes("vernier")) {
                    document.documentElement.style.setProperty("--color-primary", "#FF1F1F");
                    document.documentElement.style.setProperty("--color-highlight1", "#830000");
                }
            })
            .catch((error) => {
                console.log(error);
            });
    }
}

window.onload = async () => {
    if(await isLoggedIn()) await connect();
    messagesContainer.scroll(0, messagesContainer.scrollHeight);
    checkTheme();
};