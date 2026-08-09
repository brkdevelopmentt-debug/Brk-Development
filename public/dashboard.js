document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    async function loadUserData() {
        try {
            const res = await fetch('/api/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                localStorage.removeItem('token');
                window.location.href = '/login.html';
                return;
            }

            const user = await res.json();

            if (document.getElementById('displayUsername')) document.getElementById('displayUsername').innerText = user.username;
            if (document.getElementById('displayApiKey')) document.getElementById('displayApiKey').innerText = user.api_key || 'Yok';
            if (document.getElementById('displayMaxBots')) document.getElementById('displayMaxBots').innerText = user.max_bots;
            if (document.getElementById('displayActiveBots')) document.getElementById('displayActiveBots').innerText = user.used_bots;
        } catch (e) {
            console.error('Veri çekme hatası', e);
        }
    }

    const btnStart = document.getElementById('btnStartBot');
    if (btnStart) {
        btnStart.addEventListener('click', async () => {
            const count = document.getElementById('botCountInput').value;
            const res = await fetch('/api/bot/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ count })
            });
            const data = await res.json();
            alert(data.message || data.error);
            loadUserData();
        });
    }

    const btnStop = document.getElementById('btnStopBot');
    if (btnStop) {
        btnStop.addEventListener('click', async () => {
            const res = await fetch('/api/bot/stop', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            alert(data.message || data.error);
            loadUserData();
        });
    }

    loadUserData();
});