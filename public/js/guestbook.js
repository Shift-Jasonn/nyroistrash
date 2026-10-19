async function loadMessages() {
    const response = await fetch('/api/guestbook');
    const messages = await response.json();


    const list = document.querySelector('#guestbook-list');
    list.innerHTML = '';

    [...messages].reverse().forEach(message => {
        const li = document.createElement('li');

        const name = document.createElement('strong');
        name.textContent = message.name;

        const date = document.createElement('small');
        date.textContent = new Date(message.createdAt).toLocaleString();

        const msg = document.createElement('p');
        msg.textContent = message.msg;

        li.append(name, ' ', date, msg);
        list.append(li);
    });


}

document.querySelector('#guestbook-form').addEventListener('submit', async (e) => {
    e.preventDefault();


    const errorBox = document.querySelector('#form-error');
    errorBox.textContent = '';

    const response = await fetch('/api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: document.querySelector('#name').value,
            msg: document.querySelector('#msg').value
        })
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        errorBox.textContent = data.error || `Server error: ${response.status} `;
        console.log('Guestbook error:', response.status, data);
        return;
    }

    e.target.reset();
    loadMessages();


});

loadMessages();
