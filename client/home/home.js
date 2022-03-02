const htmlBody = document.body;

const startChatting = document.getElementById("start-chatting");
const overlay = document.getElementById("overlay");

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

const inputs = [registerFirst, registerLast, registerEmail, registerUsername, registerPassword, registerConfirmPassword];

const validator = new UnderageValidate({
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

const checkLoggedIn = () => {
    if(localStorage.getItem("token")) {
        window.location.replace("/chat");
    }
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
}

startChatting.addEventListener("click", (event) => {
    showRegister()
});

overlay.addEventListener("click", (event) => {
    hideForms();
});

inputs.forEach(input => {
    input.addEventListener("input", () => validator.validateField(input.id));
});

registerForm.addEventListener("submit", async (event) => {
    register(event)
});

loginForm.addEventListener("submit", async (event) => {
    loginEvent(event);
});

window.onload = checkLoggedIn;

const register = (event) => {
    event.preventDefault();
    
    if(!validator.validate()) return;
    
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
            console.log(error);
            alert(error.response.data);
        });
};

const loginEvent = (event) => {
    event.preventDefault();
    
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
            console.log(error);
            alert(error.response.data);
        });
};

const login = (token) => {
    localStorage.setItem("token", token);
    window.location.replace("/chat");
}