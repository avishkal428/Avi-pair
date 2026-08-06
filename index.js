const express = require('express');
const app = express();

// Heroku විසින් ලබාදෙන Dynamic Port එක භාවිතා කිරීම අනිවාර්ය වේ
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Basic Route
app.get('/', (req, res) => {
    res.send('Server is running successfully!');
});

// Pair Code Route (ඔබගේ අවශ්‍යතාවය අනුව Function එක ලියන්න)
app.get('/pair', (req, res) => {
    const number = req.query.number;
    if (!number) {
        return res.status(400).json({ error: 'Phone number is required' });
    }
    // මෙතැනට ඔබගේ Pairing Logic එක එකතු කරන්න
    res.json({ message: `Pairing code requested for ${number}` });
});

// Global Error Handler (App එක crash වීම වැළැක්වීමට)
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
