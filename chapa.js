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
            status.innerHTML = '<h1>Welcome back!</h1>';
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

    const password = document.querySelector('#password').value;
    const rememberMe = event.target.rememberMe.checked;

    const response = await fetch(loginForm.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, rememberMe })
    });

    const data = await response.json().catch(() => ({ success: false }));

    if (data.success) {
        loginMessage.textContent = 'Login successful!';
        loginForm.reset();
        await checkAuthState();
        window.location.href = data.redirect || '/';
    } else {
        loginMessage.textContent = data.error || 'Login failed. Please check your password.';
    }
});

logoutButton.addEventListener('click', async () => {
    const response = await fetch('/logout', {
        method: 'POST'
    });

    const data = await response.json().catch(() => ({ success: false }));

    if (data.success) {
        window.location.href = '/';
    }
});

checkAuthState();