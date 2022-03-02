require("dotenv").config();
const secret = process.env.ACCESS_TOKEN_SECRET;
const jwt = require("jsonwebtoken");
const path = require("path");
const bcrypt = require("bcryptjs");

const Sequelize = require("sequelize");
const connection_string = process.env.DATABASE_URL;
const sequelize = new Sequelize(connection_string, {
    dialect: "postgres",
    dialectOptions: {
        ssl: {
            rejectUnauthorized: false
        }
    }
});

const port = process.env.PORT || 4000;

const users = [];
const messages = [];
let typing = [];

const serveHome = (req, res) => {
    res.sendFile(path.resolve("client/home/home.html"));
}

const serveChat = (req, res) => {
    res.sendFile(path.resolve("client/chat/chat.html"));
};

const login = (req, res) => {
    let { username, password } = req.body;

    if (!username || !password) return res.status(400).send("Missing some fields!");

    username = sequelize.escape(username);

    sequelize.query(`
    SELECT * FROM users
    WHERE lower(username) = ${username.toLowerCase()};`)
    .then(async (dbRes) => {
        if(!dbRes[0][0]) return res.status(401).send("Username or password is incorrect!");
        console.log(dbRes[0][0]);

        const matches = await bcrypt.compareSync(password, dbRes[0][0].password);
        console.log(password, dbRes[0][0].password, matches);
        if(!matches) return res.status(401).send("Username or password is incorrect!");

        return res.status(200).send(jwt.sign({ password, ...dbRes[0][0] }, secret));
    })
    .catch((error) => {
        console.log(error);
        return res.sendStatus(500);
    });

    // for (let i = 0; i < users.length; i++) {
    //     if (users[i].username.toLowerCase() !== username.toLowerCase()) continue;

    //     const matches = bcrypt.compareSync(password, users[i].password);
    //     if (!matches) return res.status(400).send("Incorrect password!");
        
    //     return res.status(200).send(users[i].token);
    // }
};

const register = (req, res) => {
    let { first, last, email, username, password } = req.body;

    if (!first || !last || !email || !username || !password) return res.status(400).send("Missing some fields!");

    // Validate Fields

    first = sequelize.escape(first);
    last = sequelize.escape(last);
    email = sequelize.escape(email);
    username = sequelize.escape(username);
    password = bcrypt.hashSync(password, 10);

    sequelize.query(`
    SELECT email, username FROM users
    WHERE lower(email) = ${email.toLowerCase()} OR lower(username) = ${username.toLowerCase()};`)
    .then((dbRes) => {
        if(dbRes[0][0] && dbRes[0][0].email) return res.status(409).send("Email already in use!");
        if(dbRes[0][0] && dbRes[0][0].username) return res.status(409).send("Username already taken!");
    })
    .catch((error) => {
        console.log(error);
        return res.sendStatus(500);
    });

    sequelize.query(`
    INSERT INTO users(first_name, last_name, email, username, password, joined)
    VALUES(${first}, ${last}, ${email}, ${username}, '${password}', NOW())
    RETURNING *;`)
    .then((dbRes) => {
        return res.status(200).send(jwt.sign({ password, ...dbRes[0] }, secret));
    })
    .catch((error) => {
        console.log(error);
        return res.sendStatus(500);
    });
};

const changeUsername = (socket, username) => {
    if(!username) return { error: "No username input!" };

    const foundIndex = users.findIndex((user) => +user.id === +socket.user.id);

    if(!users[foundIndex]) return { error: "User not found!" };
    
    users[foundIndex].username = username;
    const newToken = jwt.sign(users[foundIndex], secret);
    users[foundIndex].token = newToken;
    socket.user = users[foundIndex];

    const { token, password, ...censored } = socket.user;
    return censored;
};

const deleteMessage = (socket, id) => {
    if (!id) return { error: "ID not input!" };

    const foundMessage = messages.find((message) => +message.id === +id);

    if (!foundMessage) return { error: "Message does not exist!" };
    if (+foundMessage.userID !== +socket.user.id) return { error: "You did not send this message!" };
    
    return messages.splice(messages.indexOf(foundMessage), 1);
};

