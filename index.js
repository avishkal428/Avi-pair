const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8000;

// Import the pair router
const pairRouter = require('./pair');

// Express Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routing for pairing mechanism
app.use('/pair', pairRouter);

// Homepage with Web UI to enter phone number directly
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Avi-Pair | WhatsApp Pairing Code</title>
        <style>
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            body {
                background: #0f172a;
                color: #f8fafc;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                padding: 20px;
            }
            .card {
                background: #1e293b;
                padding: 30px;
                border-radius: 16px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
                width: 100%;
                max-width: 420px;
                text-align: center;
                border: 1px solid #334155;
            }
            h2 {
                color: #38bdf8;
                margin-bottom: 8px;
            }
            p {
                color: #94a3b8;
                font-size: 14px;
                margin-bottom: 24px;
            }
            input {
                width: 100%;
                padding: 14px;
                border-radius: 8px;
                border: 1px solid #475569;
                background: #0f172a;
                color: #fff;
                font-size: 16px;
                margin-bottom: 16px;
                outline: none;
                text-align: center;
            }
            input:focus {
                border-color: #38bdf8;
            }
            button {
                width: 100%;
                padding: 14px;
                border: none;
                border-radius: 8px;
                background: #0284c7;
                color: white;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                transition: 0.3s;
            }
            button:hover {
                background: #0369a1;
            }
            #result {
                margin-top: 20px;
                padding: 12px;
                border-radius: 8px;
                display: none;
                font-weight: bold;
                letter-spacing: 2px;
                font-size: 20px;
            }
            .success {
                background: #064e3b;
                color: #34d399;
                border: 1px solid #059669;
            }
            .error {
                background: #7f1d1d;
                color: #f87171;
                border: 1px solid #dc2626;
            }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>Avi-Pair Generator</h2>
            <p>Enter your phone number with country code (e.g., 94771234567)</p>
            <input type="text" id="number" placeholder="9477XXXXXXX" required />
            <button onclick="getPairCode()" id="btn">Get Pairing Code</button>
            <div id="result"></div>
        </div>

        <script>
            async function getPairCode() {
                const num = document.getElementById('number').value.trim();
                const btn = document.getElementById('btn');
                const resDiv = document.getElementById('result');

                if (!num) {
                    alert('Please enter a valid phone number!');
                    return;
                }

                btn.disabled = true;
                btn.innerText = 'Generating Code...';
                resDiv.style.display = 'none';

                try {
                    const response = await fetch('/pair?number=' + encodeURIComponent(num));
                    const data = await response.json();

                    if (data.code) {
                        resDiv.className = 'success';
                        resDiv.innerText = 'CODE: ' + data.code;
                    } else {
                        resDiv.className = 'error';
                        resDiv.innerText = data.message || 'Error getting code!';
                    }
                } catch (err) {
                    resDiv.className = 'error';
                    resDiv.innerText = 'Server Error. Try again!';
                } finally {
                    resDiv.style.display = 'block';
                    btn.disabled = false;
                    btn.innerText = 'Get Pairing Code';
                }
            }
        </script>
    </body>
    </html>
    `);
});

// Start the Express Server
app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🚀 Avi-Pair Server Running on Port: ${PORT}`);
    console.log(`=================================`);
});
