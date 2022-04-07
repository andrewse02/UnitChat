const controller = require("./controller.js");
const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "/../client")));

const server = http.createServer(app);
const io = new Server(server);

app.get("/", controller.serveHome);

app.get("/auth", controller.checkAuth);

app.get("/chat", controller.serveChat);

app.post("/login", controller.login);

app.post("/register", controller.register);

app.get("/user", controller.authorizeUser, controller.getUser);
app.get("/users", controller.authorizeUser, controller.getUsers);

app.get("/users/:id/auth-requests", controller.authorizeUser, controller.getAuthRequests);
app.post("/users/:id/auth-requests", controller.authorizeUser, controller.createAuthRequest);
app.post("/users/:id/auth-response", controller.authorizeUser, controller.postAuthResponse);

app.get("/profile-picture/:id", controller.authorizeUser, controller.getProfilePicture);

app.get("/conversations", controller.authorizeUser, controller.getConversations);
app.get("/conversations/:id/users", controller.authorizeUser, controller.getConversationUsers)
app.post("/conversations", controller.authorizeUser, controller.createConversation);

app.get("/messages/:id", controller.authorizeUser, controller.getMessages);

io.on("connection", controller.onConnection);

server.listen(controller.port, () => {
    console.log(`Listening on ${controller.port}`);
});


module.exports = {
    io
};
