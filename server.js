require('dotenv').config();

const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const { Filter } = require('bad-words');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const db = require('./db');

const apodCache = new Map();
const TODAY_MAX_AGE = 60 * 60 * 1000;
const MAX_CACHE_SIZE = 100;

const filter = new Filter();
const app = express();

app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            imgSrc: [
                "'self'",
                'data:',
                'https://assets.science.nasa.gov',
                'https://media0.giphy.com',
                'https://media1.giphy.com',
                'https://media4.giphy.com',
                'https://media.giphy.com',
                'https://tenor.com',
                'https://media.tenor.com'
            ]
        }
    }
}));

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOG_FILE = path.join(__dirname, 'server.log');

let visitorCount = 0;
let MAINTENANCE_MODE = false;

if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 128 * 128) {
    const recentLines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-10);
    fs.writeFileSync(LOG_FILE, recentLines.join('\n'));
}

function validateEntry(name, msg) {
    if (typeof name !== 'string' || typeof msg !== 'string') {
        return 'Name and message must be text.';
    }

    if (name.trim().length < 1 || name.trim().length > 40) {
        return 'Name must be 1 to 40 characters.';
    }

    if (msg.trim().length < 1 || msg.trim().length > 280) {
        return 'Message must be 1 to 280 characters.';
    }

    return null;
}

function validateApodDate(date) {
    if (date === undefined) return null;

    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return 'Date must look like YYYY-MM-DD.';
    }

    const parsed = new Date(date + 'T00:00:00Z');

    if (isNaN(parsed) || parsed.toISOString().slice(0, 10) !== date) {
        return 'That is not a real date.';
    }

    if (date < '1995-06-16') {
        return 'The first picture is from 1995-06-16.';
    }

    const today = new Date().toISOString().slice(0, 10);

    if (date > today) {
        return 'That date is in the future.';
    }

    return null;
}

// MIDDLEWARE SETUP

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req, res, next) => {
    const logLine = `[${new Date().toISOString()}] ${req.method} ${req.path}\n`;

    console.log(logLine.trim());

    fs.appendFile(LOG_FILE, logLine, (err) => {
        if (err) console.error('Log write failed:', err);
    });

    next();
});

const limiter = rateLimit({
    windowMs: 10 * 1000,
    limit: 100,
    message: '<h1>429 Too Many Requests</h1><p>Please wait 10 seconds.</p>'
});

app.use(limiter);

app.use((req, res, next) => {
    if (MAINTENANCE_MODE) {
        return res.status(503).send(
            '<h1>503 Service Unavailable</h1><p>The site is currently down for maintenance. Please check back later.</p>'
        );
    }

    next();
});

app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 15 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax'
    }
}));

function requireAuth(req, res, next) {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }

    next();
}

// ROUTES

app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello, world!' });
});

app.get('/api/stats', (req, res) => {
    res.json({ visitorCount });
});

app.post('/login', (req, res) => {
    const { password, rememberMe } = req.body;

    if (password === process.env.APP_PASSWORD && process.env.APP_PASSWORD) {
        req.session.isAuthenticated = true;

        if (rememberMe) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        }

        return req.session.save((err) => {
            if (err) {
                console.error('Login session error:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Could not complete login.'
                });
            }

            res.status(200).json({ success: true });
        });
    }

    return res.status(401).json({
        success: false,
        error: 'Incorrect password.'
    });
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout session error:', err);
            return res.status(500).json({ error: 'Could not log out.' });
        }

        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// DASHBOARD

app.get('/dashboard', requireAuth, (req, res, next) => {
    const dashboardPath = path.join(PUBLIC_DIR, 'dashboard.html');

    res.sendFile(dashboardPath, (err) => {
        if (!err) return;

        console.error('Dashboard page error:', err);

        if (res.headersSent) return next(err);

        res.status(err.statusCode || 500).send(
            'Dashboard could not load. Check that public/dashboard.html exists.'
        );
    });
});

// PROJECTS

app.get('/projects', (req, res, next) => {
    visitorCount++;

    console.log(`Visit #${visitorCount}: someone viewed the projects page`);

    const projectsPath = path.join(PUBLIC_DIR, 'projects.html');

    res.sendFile(projectsPath, (err) => {
        if (!err) return;

        console.error('Projects page error:', err);

        if (res.headersSent) return next(err);

        res.status(err.statusCode || 500).send(
            'Projects could not load. Check that public/projects.html exists.'
        );
    });
});

app.get('/api/whoami', (req, res) => {
    res.json({
        loggedIn: !!req.session.isAuthenticated
    });
});

app.get('/guestbook', requireAuth, (req, res, next) => {
    res.sendFile(path.join(PUBLIC_DIR, 'guestbook.html'), (err) => {
        if (err) next(err);
    });
});

// READ ALL GUESTBOOK ENTRIES

app.get('/api/guestbook', requireAuth, async (req, res, next) => {
    try {
        const entries = await db.getAllEntries();
        res.json(entries);
    } catch (err) {
        next(err);
    }
});

app.get('/api/headers-demo', (req, res) => {
    res.set('X-Student-Name', 'Your Name Here');

    res.json({
        browser: req.get('User-Agent'),
        languages: req.get('Accept-Language'),
        allRequestHeaders: req.headers
    });
});

// SPACE / NASA PICTURE OF THE DAY

