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
        if(dbRes[0][0] && dbRes[0][0].email) return res.status(409).send("Email already taken!");
        if(dbRes[0][0] && dbRes[0][0].username) return res.status(409).send("Username already taken!");
    })
    .catch((error) => {
        console.log(error);
        shouldError = true;
    });

    if(shouldError) return res.sendStatus(500);

    sequelize
        .query(
            `
    INSERT INTO users(first_name, last_name, email, username, password, profile_pic, joined)
    VALUES(${first}, ${last}, ${email}, ${username}, '${password}', 'https://avatars.dicebear.com/api/initials/${username.replace(/\'/g, "")}.svg' , NOW())
    RETURNING *;`
        )
        .then((dbRes) => {
            const censored = { ...dbRes[0][0] };
            delete censored.password;
            const newUser = jwt.sign(censored, secret);

            sequelize
                .query(
                    `
        INSERT INTO group_users (group_id, user_id, permission_level, joined)
        VALUES(1, ${dbRes[0][0].user_id}, 1, NOW());`
                )
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

const getUser = async (req, res) => {
    const {password, token, ...censored} = req.user;
    res.status(200).send(censored);
};

const getUsers = async (req, res) => {
    let { username } = req.query;
    if(!username || username === "") return res.status(200).send([]);
    
    let result;

    await sequelize.query(`
    SELECT username, profile_pic FROM users
    WHERE lower(username) LIKE ${sequelize.escape("%" + username.toLowerCase() + "%")};`)
    .then((dbRes) => {
        result = dbRes[0];
    })
    .catch((error) => {
        return res.sendStatus(500);
    });

    if(result) res.status(200).send(result);
};

const getProfilePicture = async (req, res) => {
    const { id } = req.params;
    if(!id) return res.status(400).send("Missing user ID!");

    let result;
    await sequelize.query(`
    SELECT profile_pic FROM users
    WHERE user_id = ${id};`)
    .then((dbRes) => {
        result = dbRes[0][0].profile_pic;
    })
    .catch((error) => {
        return res.sendStatus(500)
    });

    if(result) res.status(200).send(result);
};

const getConversations = (req, res) => {
    sequelize.query(`
    SELECT g.group_id, g.name, g.private, u.user_id
    FROM groups g, group_users u
    WHERE g.group_id = u.group_id AND u.user_id = ${req.user.user_id};`)
    .then((dbRes) => {
        const data = dbRes[0].map(row => {
            return { group_id: row.group_id, group_name: row.name, private: row.private, user_id: row.user_id };
        });
        return res.status(200).send(data);
    })
    .catch((error) => {
        console.log(error);
        return res.sendStatus(500);
    });
};

const getConversationUsers = async (req, res) => {
    const { id } = req.params;
    if(!id) return res.status(400).send("Group ID missing!")
    
    let result;
    let shouldError = false;

    await sequelize.query(`
    SELECT * FROM users
    WHERE user_id IN(
        SELECT user_id FROM group_users
        WHERE group_id = ${id});`)
    .then((dbRes) => {
        result = dbRes[0];
    })
    .catch((error) => {
        console.log(error);
        shouldError = true;
        return res.sendStatus(500);
    });
    if(shouldError) return;

    res.status(200).send(result);
};

const createConversation = async (req, res) => {
    let { username } = req.body;
    let id;
    let group_id;
    if(!username) return res.status(400).send("Missing username!")
    if(username.toLowerCase() === req.user.username.toLowerCase()) return res.status(400).send("You can't create a conversation with yourself!");

    let result;
    let shouldError = false;

    await sequelize.query(`
    SELECT username, user_id FROM users
    WHERE lower(username) = ${sequelize.escape(username.toLowerCase())};`)
    .then((dbRes) => {
        if(dbRes[0].length < 1) {
            shouldError = true;
            return res.status(404).send("Could not find user!");
        }

        id = dbRes[0][0].user_id;
        username = dbRes[0][0].username;
    })
    .catch((error) => {
        console.log(error);
        shouldError = true;
        return res.sendStatus(500)
    });
    if(shouldError) return;

    await sequelize.query(`
    SELECT * FROM group_users
    WHERE user_id in (${req.user.user_id}, ${id}) AND NOT group_id = 1`)
    .then((dbRes) => {
        if(dbRes[0].length <= 1) return
        shouldError = true
        return res.status(409).send("Group already exists!");
    })
    .catch((error) => {
        console.log(error);
        shouldError = true;
        return res.sendStatus(500)
    });
    if(shouldError) return;
    
    await sequelize.query(`
    INSERT INTO groups (name, private, created)
    VALUES('${sequelize.escape(req.user.username).replace(/\'/g, "")},${sequelize.escape(username).replace(/\'/g, "")}', true, NOW())
    RETURNING *;`)
    .then((dbRes) => {
        result = dbRes[0][0];
        groupId = dbRes[0][0].group_id;
    })
    .catch((error) => {
        console.log(error);
        shouldError = true;
        return res.sendStatus(500)
    });
    if(shouldError) return;

    await sequelize.query(`
    INSERT INTO group_users (group_id, user_id, permission_level, joined)
        VALUES(${groupId}, ${req.user.user_id}, 1, NOW()),
        (${groupId}, ${id}, 1, NOW());`)
    .catch((error) => {
        console.log(error);
        shouldError = true;
        return res.sendStatus(500);
    });
    if(shouldError) return;

    for(const [_, socket] of io.of("/").sockets) {
        if(+socket.user.user_id !== +id) continue;
        socket.emit("conversation");
    }
    
    return res.status(200).send(result);
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

const editMessage = async (socket, message) => {
    if (!message.message_id) return socket.emit("error", "ID not input!");
    if (!message.text) return socket.emit("error", "Text not input!");

    await sequelize.query(`
    UPDATE messages
    SET text = ${sequelize.escape(message.text)}
    WHERE message_id = ${message.message_id} AND user_id = ${socket.user.user_id}
    RETURNING *;`)
    .then((dbRes) => {
        if(!dbRes[0][0]) return socket.emit("error", "You did not send this message!");
        io.emit("edit", dbRes[0][0]);
    })
    .catch((error) => {
        console.log(error);
        socket.emit("error", error);
    });
};

const deleteMessage = async (socket, id) => {
    if (!id) return socket.emit("error", "ID not input!");

    await sequelize.query(`
    DELETE FROM messages
    WHERE message_id = ${id} AND user_id = ${socket.user.user_id}
    RETURNING *;`)
    .then((dbRes) => {
        if(!dbRes[0][0]) return socket.emit("error", "You did not send this message!");
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
    
    socket.on("auth", async (recievedToken) => {
        const authResponse = authorizeSocket(recievedToken);
        if (authResponse.error) {
            socket.emit("error", authResponse.error);
            return socket.disconnect(true);
        }

        if(!authResponse.user) return;

        socket.user = authResponse.user;
        const { token, password, ...censored } = authResponse.user;
        socket.emit("auth", { error: null, user: censored});
    });

    socket.on("message", (groupId, message) => {
        const authResponse = authorizeSocket(socket.user.token);
        if(authResponse.error) return socket.emit("error", authResponse.error);

        const newMessage = {
            username: socket.user.username,
            user_id: socket.user.user_id,
            text: message,
            created: new Date(Date.now()).toString(),
        };

        sequelize.query(`
        INSERT INTO messages (username, user_id, text, created)
        VALUES(${sequelize.escape(newMessage.username)}, ${newMessage.user_id}, ${sequelize.escape(newMessage.text)}, NOW())
        RETURNING *;`)
        .then((dbRes) => {
            sequelize.query(`
            INSERT INTO group_messages (group_id, message_id)
            VALUES(${groupId}, ${dbRes[0][0].message_id});`)
            .catch((error) => {
                console.log(error);
                socket.emit("error", error);
            });

            socket.broadcast.emit("message", { message_id: dbRes[0][0].message_id, ...newMessage });
        })
        .catch((error) => {
            console.log(error);
            socket.emit("error", error);
        });
    });

    socket.on("edit", async (message) => {
        const authResponse = authorizeSocket(socket.user.token);
        if(authResponse.error) return socket.emit("error", authResponse.error);

        await editMessage(socket, message);
        socket.broadcast.emit("edit", id);
    });

    socket.on("delete", async (id) => {
        const authResponse = authorizeSocket(socket.user.token);
        if(authResponse.error) return socket.emit("error", authResponse.error);

        await deleteMessage(socket, id);
        socket.broadcast.emit("delete", id);
    });

    socket.on("typing", async (groupId) => {
        const authResponse = authorizeSocket(socket.user.token);
        if(authResponse.error) return socket.emit("error", authResponse.error);
        
        const typingEntry = { data: {user: authResponse.user, group: +groupId} };
        
        let foundIndex = typing.findIndex((element) => +element.data.user.id === +authResponse.user.id);

        if (!typing[foundIndex]) {
            typingEntry.timeout = setTimeout(() => {
                typing = typing.filter((element) => element.data.user.id !== authResponse.user.id);
                const result = typing.map((object) => object.data);

                io.emit("typing", result);
            }, 5000);
            typing.push(typingEntry);
            const result = typing.map((object) => object.data);
            return io.emit("typing", result);
        }

        let result = typing.map((object) => object.data);
        clearTimeout(typing[foundIndex].timeout);
        typingEntry.timeout = setTimeout(() => {
            typing = typing.filter((element) => element.user.id !== authResponse.user.id);
            result = typing.map((object) => object.data);
            
            io.emit("typing", result);
        }, 5000);
        
        foundIndex = typing.findIndex((element) => +element.data.user.id === +authResponse.user.id);
        typing[foundIndex] = typingEntry;
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
    getUser,
    getUsers,
    getProfilePicture,
    getConversations,
    getConversationUsers,
    createConversation,
    getMessages,
    editMessage,
    deleteMessage,
    checkAuth,
    authorizeUser,
    onConnection
};