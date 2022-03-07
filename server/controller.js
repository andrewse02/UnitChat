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

let io;

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

        const matches = await bcrypt.compareSync(password, dbRes[0][0].password);
        if(!matches) return res.status(401).send("Username or password is incorrect!");

        const censored = {...dbRes[0][0]};
        delete censored.password;

        return res.status(200).send(jwt.sign(censored, secret));
    })
    .catch((error) => {
        console.log(error);
        return res.sendStatus(500);
    });
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

    let shouldError = false;
    sequelize.query(`
    SELECT email, username FROM users
    WHERE lower(email) = ${email.toLowerCase()} OR lower(username) = ${username.toLowerCase()};`)
    .then((dbRes) => {
        if(dbRes[0][0] && dbRes[0][0].email) return res.status(409).send("Email already in use!");
        if(dbRes[0][0] && dbRes[0][0].username) return res.status(409).send("Username already taken!");
    })
    .catch((error) => {
        console.log(error);
        shouldError = true;
    });

    if(shouldError) return res.sendStatus(500);

    sequelize.query(`
    INSERT INTO users(first_name, last_name, email, username, password, joined)
    VALUES(${first}, ${last}, ${email}, ${username}, '${password}', NOW())
    RETURNING *;`)
    .then((dbRes) => {
        const censored = {...dbRes[0][0]};
        delete censored.password;
        const newUser = jwt.sign(censored, secret);
        
        sequelize.query(`
        INSERT INTO group_users (group_id, user_id, permission_level, joined)
        VALUES(1, ${dbRes[0][0].user_id}, 1, NOW());`)
        .then(() => {
            return res.status(200).send(newUser);
        })
        .catch((error) => {
            shouldError = true;
        });

    })
    .catch((error) => {
        console.log(error);
        return res.sendStatus(500);
    });

    if(shouldError) return res.sendStatus(500);
};

const changeUsername = (socket, username) => {
    if(!username) return { error: "No username input!" };

    const foundIndex = users.findIndex((user) => +user.id === +socket.user.user_id);

    if(!users[foundIndex]) return { error: "User not found!" };
    
    users[foundIndex].username = username;
    const newToken = jwt.sign(users[foundIndex], secret);
    users[foundIndex].token = newToken;
    socket.user = users[foundIndex];

    const { token, password, ...censored } = socket.user;
    return censored;
};

const getConversations = (req, res) => {
    sequelize.query(`
    SELECT g.group_id, g.name, u.user_id
    FROM groups g, group_users u
    WHERE g.group_id = u.group_id AND u.user_id = ${req.user.user_id};`)
    .then((dbRes) => {
        const data = dbRes[0].map(row => {
            return { group_id: row.group_id, group_name: row.name, user_id: row.user_id };
        });
        return res.status(200).send(data);
    })
    .catch((error) => {
        console.log(error);
        return res.sendStatus(500);
    });
};

const getMessages = async (req, res) => {
    const { id } = req.params;
    if(!id) return res.status(400).send("Group ID missing!");

    let inGroup;
    let shouldError = false;

    await sequelize.query(`
    SELECT * FROM group_users WHERE
    group_id = ${id} AND user_id = ${req.user.user_id};
    `).then((dbRes) => {
        inGroup = dbRes[0].length > 0;
    })
    .catch((error) => {
        console.log(error);
        shouldError = true;
    });
    
    if(shouldError) return res.sendStatus(500);
    if(!inGroup) return res.status(403).send("You are not in this group!");

    sequelize.query(`
    SELECT * FROM messages
    WHERE message_id IN(
        SELECT message_id FROM group_messages
        WHERE group_id = ${id}
    );`)
    .then((dbRes) => {
        return res.status(200).send(dbRes[0]);
    })
    .catch((error) => {
        console.log(error);
        return res.sendStatus(500);
    });
};

const deleteMessage = async (socket, id) => {
    if (!id) return socket.emit("error", "ID not input!");

    sequelize.query(`
    DELETE FROM messages
    WHERE message_id = ${id} AND user_id = ${socket.user.user_id}
    RETURNING *;`)
    .then((dbRes) => {
        io.emit("delete", dbRes[0][0]);
    })
    .catch((error) => {
        console.log(error);
        socket.emit("error", error);
    });
};

const checkAuth = (req, res) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token == null) return res.status(200).send(false);

    jwt.verify(token, secret, (error, user) => {
        if (error) return res.status(200).send(false);

        res.status(200).send(!!user);
    });
}

const authorizeUser = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token == null) return res.status(401).send("No token provided!");

    jwt.verify(token, secret, (error, user) => {
        if(error) {
            return res.status(403).send("Unauthorized token provided!");
        }
        
        req.user = user;
        next();
    });
};

const onConnection = (socket) => {
    io = require("./index.js").io;

    console.log("A client has connected.");
    
    socket.on("auth-request", async (recievedToken) => {
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

    socket.on("message-request", (groupId, message) => {
        const authResponse = authorizeSocket(socket.user.token);
        if(authResponse.error) return socket.emit("error", authResponse.error);

        const newMessage = {
            username: socket.user.username,
            userId: socket.user.user_id,
            text: message,
            created: new Date(Date.now()).toString(),
        };

        sequelize.query(`
        INSERT INTO messages (username, user_id, text, created)
        VALUES(${sequelize.escape(newMessage.username)}, ${newMessage.userId}, ${sequelize.escape(newMessage.text)}, NOW())
        RETURNING *;`)
        .then((dbRes) => {
            sequelize.query(`
            INSERT INTO group_messages (group_id, message_id)
            VALUES(${groupId}, ${dbRes[0][0].message_id});`)
            .catch((error) => {
                console.log(error);
                socket.emit("error", error);
            });

            socket.broadcast.emit("message", { id: dbRes[0][0].message_id, ...newMessage });
        })
        .catch((error) => {
            console.log(error);
            socket.emit("error", error);
        });
    });

    socket.on("delete-request", async (id) => {
        const authResponse = authorizeSocket(socket.user.token);
        if(authResponse.error) return socket.emit("error", authResponse.error);

        await deleteMessage(socket, id);
        socket.broadcast.emit("delete", id);
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
    getConversations,
    getMessages,
    deleteMessage,
    checkAuth,
    authorizeUser,
    onConnection
};