app.get('/api/space', async (req, res, next) => {
    try {
        const { date } = req.query;
        const dateError = validateApodDate(date);

        if (dateError) {
            return res.status(400).json({ error: dateError });
        }

        const cacheKey = date || 'today';
        const cached = apodCache.get(cacheKey);

        const isFresh = cacheKey !== 'today' ||
            (cached && Date.now() - cached.savedAt < TODAY_MAX_AGE);

        if (cached && isFresh) {
            console.log('Cache hit:', cacheKey);
            return res.json(cached.data);
        }

        if (!process.env.NASA_API_KEY) {
            return res.status(500).json({
                error: 'NASA_API_KEY is missing from environment variables.'
            });
        }

        let address = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic/';

        if (date) {
            const shortDate = date.slice(2).replaceAll('-', '');
            address += shortDate;
        }

        const nasaUrl = new URL(address);
        nasaUrl.searchParams.set('api_key', process.env.NASA_API_KEY);

        let nasaResponse;

        try {
            nasaResponse = await fetch(nasaUrl, {
                signal: AbortSignal.timeout(8000)
            });
        } catch (err) {
            return res.status(502).json({
                error: 'Could not reach NASA. Try again later.'
            });
        }

        if (nasaResponse.status === 404) {
            return res.status(404).json({
                error: 'NASA has no picture for that date.'
            });
        }

        if (!nasaResponse.ok) {
            console.error('NASA error:', nasaResponse.status);

            return res.status(502).json({
                error: 'NASA could not send a picture right now.'
            });
        }

        const data = await nasaResponse.json();
        const picture = Array.isArray(data) ? data[0] : data;

        if (!picture) {
            return res.status(404).json({
                error: 'NASA has no picture for that date.'
            });
        }

        const result = {
            title: picture.title,
            date: picture.date,
            imageUrl: picture.hdurl || picture.url,
            description: picture.alt || picture.explanation || '',
            nasaPage: picture.permalink || picture.url || ''
        };

        if (apodCache.size >= MAX_CACHE_SIZE && !apodCache.has(cacheKey)) {
            const oldestKey = apodCache.keys().next().value;
            apodCache.delete(oldestKey);
        }

        apodCache.set(cacheKey, {
            data: result,
            savedAt: Date.now()
        });

        res.json(result);
    } catch (err) {
        next(err);
    }
});

// GUESTBOOK: CREATE

app.post('/api/guestbook', requireAuth, async (req, res, next) => {
    try {
        const { name, msg } = req.body;
        const error = validateEntry(name, msg);

        if (error) {
            return res.status(400).json({ error });
        }

        const cleanedInput = msg.replace(/\s+/g, ' ').trim();

        if (filter.isProfane(cleanedInput.replace(/\s/g, ''))) {
            return res.status(400).json({
                error: 'Profanity is not allowed.'
            });
        }

        const entry = await db.addEntry({
            name: name.trim(),
            msg: cleanedInput
        });

        res.status(201).json(entry);
    } catch (err) {
        next(err);
    }
});

// GUESTBOOK: READ ONE

app.get('/api/guestbook/:id', requireAuth, async (req, res, next) => {
    try {
        const entry = await db.getEntryById(req.params.id);

        if (!entry) {
            return res.status(404).json({ error: 'Entry not found.' });
        }

        res.json(entry);
    } catch (err) {
        next(err);
    }
});

// GUESTBOOK: UPDATE

app.put('/api/guestbook/:id', requireAuth, async (req, res, next) => {
    try {
        const { name, msg } = req.body;
        const error = validateEntry(name, msg);

        if (error) {
            return res.status(400).json({ error });
        }

        const cleanedInput = msg.replace(/\s+/g, ' ').trim();

        if (filter.isProfane(cleanedInput.replace(/\s/g, ''))) {
            return res.status(400).json({
                error: 'Profanity is not allowed.'
            });
        }

        const updated = await db.updateEntry(req.params.id, {
            name: name.trim(),
            msg: cleanedInput
        });

        if (!updated) {
            return res.status(404).json({ error: 'Entry not found.' });
        }

        res.json(updated);
    } catch (err) {
        next(err);
    }
});

// GUESTBOOK: DELETE

app.delete('/api/guestbook/:id', requireAuth, async (req, res, next) => {
    try {
        const deleted = await db.deleteEntry(req.params.id);

        if (!deleted) {
            return res.status(404).json({ error: 'Entry not found.' });
        }

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

// STATIC FILES

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }

    res.status(404).sendFile(
        path.join(PUBLIC_DIR, '404.html'),
        (err) => {
            if (err && !res.headersSent) {
                res.status(404).send('Page not found.');
            }
        }
    );
});

// ERROR HANDLER

app.use((err, req, res, next) => {
    const time = new Date().toISOString();

    console.error(`[${time}] ERROR ${req.method} ${req.path}`, err);

    fs.appendFile(
        LOG_FILE,
        `[${time}] ERROR ${req.method} ${req.path}: ${err.message}\n`,
        () => { }
    );

    if (res.headersSent) return next(err);

    const status = err.status || 500;
    const message = status < 500
        ? err.message
        : 'Something went wrong on our end.';

    if (req.path.startsWith('/api/')) {
        return res.status(status).json({ error: message });
    }

    res.status(status).send(
        '<h1>Something went wrong</h1><p>Please try again later.</p><a href="/">Back to home</a>'
    );
});

app.listen(PORT, () => {
    console.log(`Server live on port ${PORT}`);
});