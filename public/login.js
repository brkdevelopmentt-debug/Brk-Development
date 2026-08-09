document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const alertBox = document.getElementById('alertBox');

    function showAlert(msg, isError = true) {
        if (!alertBox) return alert(msg);
        alertBox.style.display = 'block';
        alertBox.className = isError ? 'alert alert-danger' : 'alert alert-success';
        alertBox.innerText = msg;
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await res.json();

                if (res.ok && data.token) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    showAlert('Giriş başarılı, yönlendiriliyorsunuz...', false);
                    setTimeout(() => {
                        window.location.href = '/dashboard.html';
                    }, 800);
                } else {
                    showAlert(data.error || 'Giriş yapılamadı!');
                }
            } catch (err) {
                showAlert('Sunucu hatası oluştu!');
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('regUsername').value;
            const password = document.getElementById('regPassword').value;

            try {
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await res.json();

                if (res.ok && data.token) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    showAlert('Kayıt başarılı, yönlendiriliyorsunuz...', false);
                    setTimeout(() => {
                        window.location.href = '/dashboard.html';
                    }, 800);
                } else {
                    showAlert(data.error || 'Kayıt başarısız!');
                }
            } catch (err) {
                showAlert('Sunucu hatası oluştu!');
            }
        });
    }
});