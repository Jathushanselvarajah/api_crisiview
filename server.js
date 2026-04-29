import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { sequelize } from './db.js';
import './models.js';

import technicienRoutes from './routes/technicien.routes.js';
import incidentRoutes from './routes/incident.routes.js';
import interventionRoutes from './routes/intervention.routes.js';

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.use('/techniciens', technicienRoutes);
app.use('/incidents', incidentRoutes);
app.use('/interventions', interventionRoutes);

async function start() {
    try {
        await sequelize.authenticate();
        await sequelize.sync();
        console.log('Database connected');

        const port = process.env.PORT || 3001;
        app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
    } catch (err) {
        console.error(err);
    }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    start();
}

export { app, start };
