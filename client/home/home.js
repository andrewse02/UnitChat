const startChatting = document.getElementById("start-chatting");
const overlay = document.getElementById("overlay");

const features = document.getElementById("features-list").querySelectorAll("li");

const loginForm = document.getElementById("login-form");
const loginUsername = document.getElementById("login-username");
const loginPassword = document.getElementById("login-password");

const registerForm = document.getElementById("register-form");
const registerFirst = document.getElementById("register-first-name");
const registerLast = document.getElementById("register-last-name");
const registerEmail = document.getElementById("register-email");
const registerUsername = document.getElementById("register-username");
const registerPassword = document.getElementById("register-password");
const registerConfirmPassword = document.getElementById("register-confirm-password");

const loginInputs = [loginUsername, loginPassword];
const registerInputs = [registerFirst, registerLast, registerEmail, registerUsername, registerPassword, registerConfirmPassword];

AOS.init({
    duration: 1500
});

const loginValidator = new UnderageValidate({
        errorMessageClass: "error",
        errorMessageContainerClass: "error-message-container",
        errorFieldClass: "error"
    })
    .addField(loginUsername.id, {
        required: true,
        message: "This field is required!"
    })
    .addField(loginPassword.id, {
        required: true,
        message: "This field is required!"
    });

const registerValidator = new UnderageValidate({
        errorMessageClass: "error",
        errorMessageContainerClass: "error-message-container",
        errorFieldClass: "error"
    })
    .addField(registerFirst.id, {
        min: 2,
        max: 48,
        required: true,
        message: "Name must be 2-48 characters!"
    })
    .addField(registerLast.id, {
        min: 2,
        max: 48,
        required: true,
        message: "Name must be 2-48 characters!"
    })
    .addField(registerUsername.id, {
        min: 3,
        max: 32,
        required: true,
        message: "Username must be 3-32 characters!"
    })
    .addField(registerEmail.id, {
        email: true,
        required: true,
        message: "Invalid Email!"
    })
    .addField(registerPassword.id, {
        max: 64,
        strongPassword: true,
        required: true,
        message: "Invalid Password! Check requirements!"
    })
    .addField(registerConfirmPassword.id, {
        matching: registerPassword.id,
        required: true,
        message: "Passwords do not match!"
    });

const isLoggedIn = async () => {
    if(!localStorage.getItem("token")) return false;
    let loggedIn = false;

    await axios.get("/auth", {headers: { Authorization: "Bearer " + localStorage.getItem("token") }})
    .then((res) => {
        loggedIn = res.data;
    });

    if(!loggedIn) localStorage.clear();
    return loggedIn;
};

const showRegister = () => {
    loginForm.style.display = "none";
    registerForm.style.display = "flex";
    overlay.style.display = "block";
};

const showLogin = () => {
    registerForm.style.display = "none";
    loginForm.style.display = "flex";
    overlay.style.display = "block";
};

const hideForms = () => {
    registerForm.style.display = "none";
    loginForm.style.display = "none";
    overlay.style.display = "none";

    loginInputs.forEach((input) => {
        input.value = "";
    });

    registerInputs.forEach((input) => {
        input.value = "";
    });
}

startChatting.addEventListener("click", async (event) => {
    if(await isLoggedIn()) return window.location.href = "/chat";
    showRegister();
});

overlay.addEventListener("click", (event) => {
    hideForms();
});

registerInputs.forEach(input => {
    input.addEventListener("input", () => registerValidator.validateField(input.id));
});

registerForm.addEventListener("submit", async (event) => {
    register(event)
});

loginForm.addEventListener("submit", async (event) => {
    loginEvent(event);
});

const register = (event) => {
    event.preventDefault();
    
    if(!registerValidator.validate()) return;
    
    const body = {
        first: registerFirst.value,
        last: registerLast.value,
        email: registerEmail.value,
        username: registerUsername.value,
        password: registerPassword.value
    };

    axios
        .post("/register", body)
        .then((res) => {
            login(res.data);
        })
        .catch((error) => {
            if(error.response.status === 409) {
                if(error.response.message.includes("Email")) return registerValidator.invalidateField(registerEmail.id, "Email already in use!");
                if(error.response.message.includes("Username")) return registerValidator.invalidateField(registerUsername.id, "Username already in use!");
            }

            console.log(error);
            alert(error.response.data);
        });
};

const loginEvent = (event) => {
    event.preventDefault();

    if(!loginValidator.validate()) return;
    
    const body = {
        username: loginUsername.value,
        password: loginPassword.value
    };

    axios
        .post("/login", body)
        .then((res) => {
            login(res.data);
        })
        .catch((error) => {
            if(error.response.status === 400) {
                if(error.response.message.includes("Missing")) {
                    registerValidator.invalidateField(loginUsername.id, "Missing some fields!");
                    return registerValidator.invalidateField(loginPassword.id, "Missing some fields!");
                }
            }

            if(error.response.status === 401) {
                loginValidator.invalidateField(loginUsername.id, "Username or password is incorrect!");
                return loginValidator.invalidateField(loginPassword.id, "Username or password is incorrect!");
            }

            console.log(error);
            alert(error.response.data);
        });
};

const login = (token) => {
    localStorage.setItem("token", token);
    window.location.replace("/chat");
}

const checkTheme = async () => {
    if (localStorage.getItem("token")) {
        await axios.get("/user", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } })
            .then((res) => {
                if (res.data.username.toLowerCase().includes("joely") || res.data.username.toLowerCase().includes("vernier") || res.data.username.toLowerCase().includes("vernionator")) {
                    document.documentElement.style.setProperty("--color-primary", "#FF1F1F");
                    document.documentElement.style.setProperty("--color-highlight1", "#830000");
                }
            })
            .catch((error) => {
                console.log(error);
            });
    }
};

// features.forEach((feature) => {
//     const img = feature.querySelector("div");

//     feature.addEventListener("mouseenter", (event) => {
//         img.classList.remove("hide");
//         img.classList.add("reveal");
//     });

//     feature.addEventListener("mouseleave", (event) => {
//         img.classList.remove("reveal");
//         img.classList.add("hide");
//     });
// });

window.onload = checkTheme;
