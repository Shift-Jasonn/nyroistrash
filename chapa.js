const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const status = document.querySelector('#status');
const loginSection = document.querySelector('#login-section');
const homeContent = document.querySelector('#home-content');
const logoutButton = document.querySelector('#logout-button');

async function checkAuthState() {
    try {
        const response = await fetch('/api/whoami');
        const data = await response.json();

        if (data.loggedIn) {
            status.textContent = '';

            const heading = document.createElement('h1');
            heading.textContent = `Welcome back, ${data.username}!`;
            status.append(heading);

            loginSection.hidden = true;
            homeContent.hidden = false;
            logoutButton.hidden = false;
        } else {
            status.innerHTML = '<h1>Welcome!</h1>';
            loginSection.hidden = false;
            homeContent.hidden = true;
            logoutButton.hidden = true;
        }
    } catch (error) {
        status.innerHTML = '<h1>Welcome!</h1>';
        loginSection.hidden = false;
        homeContent.hidden = true;
        logoutButton.hidden = true;
    }
}

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginMessage.textContent = '';

    const username = document.querySelector('#username').value;
    const password = document.querySelector('#password').value;
    const rememberMe = event.target.rememberMe.checked;

    try {
        const response = await fetch(loginForm.action, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                password,
                rememberMe
            })
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success) {
            loginForm.reset();
            window.location.href = data.redirect || '/';
        } else {
            loginMessage.textContent =
                data.error || 'Login failed. Please try again.';
        }
    } catch (error) {
        loginMessage.textContent =
            'Could not reach the server. Check your connection.';
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        const response = await fetch('/logout', {
            method: 'POST'
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success) {
            window.location.href = '/';
        }
    } catch (error) {
        loginMessage.textContent =
            'Could not log out. Please try again.';
    }
});

checkAuthState();