const authorizeUser = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token == null) return res.status(401).send("No token provided!");

    jwt.verify(token, secret, (error, user) => {
        if (error) return res.status(403).send("Unauthorized token provided!");
        
        req.user = user;
        next();
    });
};

const onConnection = (socket) => {
    const io = require("./index.js").io;

    console.log("A client has connected.");
    
    socket.on("auth-request", (recievedToken) => {
        const authResponse = authorizeSocket(recievedToken);
        if (authResponse.error) {
            socket.emit("error", authResponse.error);
            return socket.disconnect(true);
        }

        if(!authResponse.user) return;

        socket.user = authResponse.user;
        const { token, password, ...censored } = authResponse.user;
        socket.emit("auth-response", { error: null, user: censored});
    });

    socket.on("refresh-messages", () => {
        const authResponse = authorizeSocket(socket.user.token);
        if(authResponse.error) return socket.emit("error", authResponse.error);

        socket.emit("refresh-messages", messages);
    });

    socket.on("message-request", (message) => {
        const authResponse = authorizeSocket(socket.user.token);
        if(authResponse.error) return socket.emit("error", authResponse.error);

        const newMessage = {
            id: messages.length + 1,
            username: authResponse.user.username,
            userID: authResponse.user.id,
            message,
            date: new Date(Date.now())
        };

        messages.push(newMessage);
        io.emit("refresh-messages", messages);
    });

    socket.on("delete-request", (id) => {
        const authResponse = authorizeSocket(socket.user.token);
        if(authResponse.error) return socket.emit("error", authResponse.error);

        const deleteResponse = deleteMessage(socket, id);
        if(deleteResponse.error) return socket.emit("error", deleteResponse.error);
        
        io.emit("refresh-messages", messages);
    });

    socket.on("typing", () => {
        const authResponse = authorizeSocket(socket.user.token);
        if(authResponse.error) return socket.emit("error", authResponse.error);
        
        const typingEntry = { user: authResponse.user };
        
        let foundIndex = typing.findIndex((element) => +element.user.id === +authResponse.user.id);

        if (!typing[foundIndex]) {
            typingEntry.timeout = setTimeout(() => {
                typing = typing.filter((element) => element.user.id !== authResponse.user.id);
                const usernames = typing.map((object) => object.user.username);

                io.emit("typing", usernames);
            }, 3000);
            typing.push(typingEntry);
            const usernames = typing.map((object) => object.user.username);
            return io.emit("typing", usernames);
        }

        let usernames = typing.map((object) => object.user.username);
        clearTimeout(typing[foundIndex].timeout);
        typingEntry.timeout = setTimeout(() => {
            typing = typing.filter((element) => element.user.id !== authResponse.user.id);
            usernames = typing.map((object) => object.user.username);
            
            io.emit("typing", usernames);
        }, 3000);
        
        foundIndex = typing.findIndex((element) => +element.user.id === +authResponse.user.id);
        typing[foundIndex] = typingEntry;
    });

    socket.on("change-request", (username) => {
        const authResponse = authorizeSocket(socket.user.token);
        if(authResponse.error) return socket.emit("error", authResponse.error);

        const changeResponse = changeUsername(socket, username);

        if(changeResponse.error) return socket.emit("error", changeResponse.error);
        return socket.emit("change-response", changeResponse);
    });
};

const authorizeSocket = (token) => {
    const res = {
        error: null,
        user: null
    };

    if(token == null) {
        res.error = "Invalid/no token provided!";
        return res;
    }
    
    jwt.verify(token, secret, (error, user) => {
        if(error) {
            res.error = "Unauthorized token provided!";
        } else {
            res.user = user
            res.user.token = token;
        }
    });

    return res;
};

module.exports = {
    port,
    serveHome,
    serveChat,
    login,
    register,
    changeUsername,
    deleteMessage,
    authorizeUser,
    onConnection
};